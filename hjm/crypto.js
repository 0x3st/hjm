/**
 * 哈希与可插拔签名方案
 */

const crypto = require('crypto');
const EC = require('elliptic').ec;
const { troika } = require('./troika');
const { encodeBytes, decodeString, TRYTE_CHARS } = require('./encoding');

const ec = new EC('secp256k1');

const NATIVE_PRIVATE_TAG = Buffer.from('HJSK');
const NATIVE_PUBLIC_TAG = Buffer.from('HJP1');
const NATIVE_SIGNATURE_TAG = Buffer.from('HJSG');
const NATIVE_VERSION = 1;

const NATIVE_SEED_SIZE = 32;
const NATIVE_HASH_SIZE = 32;
const NATIVE_LEAF_COUNT = 64;
const NATIVE_TREE_HEIGHT = 6;
const NATIVE_CHAIN_COUNT = 8;
const NATIVE_MAX_CHAIN_STEP = 7;
const ADDRESS_BODY_SIZE = 20;
const ADDRESS_CHECKSUM_SIZE = 4;
const ADDRESS_VERSION_CHAR = '哈';
const TRYTE_CHAR_SET = new Set([...TRYTE_CHARS]);

const NATIVE_TREE_CACHE_MAX = 256;
const nativeTreeCache = new Map();

function ensureBuffer(value, fieldName = 'value') {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf-8');
  throw new Error(`${fieldName} must be bytes`);
}

