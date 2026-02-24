/**
 * 钱包功能
 */

const { generateKeypair, privateKeyToPublic, publicKeyToAddress } = require('./crypto');
const { Transaction, TX_TYPES } = require('./transaction');
const { encodeBytes, decodeString } = require('./encoding');

class Wallet {
  constructor(privateKey = null, options = {}) {
    if (privateKey && typeof privateKey === 'object' && !Buffer.isBuffer(privateKey)) {
      options = privateKey;
      privateKey = null;
    }

    if (privateKey === null) {
      const keyPair = generateKeypair();
      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
    } else {
      this.privateKey = privateKey;
      this.publicKey = privateKeyToPublic(privateKey);
    }

    this.address = publicKeyToAddress(this.publicKey);
    this.chainId = options.chainId ?? 1;
    this.nextNonce = options.startNonce ?? 0;
    this.nextSigIndex = options.startSigIndex ?? options.startNonce ?? 0;
  }

  createTransaction(recipient, amount, options = {}) {
    const senderPublicKey = encodeBytes(this.publicKey);
    const usesAutoNonce = options.nonce === undefined;
    const usesAutoSigIndex = options.sigIndex === undefined;
    const nonce = usesAutoNonce ? this.nextNonce : options.nonce;
    const sigIndex = usesAutoSigIndex
      ? (options.nonce === undefined ? this.nextSigIndex : options.nonce)
      : options.sigIndex;

    const tx = Transaction.create(this.address, recipient, amount, {
      senderPublicKey,
      txType: options.txType ?? TX_TYPES.TRANSFER,
      chainId: options.chainId ?? this.chainId,
      nonce,
      sigIndex,
      fee: options.fee ?? 1,
      gasLimit: options.gasLimit ?? 128,
      data: options.data ?? '',
      timestamp: options.timestamp,
    });
    tx.sign(this.privateKey, senderPublicKey);

    if (usesAutoNonce) {
      this.nextNonce += 1;
    }
    if (usesAutoSigIndex && options.nonce === undefined) {
      this.nextSigIndex += 1;
    }

    return tx;
  }

  createContract(code, options = {}) {
    return this.createTransaction('', options.amount ?? 0, {
      ...options,
      txType: TX_TYPES.CREATE,
      data: code || '',
    });
  }

  callContract(contractAddress, amount = 0, options = {}) {
    return this.createTransaction(contractAddress, amount, {
      ...options,
      txType: TX_TYPES.CALL,
      data: options.data || '',
    });
  }

  exportPrivateKey() {
    return encodeBytes(this.privateKey);
  }

  static fromPrivateKey(encodedKey, options = {}) {
    const privateKey = decodeString(encodedKey);
    return new Wallet(privateKey, options);
  }

  toString() {
    return `Wallet(address=${this.address.slice(0, 20)}...)`;
  }
}

module.exports = { Wallet };
