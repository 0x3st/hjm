/**
 * 交易系统
 */

const {
  signMessage,
  verifySignature,
  hashData,
  privateKeyToPublic,
  publicKeyToAddress,
} = require('./crypto');
const { encodeBytes, decodeString } = require('./encoding');
const {
  encodeUint8,
  encodeUint32,
  encodeUint64,
  encodeString,
  encodeOptionalString,
  concatBuffers,
} = require('./codec');

const SYSTEM_SENDER = '系统';

const TX_TYPES = Object.freeze({
  TRANSFER: '哈转账',
  CREATE: '哈创约',
  CALL: '哈调用',
});

function normalizeTxType(value) {
  if (!value) return TX_TYPES.TRANSFER;
  const raw = String(value).trim();
  const upper = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(TX_TYPES, upper)) {
    return TX_TYPES[upper];
  }

  const legacyAliases = Object.freeze({
    TRANSFER: TX_TYPES.TRANSFER,
    CREATE: TX_TYPES.CREATE,
    CALL: TX_TYPES.CALL,
    哈转账: TX_TYPES.TRANSFER,
    哈创约: TX_TYPES.CREATE,
    哈调用: TX_TYPES.CALL,
  });

  if (!Object.prototype.hasOwnProperty.call(legacyAliases, raw)) {
    throw new Error(`Unsupported tx type: ${value}`);
  }
  return legacyAliases[raw];
}

class Transaction {
  constructor({
    version = 1,
    txType = TX_TYPES.TRANSFER,
    sender,
    recipient,
    amount,
    fee = 0,
    gasLimit = 0,
    nonce = 0,
    sigIndex = 0,
    chainId = 1,
    data = '',
    timestamp,
    senderPublicKey = null,
    signature = null,
    txHash = null,
  }) {
    this.version = version;
    this.txType = normalizeTxType(txType);
    this.sender = sender;
    this.recipient = recipient;
    this.amount = amount;
    this.fee = fee;
    this.gasLimit = gasLimit;
    this.nonce = nonce;
    this.sigIndex = sigIndex;
    this.chainId = chainId;
    this.data = data || '';
    this.timestamp = timestamp;
    this.senderPublicKey = senderPublicKey;
    this.signature = signature;
    this.txHash = txHash;
  }

  toDict() {
    return {
      version: this.version,
      tx_type: this.txType,
      sender: this.sender,
      recipient: this.recipient,
      amount: this.amount,
      fee: this.fee,
      gas_limit: this.gasLimit,
      nonce: this.nonce,
      sig_index: this.sigIndex,
      chain_id: this.chainId,
      data: this.data,
      timestamp: this.timestamp,
      sender_public_key: this.senderPublicKey,
      signature: this.signature,
      tx_hash: this.txHash,
    };
  }

  toJSON() {
    return JSON.stringify(this.toDict());
  }

  serializeForHash() {
    return concatBuffers([
      encodeUint8(this.version, 'version'),
      encodeString(this.txType, 'txType'),
      encodeUint32(this.chainId, 'chainId'),
      encodeUint64(this.nonce, 'nonce'),
      encodeUint64(this.sigIndex, 'sigIndex'),
      encodeUint64(this.timestamp, 'timestamp'),
      encodeString(this.sender, 'sender'),
      encodeString(this.recipient, 'recipient'),
      encodeUint64(this.amount, 'amount'),
      encodeUint64(this.fee, 'fee'),
      encodeUint64(this.gasLimit, 'gasLimit'),
      encodeOptionalString(this.senderPublicKey, 'senderPublicKey'),
      encodeString(this.data, 'data'),
    ]);
  }

  calculateHash() {
    const hashBytes = hashData(this.serializeForHash());
    return encodeBytes(hashBytes);
  }

  sign(privateKey, senderPublicKey = null) {
    if (this.sender !== SYSTEM_SENDER) {
      this.senderPublicKey = senderPublicKey || this.senderPublicKey || encodeBytes(privateKeyToPublic(privateKey));
    }

    this.txHash = this.calculateHash();
    const txHashBytes = decodeString(this.txHash);
    const signatureBytes = signMessage(privateKey, txHashBytes, {
      sigIndex: this.sigIndex,
      sender: this.sender,
      chainId: this.chainId,
    });
    this.signature = encodeBytes(signatureBytes);
  }

  verify({ chainId = null } = {}) {
    if (this.txHash !== this.calculateHash()) return false;
    if (chainId !== null && this.chainId !== chainId) return false;

    if (this.sender === SYSTEM_SENDER) {
      return !this.signature;
    }

    if (!this.signature || !this.senderPublicKey) return false;

    try {
      const publicKeyBytes = decodeString(this.senderPublicKey);
      if (publicKeyToAddress(publicKeyBytes) !== this.sender) return false;

      const signatureBytes = decodeString(this.signature);
      const txHashBytes = decodeString(this.txHash);
      return verifySignature(publicKeyBytes, txHashBytes, signatureBytes, {
        sigIndex: this.sigIndex,
        sender: this.sender,
        chainId: this.chainId,
      });
    } catch {
      return false;
    }
  }

  static create(sender, recipient, amount, optionsOrPublicKey = {}) {
    const options =
      typeof optionsOrPublicKey === 'string'
        ? { senderPublicKey: optionsOrPublicKey }
        : (optionsOrPublicKey || {});

    return new Transaction({
      version: options.version ?? 1,
      txType: options.txType ?? TX_TYPES.TRANSFER,
      sender,
      recipient,
      amount,
      fee: options.fee ?? 0,
      gasLimit: options.gasLimit ?? 0,
      nonce: options.nonce ?? 0,
      sigIndex: options.sigIndex ?? 0,
      chainId: options.chainId ?? 1,
      data: options.data ?? '',
      timestamp: options.timestamp ?? Math.floor(Date.now() / 1000),
      senderPublicKey: options.senderPublicKey ?? null,
    });
  }

  static fromData(data) {
    if (data instanceof Transaction) return data;
    return new Transaction({
      version: data.version ?? 1,
      txType: data.txType ?? data.tx_type ?? TX_TYPES.TRANSFER,
      sender: data.sender,
      recipient: data.recipient,
      amount: data.amount,
      fee: data.fee ?? 0,
      gasLimit: data.gasLimit ?? data.gas_limit ?? 0,
      nonce: data.nonce ?? 0,
      sigIndex: data.sigIndex ?? data.sig_index ?? 0,
      chainId: data.chainId ?? data.chain_id ?? 1,
      data: data.data ?? '',
      timestamp: data.timestamp,
      senderPublicKey: data.senderPublicKey ?? data.sender_public_key ?? null,
      signature: data.signature ?? null,
      txHash: data.txHash ?? data.tx_hash ?? null,
    });
  }
}

module.exports = {
  Transaction,
  SYSTEM_SENDER,
  TX_TYPES,
};
