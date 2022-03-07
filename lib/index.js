"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.union = exports.key = exports.deserialize = exports.serialize = exports.decode = exports.encode = void 0;
require("reflect-metadata");
var msgpack_1 = require("@msgpack/msgpack");
var keyMetadataKey = Symbol("key");
var unionMetadataKey = Symbol("union");
function encode(obj, objectType) {
    return (0, msgpack_1.encode)(serialize(obj, objectType));
}
exports.encode = encode;
function decode(data, objectType) {
    return deserialize((0, msgpack_1.decode)(data), objectType);
}
exports.decode = decode;
function serialize(obj, objectType) {
    var _a;
    if (obj == null)
        return undefined;
    var sourceType = Object.getPrototypeOf(obj);
    if (objectType) {
        var unionMetadata = Reflect.getMetadata(unionMetadataKey, sourceType);
        var unionBaseData = unionMetadata && unionMetadata.get(objectType);
        if (unionBaseData) {
            var key_1 = unionBaseData.prototypeMap.get(sourceType);
            if (key_1 === undefined) {
                throw new Error("Union class is missing a key!");
            }
            if (typeof key_1 === "number") {
                return [key_1, serializeClass(obj, sourceType)];
            }
            else {
                return _a = {}, _a[key_1] = serializeClass(obj, sourceType), _a;
            }
        }
    }
    return serializeClass(obj, sourceType);
}
exports.serialize = serialize;
var serializeClass = function (obj, baseType) {
    var result;
    var keyMap = Reflect.getMetadata(keyMetadataKey, baseType);
    keyMap.map.forEach(function (keyData, key) {
        var keyValue = obj[keyData.name];
        var isMessagePackObject = isMessagePack(keyData.objectType);
        if (keyValue != null && !isMessagePackObject && Array.isArray(keyValue)) {
            for (var i = 0; i < keyValue.length; i++) {
                if (keyValue[i] != null) {
                    break;
                }
            }
        }
        var serialized;
        if (isMessagePack(keyData.objectType)) {
            serialized = serialize(keyValue, keyData.objectType);
        }
        else if (Array.isArray(keyValue) &&
            keyData.collectionType &&
            isMessagePack(keyData.collectionType)) {
            serialized = keyValue.map(function (k) { return serialize(k, keyData.collectionType); });
        }
        else if (typeof keyValue === "object" &&
            keyData.collectionType &&
            isMessagePack(keyData.collectionType)) {
            serialized = {};
            Object.keys(keyValue).forEach(function (k) {
                serialized[k] = serialize(keyValue[k], keyData.collectionType);
            });
        }
        else {
            serialized = keyValue;
            if (Array.isArray(serialized)) {
                var itm = serialized[0];
                if (itm && !isPrimitive(itm)) {
                    throw new Error("Attempted to serialize an array of objects. Did you for get to add the type to @key(key, ArrayValueType)?");
                }
            }
            else if (typeof serialized === "object") {
                var keys = Object.keys(serialized);
                if (keys.length > 0) {
                    var itm = serialized[keys[0]];
                    if (itm && !isPrimitive(itm)) {
                        throw new Error("Attempted to serialize a map of objects. Did you for get to add the type to @key(key, MapValueType)?");
                    }
                }
            }
        }
        if (result == null)
            result = typeof key === "number" ? [] : {};
        if (Array.isArray(result)) {
            while (result.length < key) {
                result.push(undefined);
            }
        }
        if (serialized != null) {
            result[key] = serialized;
        }
    });
    return result;
};
function deserialize(data, objectType) {
    if (data == null)
        return null;
    var unionMap = Reflect.getMetadata(unionMetadataKey, objectType.prototype);
    if (unionMap) {
        var unionData = unionMap.get(objectType);
        if (unionData) {
            if (Array.isArray(data)) {
                if (data.length !== 2) {
                    throw new Error("Expected a union object, but got data length: " + data.length);
                }
                return instantiate(unionData.keyMap.get(data[0]), data[1]);
            }
            else {
                var unionKey = Object.keys(data)[0];
                return instantiate(unionData.keyMap.get(unionKey), data[unionKey]);
            }
        }
    }
    return instantiate(objectType, data);
}
exports.deserialize = deserialize;
function isMessagePack(objectType) {
    return (Reflect.hasMetadata(unionMetadataKey, objectType.prototype) ||
        Reflect.hasMetadata(keyMetadataKey, objectType.prototype));
}
function instantiate(type, data) {
    var obj = new type();
    var keyMetaMap = Reflect.getMetadata(keyMetadataKey, type.prototype);
    keyMetaMap.map.forEach(function (keyData, key) {
        var serialized = data[key];
        var value;
        if (serialized && isMessagePack(keyData.objectType)) {
            value = deserialize(serialized, keyData.objectType);
        }
        else if (serialized &&
            Array.isArray(serialized) &&
            keyData.collectionType &&
            isMessagePack(keyData.collectionType)) {
            value = serialized.map(function (k) { return deserialize(k, keyData.collectionType); });
        }
        else if (serialized &&
            typeof serialized === "object" &&
            keyData.collectionType &&
            isMessagePack(keyData.collectionType)) {
            value = {};
            Object.keys(serialized).forEach(function (k) {
                value[k] = deserialize(serialized[k], keyData.collectionType);
            });
        }
        else {
            value = serialized;
        }
        if (value != null) {
            obj[keyData.name] = value;
        }
    });
    return obj;
}
function key(index, collectionType) {
    return function (target, propertyName) {
        var keyMetaMap = Reflect.getMetadata(keyMetadataKey, target);
        if (!keyMetaMap) {
            keyMetaMap = {
                map: new Map(),
                name: target.constructor.name,
            };
            Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
        }
        else if (keyMetaMap.name !== target.constructor.name) {
            // Moving from parent to child, clone values
            keyMetaMap = {
                map: new Map(keyMetaMap.map),
                name: target.constructor.name,
            };
            Reflect.defineMetadata(keyMetadataKey, keyMetaMap, target);
        }
        if (keyMetaMap.map.get(index)) {
            throw new Error("Key (".concat(index, ") is already in use on type ").concat(target.constructor.name));
        }
        var classType = Reflect.getMetadata("design:type", target, propertyName);
        keyMetaMap.map.set(index, {
            name: propertyName,
            objectType: classType,
            collectionType: collectionType,
        });
    };
}
exports.key = key;
function union(key, objectType) {
    return function (baseType) {
        var unionMetaMap = Reflect.getMetadata(unionMetadataKey, objectType.prototype);
        if (unionMetaMap == null) {
            unionMetaMap = new Map();
            Reflect.defineMetadata(unionMetadataKey, unionMetaMap, objectType.prototype);
        }
        var unionData = unionMetaMap.get(objectType);
        if (!unionData) {
            unionData = {
                keyMap: new Map(),
                prototypeMap: new Map(),
            };
            unionMetaMap.set(objectType, unionData);
        }
        unionData.prototypeMap.set(baseType.prototype, key);
        unionData.keyMap.set(key, baseType);
    };
}
exports.union = union;
function isPrimitive(arg) {
    var type = typeof arg;
    return arg == null || (type != "object" && type != "function");
}
//# sourceMappingURL=index.js.map