/**
 * 规范编码工具
 *
 * 固定字段顺序 + 固定长度整数 + 长度前缀字节串
 */

function toNonNegativeBigInt(value, fieldName = 'value') {
  let big;
  if (typeof value === 'bigint') {
    big = value;
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`${fieldName} must be a finite integer`);
    }
    big = BigInt(value);
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    big = BigInt(value);
  } else {
    throw new Error(`${fieldName} must be an integer`);
  }

  if (big < 0n) {
    throw new Error(`${fieldName} must be >= 0`);
  }
  return big;
}

function encodeUint(value, byteLength, fieldName = 'value') {
  const big = toNonNegativeBigInt(value, fieldName);
  const max = 1n << BigInt(byteLength * 8);
  if (big >= max) {
    throw new Error(`${fieldName} overflow for uint${byteLength * 8}`);
  }

  const out = Buffer.alloc(byteLength);
  let tmp = big;
  for (let i = byteLength - 1; i >= 0; i--) {
    out[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  return out;
}

function encodeUint8(value, fieldName) {
  return encodeUint(value, 1, fieldName);
}

function encodeUint32(value, fieldName) {
  return encodeUint(value, 4, fieldName);
}

function encodeUint64(value, fieldName) {
  return encodeUint(value, 8, fieldName);
}

function encodeBool(value) {
  return Buffer.from([value ? 1 : 0]);
}

function ensureBuffer(value, fieldName = 'value') {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new Error(`${fieldName} must be bytes`);
}

function encodeVarBytes(bytes, fieldName = 'bytes') {
  const buf = ensureBuffer(bytes, fieldName);
  return Buffer.concat([encodeUint32(buf.length, `${fieldName}.length`), buf]);
}

function encodeString(str, fieldName = 'string') {
  if (typeof str !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  return encodeVarBytes(Buffer.from(str, 'utf-8'), fieldName);
}

function encodeOptionalString(str, fieldName = 'string') {
  if (str === null || str === undefined) {
    return Buffer.from([0]);
  }
  return Buffer.concat([Buffer.from([1]), encodeString(str, fieldName)]);
}

function encodeStringArray(values, fieldName = 'array') {
  if (!Array.isArray(values)) {
    throw new Error(`${fieldName} must be an array`);
  }

  const parts = [encodeUint32(values.length, `${fieldName}.length`)];
  for (const val of values) {
    parts.push(encodeString(String(val), fieldName));
  }
  return Buffer.concat(parts);
}

function encodeSortedMap(mapObj, valueEncoder, fieldName = 'map') {
  const map = mapObj || {};
  const keys = Object.keys(map).sort();
  const parts = [encodeUint32(keys.length, `${fieldName}.length`)];
  for (const key of keys) {
    parts.push(encodeString(key, `${fieldName}.key`));
    parts.push(valueEncoder(map[key], `${fieldName}[${key}]`));
  }
  return Buffer.concat(parts);
}

function concatBuffers(parts) {
  return Buffer.concat(parts.map((part) => ensureBuffer(part)));
}

module.exports = {
  toNonNegativeBigInt,
  encodeUint,
  encodeUint8,
  encodeUint32,
  encodeUint64,
  encodeBool,
  encodeVarBytes,
  encodeString,
  encodeOptionalString,
  encodeStringArray,
  encodeSortedMap,
  concatBuffers,
};
