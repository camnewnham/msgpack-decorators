import "reflect-metadata";
declare type AbstractClass = Function & {
    prototype: any;
};
declare type Class<T> = AbstractClass & {
    new (...args: any[]): T;
};
export declare function encode(obj: object, objectType?: AbstractClass): Uint8Array;
export declare function decode<T>(data: ArrayLike<number> | BufferSource, objectType: Class<T> | AbstractClass): any;
export declare function serialize(obj: object, objectType?: AbstractClass): {};
export declare function deserialize<T>(data: any[] | {}, objectType: Class<T> | AbstractClass): any;
export declare function key(index: number | string, collectionType?: AbstractClass): (target: any, propertyName: string) => void;
export declare function union(key: number | string, objectType: AbstractClass): (baseType: Class<any>) => void;
export {};
