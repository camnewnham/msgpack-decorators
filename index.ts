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
        return [key, serializeInner(obj, sourceType)];
      } else {
        return { [key]: serializeInner(obj, sourceType) };
      }
    }
  }
  return serializeInner(obj, sourceType);
}

const serializeInner = function <C extends AbstractClass>(
  obj: object,
  baseType: Class<any>
) {
  let result: {} | any[];
  const keyMap = Reflect.getMetadata(keyMetadataKey, baseType) as Map<
    number | string,
    KeyMetadata
  >;

  keyMap.forEach((keyData: KeyMetadata, key: number | string) => {
    const keyValue = obj[keyData.name];

    const serialized =
      typeof keyValue === "object"
        ? serialize(keyValue, keyData.objectType)
        : keyValue;

    switch (typeof key) {
      case "number":
        if (result == null) result = [];
        while ((<any[]>result).length < key) {
          (<any[]>result).push(null);
        }
        (<any[]>result).push(serialized);
        break;
      case "string":
        if (result == null) result = {};
        result[key] = serialized;
        break;
    }
  });

  return result;
};

export function deserialize<T>(
  data: any[] | {},
  objectType: Class<T> | AbstractClass
) {
  const unionMap: Map<AbstractClass, UnionMetadata> = Reflect.getMetadata(
    unionMetadataKey,
    objectType.prototype
  );
  if (unionMap) {
    const unionData = unionMap.get(objectType);

    if (unionData) {
      if (Array.isArray(data)) {
        if (data.length !== 2) {
          throw new Error(
            "Expected a union object, but got data length: " + data.length
          );
        }

        return instantiate(<Class<T>>unionData.keyMap.get(data[0]), data);
      } else {
        const unionKey = Object.keys(data)[0];
        return instantiate(
          <Class<T>>objectType,
          unionData.keyMap.get(unionKey)
        );
      }
    }
  }

  return instantiate(<Class<T>>objectType, data);
}

function instantiate<T>(type: Class<T>, data: any[] | {}) {
  const obj = new type();

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
