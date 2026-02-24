/**
 * 哈基米编码系统 - 27进制三进制编码
 *
 * 每个字符代表一个 tryte（3个trit），底层是纯三进制（哈=0, 基=1, 米=2）
 * 27个字符分三系：哈系(0-8)、基系(9-17)、米系(18-26)
 */

// 三进制基础符号
const TRIT_CHARS = '哈基米';

// 27进制字符集（每个字符 = 3个trit）
// 哈系(0-8): 哈蛤嗨嘿呵赫喝核合
// 基系(9-17): 基鸡机吉叽几积击极
// 米系(18-26): 米咪迷眯蜜密觅秘弥
const TRYTE_CHARS = '哈蛤嗨嘿呵赫喝核合基鸡机吉叽几积击极米咪迷眯蜜密觅秘弥';

class HajimiEncoder {
  constructor() {
    this.base = 27n;
    this.chars = [...TRYTE_CHARS];
    this.charToIndex = new Map();
    this.chars.forEach((ch, i) => this.charToIndex.set(ch, BigInt(i)));
  }

  /**
   * 将字节数据编码为哈基米字符串（27进制）
   * 每字节固定2个字符，保证可逆
   */
  encode(data) {
    if (!data || data.length === 0) return '';
    const result = [];
    for (const byte of data) {
      const high = Math.floor(byte / 27);
      const low = byte % 27;
      result.push(this.chars[high], this.chars[low]);
    }
    return result.join('');
  }

  /**
   * 将哈基米字符串解码为字节数据
   */
  decode(encoded) {
    if (!encoded) return Buffer.alloc(0);
    const chars = [...encoded];
    if (chars.length % 2 !== 0) {
      throw new Error('Invalid encoded string: length must be even');
    }
    const bytes = Buffer.alloc(chars.length / 2);
    for (let i = 0; i < chars.length; i += 2) {
      const high = this.charToIndex.get(chars[i]);
      const low = this.charToIndex.get(chars[i + 1]);
      if (high === undefined || low === undefined) {
        throw new Error(`Invalid character: ${chars[i]}${chars[i + 1]}`);
      }
      const value = Number(high) * 27 + Number(low);
      if (value > 255) {
        throw new Error(`Invalid byte value: ${value}`);
      }
      bytes[i / 2] = value;
    }
    return bytes;
  }
}

const defaultEncoder = new HajimiEncoder();

function encodeBytes(data) {
  return defaultEncoder.encode(data);
}

function decodeString(encoded) {
  return defaultEncoder.decode(encoded);
}

function encodeHex(hexString) {
  if (hexString.startsWith('0x')) hexString = hexString.slice(2);
  const data = Buffer.from(hexString, 'hex');
  return encodeBytes(data);
}

function decodeToHex(encoded) {
  const data = decodeString(encoded);
  return '0x' + data.toString('hex');
}

/**
 * 将字节数据转换为 trit 数组（每字节6个trit）
 */
function bytesToTrits(data) {
  const trits = [];
  for (const byte of data) {
    // 每字节转6个trit（3^6=729 > 255）
    let val = byte;
    const byteTrit = [];
    for (let i = 0; i < 6; i++) {
      byteTrit.push(val % 3);
      val = Math.floor(val / 3);
    }
    byteTrit.reverse();
    trits.push(...byteTrit);
  }
  return trits;
}

/**
 * 将 trit 数组转换为字节数据
 */
function tritsToBytes(trits) {
  if (trits.length % 6 !== 0) {
    throw new Error('tritsToBytes: trit length must be a multiple of 6');
  }
  // 每6个trit还原一个字节
  const byteCount = trits.length / 6;
  const bytes = Buffer.alloc(byteCount);
  for (let i = 0; i < byteCount; i++) {
    let val = 0;
    for (let j = 0; j < 6; j++) {
      val = val * 3 + trits[i * 6 + j];
    }
    bytes[i] = val;
  }
  return bytes;
}

/**
 * 将 trit 数组编码为哈基米字符串（每3个trit = 1个字符）
 */
function tritsToHajimi(trits) {
  if (trits.length % 3 !== 0) {
    throw new Error('tritsToHajimi: trit length must be a multiple of 3');
  }
  const chars = [];
  for (let i = 0; i < trits.length; i += 3) {
    const val = trits[i] * 9 + trits[i + 1] * 3 + trits[i + 2];
    chars.push(TRYTE_CHARS[val]);
  }
  return chars.join('');
}

/**
 * 将哈基米字符串解码为 trit 数组
 */
function hajimiToTrits(str) {
  const encoder = defaultEncoder;
  const trits = [];
  for (const ch of str) {
    const idx = encoder.charToIndex.get(ch);
    if (idx === undefined) throw new Error(`Invalid character: ${ch}`);
    const val = Number(idx);
    trits.push(Math.floor(val / 9), Math.floor(val / 3) % 3, val % 3);
  }
  return trits;
}

module.exports = {
  TRIT_CHARS,
  TRYTE_CHARS,
  HajimiEncoder,
  encodeBytes,
  decodeString,
  encodeHex,
  decodeToHex,
  bytesToTrits,
  tritsToBytes,
  tritsToHajimi,
  hajimiToTrits,
};