function encodeU16(value, fieldName = 'value') {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${fieldName} must be uint16`);
  }
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value, 0);
  return out;
}

function decodeU16(bytes, offset = 0) {
  return bytes.readUInt16BE(offset);
}

function hashData(data) {
  return Buffer.from(troika(ensureBuffer(data, 'data')));
}

function hashToHajimi(data) {
  return encodeBytes(hashData(data));
}

function computeAddressChecksum(prefix, versionChar, bodyBytes, domainTag = '哈地址校验') {
  return hashData(Buffer.concat([
    Buffer.from(domainTag, 'utf-8'),
    Buffer.from(prefix, 'utf-8'),
    Buffer.from(versionChar, 'utf-8'),
    ensureBuffer(bodyBytes, 'bodyBytes'),
  ])).subarray(0, ADDRESS_CHECKSUM_SIZE);
}

function formatAddress(prefix, bodyBytes, options = {}) {
  const versionChar = options.versionChar || ADDRESS_VERSION_CHAR;
  const domainTag = options.domainTag || '哈地址校验';
  const body = ensureBuffer(bodyBytes, 'bodyBytes');

  if (typeof prefix !== 'string' || prefix.length === 0) {
    throw new Error('address prefix must be a non-empty string');
  }
  if (!TRYTE_CHAR_SET.has(versionChar)) {
    throw new Error('address version must be a valid tryte char');
  }
  if (body.length !== ADDRESS_BODY_SIZE) {
    throw new Error(`address body must be ${ADDRESS_BODY_SIZE} bytes`);
  }

  const checksum = computeAddressChecksum(prefix, versionChar, body, domainTag);
  return `${prefix}${versionChar}${encodeBytes(body)}${encodeBytes(checksum)}`;
}

function parseAddress(address, options = {}) {
  const prefix = options.prefix || '';
  const versionChar = options.versionChar || ADDRESS_VERSION_CHAR;
  const domainTag = options.domainTag || '哈地址校验';
  if (typeof address !== 'string' || !address.startsWith(prefix)) return null;

  const payload = address.slice(prefix.length);
  const expectedEncodedBodyLength = ADDRESS_BODY_SIZE * 2;
  const expectedEncodedChecksumLength = ADDRESS_CHECKSUM_SIZE * 2;
  if (payload.length !== 1 + expectedEncodedBodyLength + expectedEncodedChecksumLength) return null;

  const gotVersion = payload[0];
  if (gotVersion !== versionChar || !TRYTE_CHAR_SET.has(gotVersion)) return null;

  const encodedBody = payload.slice(1, 1 + expectedEncodedBodyLength);
  const encodedChecksum = payload.slice(1 + expectedEncodedBodyLength);

  try {
    const bodyBytes = decodeString(encodedBody);
    const checksumBytes = decodeString(encodedChecksum);
    const expected = computeAddressChecksum(prefix, gotVersion, bodyBytes, domainTag);
    if (!expected.equals(checksumBytes)) return null;
    return {
      prefix,
      versionChar: gotVersion,
      bodyBytes,
    };
  } catch {
    return null;
  }
}

function domainHash(domain, parts) {
  const chunks = [Buffer.from(domain, 'utf-8')];
  for (const part of parts) {
    chunks.push(ensureBuffer(part));
  }
  return hashData(Buffer.concat(chunks));
}

function repeatHash(value, steps) {
  let current = ensureBuffer(value);
  for (let i = 0; i < steps; i++) {
    current = domainHash('哈链步', [current]);
  }
  return current;
}

function deriveNativeSk(seed, sigIndex, chainIndex) {
  return domainHash('哈私钥派生', [seed, encodeU16(sigIndex), Buffer.from([chainIndex])]);
}

function messageDigits(message) {
  const digest = domainHash('哈签名消息', [message]);
  const out = new Array(NATIVE_CHAIN_COUNT);
  for (let i = 0; i < NATIVE_CHAIN_COUNT; i++) {
    out[i] = digest[i] & NATIVE_MAX_CHAIN_STEP;
  }
  return out;
}

function computeNativeLeaf(seed, sigIndex) {
  const chainPubs = [];
  for (let chainIndex = 0; chainIndex < NATIVE_CHAIN_COUNT; chainIndex++) {
    const sk = deriveNativeSk(seed, sigIndex, chainIndex);
    chainPubs.push(repeatHash(sk, NATIVE_MAX_CHAIN_STEP));
  }
  return domainHash('哈叶节点', chainPubs);
}

function computeParentNode(left, right) {
  return domainHash('哈默克尔节点', [left, right]);
}

function buildNativeTree(seed) {
  const cacheKey = seed.toString('hex');
  if (nativeTreeCache.has(cacheKey)) {
    const cached = nativeTreeCache.get(cacheKey);
    // LRU: move to end
    nativeTreeCache.delete(cacheKey);
    nativeTreeCache.set(cacheKey, cached);
    return cached;
  }

  const levels = [];
  const leaves = new Array(NATIVE_LEAF_COUNT);
  for (let i = 0; i < NATIVE_LEAF_COUNT; i++) {
    leaves[i] = computeNativeLeaf(seed, i);
  }
  levels.push(leaves);

  for (let level = 1; level <= NATIVE_TREE_HEIGHT; level++) {
    const prev = levels[level - 1];
    const current = new Array(prev.length / 2);
    for (let i = 0; i < current.length; i++) {
      current[i] = computeParentNode(prev[i * 2], prev[i * 2 + 1]);
    }
    levels.push(current);
  }

  const tree = {
    levels,
    root: levels[NATIVE_TREE_HEIGHT][0],
  };
  nativeTreeCache.set(cacheKey, tree);
  if (nativeTreeCache.size > NATIVE_TREE_CACHE_MAX) {
    const oldest = nativeTreeCache.keys().next().value;
    nativeTreeCache.delete(oldest);
  }
  return tree;
}

function nativeAuthPath(levels, sigIndex) {
  const path = [];
  let index = sigIndex;
  for (let level = 0; level < NATIVE_TREE_HEIGHT; level++) {
    const sibling = index ^ 1;
    path.push(levels[level][sibling]);
    index = Math.floor(index / 2);
  }
  return path;
}

function nativeRootFromPath(leaf, sigIndex, authPath) {
  let node = leaf;
  let index = sigIndex;
  for (let level = 0; level < NATIVE_TREE_HEIGHT; level++) {
    const sibling = authPath[level];
    node = index % 2 === 0 ? computeParentNode(node, sibling) : computeParentNode(sibling, node);
    index = Math.floor(index / 2);
  }
  return node;
}

function parseNativePrivateKey(privateKey) {
  const key = ensureBuffer(privateKey, 'privateKey');
  const expectedLength = 4 + 1 + 2 + NATIVE_SEED_SIZE;
  if (key.length !== expectedLength) {
    throw new Error('native private key length is invalid');
  }
  if (!key.subarray(0, 4).equals(NATIVE_PRIVATE_TAG)) {
    throw new Error('native private key tag is invalid');
  }
  const version = key[4];
  if (version !== NATIVE_VERSION) {
    throw new Error(`unsupported native private key version: ${version}`);
  }
  const leafCount = decodeU16(key, 5);
  if (leafCount !== NATIVE_LEAF_COUNT) {
    throw new Error(`unsupported native leaf count: ${leafCount}`);
  }
  return {
    seed: key.subarray(7, 7 + NATIVE_SEED_SIZE),
    leafCount,
  };
}

function parseNativePublicKey(publicKey) {
  const key = ensureBuffer(publicKey, 'publicKey');
  const expectedLength = 4 + 1 + 2 + NATIVE_HASH_SIZE;
  if (key.length !== expectedLength) {
    throw new Error('native public key length is invalid');
  }
  if (!key.subarray(0, 4).equals(NATIVE_PUBLIC_TAG)) {
    throw new Error('native public key tag is invalid');
  }
  const version = key[4];
  if (version !== NATIVE_VERSION) {
    throw new Error(`unsupported native public key version: ${version}`);
  }
  const leafCount = decodeU16(key, 5);
  if (leafCount !== NATIVE_LEAF_COUNT) {
    throw new Error(`unsupported native leaf count: ${leafCount}`);
  }
  return {
    root: key.subarray(7, 7 + NATIVE_HASH_SIZE),
    leafCount,
  };
}

function encodeNativePrivateKey(seed) {
  return Buffer.concat([
    NATIVE_PRIVATE_TAG,
    Buffer.from([NATIVE_VERSION]),
    encodeU16(NATIVE_LEAF_COUNT),
    seed,
  ]);
}

function encodeNativePublicKey(root) {
  return Buffer.concat([
    NATIVE_PUBLIC_TAG,
    Buffer.from([NATIVE_VERSION]),
    encodeU16(NATIVE_LEAF_COUNT),
    root,
  ]);
}

function encodeNativeSignature(sigIndex, chainParts, authPath) {
  return Buffer.concat([
    NATIVE_SIGNATURE_TAG,
    Buffer.from([NATIVE_VERSION]),
    encodeU16(sigIndex, 'sigIndex'),
    ...chainParts,
    ...authPath,
  ]);
}

function parseNativeSignature(signature) {
  const bytes = ensureBuffer(signature, 'signature');
  const headerLength = 4 + 1 + 2;
  const chainLength = NATIVE_CHAIN_COUNT * NATIVE_HASH_SIZE;
  const pathLength = NATIVE_TREE_HEIGHT * NATIVE_HASH_SIZE;
  const expectedLength = headerLength + chainLength + pathLength;

  if (bytes.length !== expectedLength) {
    throw new Error('native signature length is invalid');
  }
  if (!bytes.subarray(0, 4).equals(NATIVE_SIGNATURE_TAG)) {
    throw new Error('native signature tag is invalid');
  }
  const version = bytes[4];
  if (version !== NATIVE_VERSION) {
    throw new Error(`unsupported native signature version: ${version}`);
  }

  const sigIndex = decodeU16(bytes, 5);
  let offset = headerLength;
  const chainParts = [];
  for (let i = 0; i < NATIVE_CHAIN_COUNT; i++) {
    chainParts.push(bytes.subarray(offset, offset + NATIVE_HASH_SIZE));
    offset += NATIVE_HASH_SIZE;
  }
  const authPath = [];
  for (let i = 0; i < NATIVE_TREE_HEIGHT; i++) {
    authPath.push(bytes.subarray(offset, offset + NATIVE_HASH_SIZE));
    offset += NATIVE_HASH_SIZE;
  }
  return { sigIndex, chainParts, authPath };
}

class SignatureScheme {
  constructor(name) {
    this.name = name;
  }

  canHandlePrivateKey() {
    return false;
  }

  canHandlePublicKey() {
    return false;
  }

  generateKeypair() {
    throw new Error('generateKeypair not implemented');
  }

  privateKeyToPublic() {
    throw new Error('privateKeyToPublic not implemented');
  }

  publicKeyToAddress() {
    throw new Error('publicKeyToAddress not implemented');
  }

  signMessage() {
    throw new Error('signMessage not implemented');
  }

  verifySignature() {
    throw new Error('verifySignature not implemented');
  }
}

class Secp256k1SignatureScheme extends SignatureScheme {
  constructor() {
    super('secp256k1');
  }

  canHandlePrivateKey(privateKey) {
    const key = ensureBuffer(privateKey, 'privateKey');
    return key.length === 32;
  }

  canHandlePublicKey(publicKey) {
    const key = ensureBuffer(publicKey, 'publicKey');
    return key.length === 33 || key.length === 65;
  }

  generateKeypair() {
    const key = ec.genKeyPair();
    const privateKey = key.getPrivate().toArrayLike(Buffer, 'be', 32);
    const publicKey = Buffer.from(key.getPublic(true, 'array'));
    return { privateKey, publicKey };
  }

  privateKeyToPublic(privateKey) {
    const key = ec.keyFromPrivate(ensureBuffer(privateKey, 'privateKey'));
    return Buffer.from(key.getPublic(true, 'array'));
  }

  publicKeyToAddress(publicKey) {
    const hash = hashData(ensureBuffer(publicKey, 'publicKey'));
    return formatAddress('哈曲线', hash.subarray(hash.length - ADDRESS_BODY_SIZE), {
      domainTag: '哈曲线地址校验',
    });
  }

  signMessage(privateKey, message) {
    const digest = hashData(message);
    const key = ec.keyFromPrivate(ensureBuffer(privateKey, 'privateKey'));
    const signature = key.sign(digest, { canonical: true });
    return Buffer.from(signature.toDER());
  }

  verifySignature(publicKey, message, signature) {
    try {
      const digest = hashData(message);
      const key = ec.keyFromPublic(ensureBuffer(publicKey, 'publicKey'));
      return key.verify(digest, ensureBuffer(signature, 'signature'));
    } catch {
      return false;
    }
  }
}

class HajimiWOTSSignatureScheme extends SignatureScheme {
  constructor() {
    super('hajimi-wots');
  }

  canHandlePrivateKey(privateKey) {
    const key = ensureBuffer(privateKey, 'privateKey');
    return key.length >= 4 && key.subarray(0, 4).equals(NATIVE_PRIVATE_TAG);
  }

  canHandlePublicKey(publicKey) {
    const key = ensureBuffer(publicKey, 'publicKey');
    return key.length >= 4 && key.subarray(0, 4).equals(NATIVE_PUBLIC_TAG);
  }

  generateKeypair() {
    const seed = crypto.randomBytes(NATIVE_SEED_SIZE);
    const tree = buildNativeTree(seed);
    return {
      privateKey: encodeNativePrivateKey(seed),
      publicKey: encodeNativePublicKey(tree.root),
    };
  }

  privateKeyToPublic(privateKey) {
    const parsed = parseNativePrivateKey(privateKey);
    const tree = buildNativeTree(parsed.seed);
    return encodeNativePublicKey(tree.root);
  }

  publicKeyToAddress(publicKey) {
    const normalized = ensureBuffer(publicKey, 'publicKey');
    const hash = domainHash('哈原生地址', [normalized]);
    return formatAddress('哈原生', hash.subarray(hash.length - ADDRESS_BODY_SIZE), {
      domainTag: '哈原生地址校验',
    });
  }

  signMessage(privateKey, message, options = {}) {
    const parsed = parseNativePrivateKey(privateKey);
    const sigIndex = options.sigIndex;
    if (!Number.isSafeInteger(sigIndex) || sigIndex < 0 || sigIndex >= parsed.leafCount) {
      throw new Error(`native signature requires sigIndex in [0, ${parsed.leafCount - 1}]`);
    }

    const tree = buildNativeTree(parsed.seed);
    const digits = messageDigits(ensureBuffer(message, 'message'));
    const chainParts = [];
    for (let i = 0; i < NATIVE_CHAIN_COUNT; i++) {
      const sk = deriveNativeSk(parsed.seed, sigIndex, i);
      chainParts.push(repeatHash(sk, digits[i]));
    }
    const authPath = nativeAuthPath(tree.levels, sigIndex);
    return encodeNativeSignature(sigIndex, chainParts, authPath);
  }

  verifySignature(publicKey, message, signature, options = {}) {
    try {
      const parsedPub = parseNativePublicKey(publicKey);
      const parsedSig = parseNativeSignature(signature);

      if (Number.isSafeInteger(options.sigIndex) && options.sigIndex !== parsedSig.sigIndex) {
        return false;
      }

      if (parsedSig.sigIndex >= parsedPub.leafCount) {
        return false;
      }

      const digits = messageDigits(ensureBuffer(message, 'message'));
      const chainPubs = [];
      for (let i = 0; i < NATIVE_CHAIN_COUNT; i++) {
        const remaining = NATIVE_MAX_CHAIN_STEP - digits[i];
        chainPubs.push(repeatHash(parsedSig.chainParts[i], remaining));
      }
      const leaf = domainHash('哈叶节点', chainPubs);
      const root = nativeRootFromPath(leaf, parsedSig.sigIndex, parsedSig.authPath);
      return root.equals(parsedPub.root);
    } catch {
      return false;
    }
  }
}

const builtinSecpScheme = new Secp256k1SignatureScheme();
const builtinNativeScheme = new HajimiWOTSSignatureScheme();

let activeSignatureScheme = builtinNativeScheme;

function setSignatureScheme(scheme) {
  if (!(scheme instanceof SignatureScheme)) {
    throw new Error('signature scheme must extend SignatureScheme');
  }
  activeSignatureScheme = scheme;
}

function getSignatureScheme() {
  return activeSignatureScheme;
}

function resolveSchemeForPrivateKey(privateKey) {
  if (activeSignatureScheme && activeSignatureScheme.canHandlePrivateKey(privateKey)) {
    return activeSignatureScheme;
  }
  if (builtinNativeScheme.canHandlePrivateKey(privateKey)) return builtinNativeScheme;
  if (builtinSecpScheme.canHandlePrivateKey(privateKey)) return builtinSecpScheme;
  throw new Error('no signature scheme can handle the private key');
}

function resolveSchemeForPublicKey(publicKey) {
  if (activeSignatureScheme && activeSignatureScheme.canHandlePublicKey(publicKey)) {
    return activeSignatureScheme;
  }
  if (builtinNativeScheme.canHandlePublicKey(publicKey)) return builtinNativeScheme;
  if (builtinSecpScheme.canHandlePublicKey(publicKey)) return builtinSecpScheme;
  throw new Error('no signature scheme can handle the public key');
}

function identifyPublicKeyScheme(publicKey) {
  try {
    return resolveSchemeForPublicKey(publicKey).name;
  } catch {
    return null;
  }
}

function isValidAddress(address) {
  return Boolean(
    parseAddress(address, { prefix: '哈原生', domainTag: '哈原生地址校验' }) ||
    parseAddress(address, { prefix: '哈曲线', domainTag: '哈曲线地址校验' }) ||
    parseAddress(address, { prefix: '哈合约', domainTag: '哈合约地址校验' })
  );
}

function generateKeypair() {
  return activeSignatureScheme.generateKeypair();
}

function privateKeyToPublic(privateKey) {
  const scheme = resolveSchemeForPrivateKey(privateKey);
  return scheme.privateKeyToPublic(privateKey);
}

function publicKeyToAddress(publicKey) {
  const scheme = resolveSchemeForPublicKey(publicKey);
  return scheme.publicKeyToAddress(publicKey);
}

function signMessage(privateKey, message, options = {}) {
  const scheme = resolveSchemeForPrivateKey(privateKey);
  return scheme.signMessage(privateKey, ensureBuffer(message, 'message'), options);
}

function verifySignature(publicKey, message, signature, options = {}) {
  const scheme = resolveSchemeForPublicKey(publicKey);
  return scheme.verifySignature(publicKey, ensureBuffer(message, 'message'), signature, options);
}

module.exports = {
  SignatureScheme,
  Secp256k1SignatureScheme,
  HajimiWOTSSignatureScheme,
  setSignatureScheme,
  getSignatureScheme,
  generateKeypair,
  privateKeyToPublic,
  publicKeyToAddress,
  signMessage,
  verifySignature,
  identifyPublicKeyScheme,
  formatAddress,
  parseAddress,
  isValidAddress,
  hashToHajimi,
  hashData,
};
