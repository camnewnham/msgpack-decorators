import "reflect-metadata";
import {
  encode as messagePackEncode,
  decode as messagePackDecode,
} from "@msgpack/msgpack";

const keyMetadataKey = Symbol("key");
const unionMetadataKey = Symbol("union");

type AbstractClass = Function & { prototype: any };
type Class<T> = AbstractClass & { new (...args: any[]): T };

type KeyMetadata = {
  name: string;
  objectType: AbstractClass;
  collectionType?: AbstractClass;
};

type KeyMetaDataMap = {
  map: Map<number | string, KeyMetadata>;
  name: string;
};

type UnionMetadata = {
  prototypeMap: Map<Class<any>, number | string>;
  keyMap: Map<number | string, Class<any>>;
};

export function encode(obj: object, objectType?: AbstractClass) {
  return messagePackEncode(serialize(obj, objectType));
}

export function decode<T>(
  data: ArrayLike<number> | BufferSource,
  objectType: Class<T> | AbstractClass
) {
  return deserialize<T>(messagePackDecode(data), objectType);
}

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
  const keyMap: KeyMetaDataMap = Reflect.getMetadata(keyMetadataKey, baseType);

  keyMap.map.forEach((keyData: KeyMetadata, key: number | string) => {
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

        const UnionConcreteType = unionData.keyMap.get(data[0]);

        if (UnionConcreteType == null) {
          console.warn(
            `Received a union object with a key (${data[0]}) that is not registered for type ${objectType.name}. Was the object produced by an updated schema?`
          );
          return undefined;
        }

        return instantiate(UnionConcreteType, data[1]) as T;
      } else {
        const unionKey = Object.keys(data)[0];
        return instantiate(unionData.keyMap.get(unionKey), data[unionKey]) as T;
      }
    }
  }
  return instantiate(<Class<T>>objectType, data) as T;
}

function isMessagePack(objectType: AbstractClass) {
  return (
    Reflect.hasMetadata(unionMetadataKey, objectType.prototype) ||
    Reflect.hasMetadata(keyMetadataKey, objectType.prototype)
  );
}

function instantiate<T>(type: Class<T>, data: any[] | {}) {
  const obj = new type();
  const keyMetaMap: KeyMetaDataMap = Reflect.getMetadata(
    keyMetadataKey,
    type.prototype
  );

  keyMetaMap.map.forEach((keyData, key) => {
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
    const classType = Reflect.getMetadata("design:type", target, propertyName);

    if (classType === undefined) {
      throw new Error(
        `Type undefined for key ${index} on ${target.prototype}. Are your declarations and imports in the right order?`
      );
    }

    if (
      typeof classType === "function" &&
      classType !== Boolean &&
      classType !== Number &&
      classType !== String &&
      classType !== Object && // Record<string,X>
      classType !== Array // Array[]
    ) {
      if (!isMessagePack(classType)) {
        throw new Error(`Class type ${classType} is not a messagepack type`);
      }
    }

    if (classType === Array || classType === "object") {
      if (collectionType) {
        if (
          collectionType !== Boolean &&
          collectionType !== Number &&
          collectionType !== String
        ) {
          if (!isMessagePack(collectionType)) {
            throw new Error(
              `Collection type ${collectionType} is not a messagepack type`
            );
          }
        }
      } else {
        console.warn(
          `Collection type unspecified on at key ${index} on ${target.constructor.name}. If this collection does not contain primitive values, it will fail to deserialize. To remove this warning, specific the type as @key(x,MyType)`
        );
      }
    }

    let keyMetaMap: KeyMetaDataMap = Reflect.getMetadata(
      keyMetadataKey,
      target
    );

    if (!keyMetaMap) {
      keyMetaMap = {
        map: new Map<number | string, KeyMetadata>(),
        name: target.constructor.name,
      };
      Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
    } else if (keyMetaMap.name !== target.constructor.name) {
      // Moving from parent to child, clone values
      keyMetaMap = {
        map: new Map<number | string, KeyMetadata>(keyMetaMap.map),
        name: target.constructor.name,
      };
      Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
    }

    if (keyMetaMap.map.get(index)) {
      throw new Error(
        `Key (${index}) is already in use on type ${target.constructor.name}`
      );
    }

    keyMetaMap.map.set(index, {
      name: propertyName,
      objectType: classType,
      collectionType: collectionType,
    });
  };
}

export function union(key: number | string, objectType: AbstractClass) {
  return (baseType: Class<any>) => {
    if (objectType === undefined) {
      throw new Error(
        `Type undefined for key ${key} on a union object. Are your declarations and imports in the right order?`
      );
    }

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
