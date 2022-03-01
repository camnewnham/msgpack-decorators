import "reflect-metadata";

const keyMetadataKey = Symbol("key");
const unionMetadataKey = Symbol("union");

type AbstractClass = Function & { prototype: any };
type Class<T> = AbstractClass & { new (...args: any[]): T };

type KeyMetadata = { name: string; objectType: AbstractClass };

type UnionMetadata = {
  prototypeMap: Map<Class<any>, number | string>;
  keyMap: Map<number | string, Class<any>>;
};

export function serialize(obj: object, objectType?: AbstractClass) {
  if (obj == null) return undefined;

  const sourceType = Object.getPrototypeOf(obj);

  if (objectType) {
    const unionMetadata: Map<AbstractClass, UnionMetadata> =
      Reflect.getMetadata(unionMetadataKey, sourceType);
    const unionBaseData = unionMetadata && unionMetadata.get(objectType);

    if (unionBaseData) {
      const key = unionBaseData.prototypeMap.get(sourceType);

      if (key === undefined) {
        throw new Error("Union class is missing a key!");
      }
      if (typeof key === "number") {
        return [key, serializeClass(obj, sourceType)];
      } else {
        return { [key]: serializeClass(obj, sourceType) };
      }
    }
  }
  return serializeClass(obj, sourceType);
}

const serializeClass = function (obj: object, baseType: Class<any>) {
  let result: {} | any[];
  const keyMap = Reflect.getMetadata(keyMetadataKey, baseType) as Map<
    number | string,
    KeyMetadata
  >;

  keyMap.forEach((keyData: KeyMetadata, key: number | string) => {
    const keyValue = obj[keyData.name];

    const serialized = isMessagePack(keyData.objectType)
      ? serialize(keyValue, keyData.objectType)
      : keyValue;

    switch (typeof key) {
      case "number":
        if (result == null) result = [];
        while ((<any[]>result).length < key) {
          (<any[]>result).push(undefined);
        }
        (<any[]>result).push(serialized);
        break;
      case "string":
        if (keyValue != null) {
          if (result == null) result = {};
          result[key] = serialized;
        }
        break;
    }
  });

  return result;
};

export function deserialize<T>(
  data: any[] | {},
  objectType: Class<T> | AbstractClass
) {
  if (data == null) return null;
  const unionMap: Map<AbstractClass, UnionMetadata> = Reflect.getMetadata(
    unionMetadataKey,
    objectType.prototype
  );
  if (unionMap) {
    const unionData = unionMap.get(objectType);

    if (unionData) {
      console.info("Data", data, Array.isArray(data));
      if (Array.isArray(data)) {
        if (data.length !== 2) {
          throw new Error(
            "Expected a union object, but got data length: " + data.length
          );
        }

        return instantiate(<Class<T>>unionData.keyMap.get(data[0]), data[1]);
      } else {
        const unionKey = Object.keys(data)[0];
        return instantiate(unionData.keyMap.get(unionKey), data[unionKey]);
      }
    }
  }

  return instantiate(<Class<T>>objectType, data);
}

function isMessagePack(objectType: AbstractClass) {
  return (
    Reflect.hasMetadata(unionMetadataKey, objectType.prototype) ||
    Reflect.hasMetadata(keyMetadataKey, objectType.prototype)
  );
}

function instantiate<T>(type: Class<T>, data: any[] | {}) {
  const obj = new type();
  const keyMetaMap: Map<number | string, KeyMetadata> = Reflect.getMetadata(
    keyMetadataKey,
    type.prototype
  );

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const keyMeta = keyMetaMap.get(i);
      if (keyMeta) {
        const value = isMessagePack(keyMeta.objectType)
          ? deserialize(data[i], keyMeta.objectType)
          : data[i];

        if (value != null) {
          obj[keyMeta.name] = value;
        }
      }
    }
  } else {
    Object.keys(data).forEach((strKey) => {
      const keyMeta = keyMetaMap.get(strKey);
      if (keyMeta) {
        const value = isMessagePack(keyMeta.objectType)
          ? deserialize(data[strKey], keyMeta.objectType)
          : data[strKey];

        if (value != null) {
          obj[keyMeta.name] = value;
        }
      } else {
        console.warn(
          `Object had key ${strKey} which is not registered for class ${type.name}`
        );
      }
    });
  }

  return obj;
}

export function key(index: number | string) {
  return function (target: any, propertyName: string) {
    let keyMetaMap = Reflect.getMetadata(keyMetadataKey, target);
    if (!keyMetaMap) {
      keyMetaMap = new Map<number | string, KeyMetadata>();
      Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
    }

    const classType = Reflect.getMetadata("design:type", target, propertyName);
    if (keyMetaMap.get(index)) {
      throw new Error(
        `Key (${index}) is already in use on type ${target.constructor.name}`
      );
    }

    keyMetaMap.set(index, {
      name: propertyName,
      objectType: classType,
    });
  };
}

export function union(key: number | string, objectType: AbstractClass) {
  return (baseType: Class<any>) => {
    let unionMetaMap: Map<AbstractClass, UnionMetadata> = Reflect.getMetadata(
      unionMetadataKey,
      objectType.prototype
    );
    if (unionMetaMap == null) {
      unionMetaMap = new Map<AbstractClass, UnionMetadata>();
      Reflect.defineMetadata(
        unionMetadataKey,
        unionMetaMap,
        objectType.prototype
      );
    }

    let unionData = unionMetaMap.get(objectType);
    if (!unionData) {
      unionData = {
        keyMap: new Map<number | string, Class<any>>(),
        prototypeMap: new Map<Class<any>, number | string>(),
      };
      unionMetaMap.set(objectType, unionData);
    }

    unionData.prototypeMap.set(baseType.prototype, key);
    unionData.keyMap.set(key, baseType);
  };
}
