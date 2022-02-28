import "reflect-metadata";

// Schema
const keyMetadataKey = Symbol("key");
const unionMetadataKey = Symbol("union");
const messagePackDataKey = Symbol("messagepack");

type AbstractClass = Function & { prototype: any };
type Class = AbstractClass & { new (...args: any[]): {} };

type KeyMetadata = { name: string; objectType: AbstractClass };
type UnionMetadata = {
  classMap: Map<Class, number | string>;
  keyMap: Map<number | string, Class>;
};

export function serialize(obj: object, type?: AbstractClass) {
  if (!obj[messagePackDataKey]) {
    throw new Error("Object is not a messagepack object.");
  }
  return (obj as IMessagePackObject).toArray(type);
}

export function deserialize<T extends AbstractClass | Class>(
  data: any[],
  objectType: T
) {
  const unionMap: Map<AbstractClass, UnionMetadata> = Reflect.getMetadata(
    unionMetadataKey,
    objectType.prototype
  );
  if (unionMap) {
    const unionData = unionMap.get(objectType);

    if (unionData) {
      if (data.length !== 2) {
        throw new Error(
          "Expected a union object, but got data length: " + data.length
        );
      }

      const ctor = unionData.keyMap.get(data[0]);
      return new ctor(data[1]);
    }
  }

  const ctor = <Class>objectType;
  return new ctor(data);
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

export function messagePackUnion(
  key: number | string,
  objectType: AbstractClass
) {
  return (baseType: Class) => {
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
        keyMap: new Map<number | string, Class>(),
        classMap: new Map<Class, number | string>(),
      };
      unionMetaMap.set(objectType, unionData);
    }

    unionData.classMap.set(baseType, key);
    unionData.keyMap.set(key, baseType);
  };
}

interface IMessagePackObject {
  toArray<T extends AbstractClass>(objectType?: T): (type?: T) => any[];
}

export function messagePackObject<T extends Class>(baseType: T) {
  return class extends baseType {
    toArray = function <C extends AbstractClass>(objectType?: C) {
      if (objectType) {
        const unionMetadata: Map<AbstractClass, UnionMetadata> =
          Reflect.getMetadata(unionMetadataKey, this);
        const unionBaseData = unionMetadata && unionMetadata.get(objectType);
        if (unionBaseData) {
          const key = unionBaseData.classMap.get(baseType);
          if (key === undefined) {
            throw new Error("Union class is missing a key!");
          }
          return [key, this.serializeChildren(objectType)];
        }
      }
      return this.serializeChildren(objectType);
    };

    serializeChildren = function <C extends AbstractClass>(objectType?: C) {
      return (<any[]>this[messagePackDataKey]).map((d, index) => {
        if (d && d[messagePackDataKey]) {
          const keyMap = Reflect.getMetadata(
            keyMetadataKey,
            objectType.prototype
          ) as Map<number, KeyMetadata>;
          return d.toArray((<KeyMetadata>keyMap.get(index)).objectType);
        } else {
          return d;
        }
      });
    };

    constructor(...args: any[]) {
      super(...args);
      this[messagePackDataKey] = [];

      const keyMap = Reflect.getMetadata(
        keyMetadataKey,
        baseType.prototype
      ) as Map<number, KeyMetadata>;

      if (keyMap) {
        keyMap.forEach((data: KeyMetadata, index: number) => {
          while (index > this[messagePackDataKey].length - 1) {
            this[messagePackDataKey].push(null);
          }

          if (Object.getOwnPropertyDescriptor(this, data.name)) {
            throw new Error(`Property ${data.name} is already defined.`);
          }

          Object.defineProperty(this, data.name, {
            get: () => this[messagePackDataKey][index],
            set: (value: any) => (this[messagePackDataKey][index] = value),
          });
        });
      }
    }
  };
}
