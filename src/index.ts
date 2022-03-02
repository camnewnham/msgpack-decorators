import "reflect-metadata";

const keyMetadataKey = Symbol("key");
const unionMetadataKey = Symbol("union");

type AbstractClass = Function & { prototype: any };
type Class<T> = AbstractClass & { new (...args: any[]): T };

type KeyMetadata = {
  name: string;
  objectType: AbstractClass;
  collectionType?: AbstractClass;
};

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

    const isMessagePackObject = isMessagePack(keyData.objectType);

    if (keyValue != null && !isMessagePackObject && Array.isArray(keyValue)) {
      for (let i = 0; i < keyValue.length; i++) {
        if (keyValue[i] != null) {
          break;
        }
      }
    }

    let serialized: any;
    if (isMessagePack(keyData.objectType)) {
      serialized = serialize(keyValue, keyData.objectType);
    } else if (
      Array.isArray(keyValue) &&
      keyData.collectionType &&
      isMessagePack(keyData.collectionType)
    ) {
      serialized = keyValue.map((k) => serialize(k, keyData.collectionType));
    } else if (
      typeof keyValue === "object" &&
      keyData.collectionType &&
      isMessagePack(keyData.collectionType)
    ) {
      serialized = {};
      Object.keys(keyValue).forEach((k) => {
        serialized[k] = serialize(keyValue[k], keyData.collectionType);
      });
    } else {
      serialized = keyValue;

      if (Array.isArray(serialized)) {
        const itm = serialized[0];
        if (itm && !isPrimitive(itm)) {
          throw new Error(
            "Attempted to serialize an array of objects. Did you for get to add the type to @key(key, ArrayValueType)?"
          );
        }
      } else if (typeof serialized === "object") {
        const keys = Object.keys(serialized);
        if (keys.length > 0) {
          const itm = serialized[keys[0]];
          if (itm && !isPrimitive(itm)) {
            throw new Error(
              "Attempted to serialize a map of objects. Did you for get to add the type to @key(key, MapValueType)?"
            );
          }
        }
      }
    }

    if (result == null) result = typeof key === "number" ? [] : {};

    if (Array.isArray(result)) {
      while ((<any[]>result).length < key) {
        (<any[]>result).push(undefined);
      }
    }

    if (serialized != null) {
      result[key] = serialized;
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

  keyMetaMap.forEach((keyData, key) => {
    const serialized = data[key];
    let value: any;
    if (serialized && isMessagePack(keyData.objectType)) {
      value = deserialize(serialized, keyData.objectType);
    } else if (
      serialized &&
      Array.isArray(serialized) &&
      keyData.collectionType &&
      isMessagePack(keyData.collectionType)
    ) {
      value = serialized.map((k) => deserialize(k, keyData.collectionType));
    } else if (
      serialized &&
      typeof serialized === "object" &&
      keyData.collectionType &&
      isMessagePack(keyData.collectionType)
    ) {
      value = {};
      Object.keys(serialized).forEach((k) => {
        value[k] = deserialize(serialized[k], keyData.collectionType);
      });
    } else {
      value = serialized;
    }

    if (value != null) {
      obj[keyData.name] = value;
    }
  });

  return obj;
}

export function key(index: number | string, collectionType?: AbstractClass) {
  return function (target: any, propertyName: string) {
    let keyMetaMap = Reflect.getMetadata(keyMetadataKey, target);
    if (!keyMetaMap) {
      keyMetaMap = new Map<number | string, KeyMetadata>();
      Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
    }

    if (keyMetaMap.get(index)) {
      throw new Error(
        `Key (${index}) is already in use on type ${target.constructor.name}`
      );
    }

    const classType = Reflect.getMetadata("design:type", target, propertyName);

    keyMetaMap.set(index, {
      name: propertyName,
      objectType: classType,
      collectionType: collectionType,
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

function isPrimitive(arg: any) {
  const type = typeof arg;
  return arg == null || (type != "object" && type != "function");
}
