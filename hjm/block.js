/**
 * 区块结构
 */

const { Transaction } = require('./transaction');
const { hashData } = require('./crypto');
const { encodeBytes, decodeString, bytesToTrits } = require('./encoding');
const {
  encodeUint8,
  encodeUint32,
  encodeUint64,
  encodeString,
  concatBuffers,
} = require('./codec');
const { computeTxRoot } = require('./state_transition');

const MAX_DIFFICULTY_TRITS = 192; // 32 bytes * 6 trits/byte

function normalizeHaQiValue(value, fieldName = 'haQiValue') {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_DIFFICULTY_TRITS) {
    throw new Error(`${fieldName} must be in [0, ${MAX_DIFFICULTY_TRITS}]`);
  }
  return value;
}

function getHaQiMetrics(haQiValue) {
  const H = normalizeHaQiValue(haQiValue);
  return {
    haQiValue: H,
    haQiLevel: Math.floor(H / 3),
    haQiPoint: H % 3,
    haQiPressure: (3n ** BigInt(H)).toString(),
  };
}

function hasLeadingZeroTrits(hashBytes, difficultyTrits) {
  const trits = bytesToTrits(hashBytes);
  if (difficultyTrits <= 0) return true;
  for (let i = 0; i < difficultyTrits; i++) {
    if (trits[i] !== 0) return false;
  }
  return true;
}

class Block {
  constructor({
    version = 1,
    index,
    timestamp,
    transactions,
    previousHash,
    previous_hash,  // snake_case alias for toDict() compatibility
    nonce = 0,
    difficulty = 1,
    haQiValue,
    ha_qi_value,    // snake_case alias
    chainId,
    chain_id,       // snake_case alias
    minerAddress,
    miner_address,  // snake_case alias
    txRoot,
    tx_root,        // snake_case alias
    stateRoot,
    state_root,     // snake_case alias
    receiptsRoot,
    receipts_root,  // snake_case alias
    hash = null,
  }) {
    this.version = version;
    this.index = index;
    this.timestamp = timestamp;
    this.transactions = (transactions || []).map((tx) => Transaction.fromData(tx));
    // Support both camelCase and snake_case (toDict output)
    this.previousHash = previousHash ?? previous_hash;
    this.nonce = nonce;
    const effectiveHaQi = haQiValue ?? ha_qi_value;
    const normalizedDifficulty = effectiveHaQi === undefined ? difficulty : effectiveHaQi;
    this.difficulty = normalizeHaQiValue(normalizedDifficulty, 'difficulty');
    this.haQiValue = this.difficulty;
    this.chainId = chainId ?? chain_id ?? 1;
    this.minerAddress = minerAddress ?? miner_address ?? '系统';
    this.txRoot = txRoot ?? tx_root ?? this.calculateTxRoot();
    this.stateRoot = stateRoot ?? state_root ?? '';
    this.receiptsRoot = receiptsRoot ?? receipts_root ?? '';
    this.hash = hash;
  }

  calculateTxRoot() {
    return computeTxRoot(this.transactions);
  }

  serializeHeader() {
    return concatBuffers([
      encodeUint8(this.version, 'version'),
      encodeUint32(this.chainId, 'chainId'),
      encodeUint64(this.index, 'index'),
      encodeUint64(this.timestamp, 'timestamp'),
      encodeUint32(this.difficulty, 'difficulty'),
      encodeUint64(this.nonce, 'nonce'),
      encodeString(this.previousHash, 'previousHash'),
      encodeString(this.minerAddress, 'minerAddress'),
      encodeString(this.txRoot, 'txRoot'),
      encodeString(this.stateRoot, 'stateRoot'),
      encodeString(this.receiptsRoot, 'receiptsRoot'),
    ]);
  }

  calculateHashBytes() {
    return hashData(this.serializeHeader());
  }

  calculateHash() {
    return encodeBytes(this.calculateHashBytes());
  }

  hasValidProof() {
    if (!this.hash) return false;
    try {
      return hasLeadingZeroTrits(decodeString(this.hash), this.difficulty);
    } catch {
      return false;
    }
  }

  mineBlock(difficulty = this.difficulty) {
    this.difficulty = normalizeHaQiValue(difficulty, 'difficulty');
    this.haQiValue = this.difficulty;

    while (true) {
      const hashBytes = this.calculateHashBytes();
      if (hasLeadingZeroTrits(hashBytes, this.difficulty)) {
        this.hash = encodeBytes(hashBytes);
        break;
      }
      this.nonce += 1;
    }
  }

  toDict() {
    const metrics = getHaQiMetrics(this.difficulty);
    return {
      version: this.version,
      index: this.index,
      timestamp: this.timestamp,
      transactions: this.transactions.map((tx) => tx.toDict()),
      previous_hash: this.previousHash,
      nonce: this.nonce,
      difficulty: this.difficulty,
      ha_qi_value: metrics.haQiValue,
      ha_qi_level: metrics.haQiLevel,
      ha_qi_point: metrics.haQiPoint,
      ha_qi_pressure: metrics.haQiPressure,
      chain_id: this.chainId,
      miner_address: this.minerAddress,
      tx_root: this.txRoot,
      state_root: this.stateRoot,
      receipts_root: this.receiptsRoot,
      hash: this.hash,
    };
  }

  toJSON() {
    return JSON.stringify(this.toDict(), null, 2);
  }

  getHaQiMetrics() {
    return getHaQiMetrics(this.difficulty);
  }

  static createGenesisBlock({ chainId = 1, difficulty = 1, haQiValue = undefined } = {}) {
    const normalizedDifficulty = haQiValue === undefined ? difficulty : haQiValue;
    const genesisTx = Transaction.create('系统', '创世', 0, {
      chainId,
      nonce: 0,
      fee: 0,
      gasLimit: 0,
      timestamp: 0,
    });
    genesisTx.txHash = genesisTx.calculateHash();

    const block = new Block({
      index: 0,
      timestamp: 0,
      transactions: [genesisTx],
      previousHash: 'GENESIS',
      nonce: 0,
      difficulty: normalizedDifficulty,
      chainId,
      minerAddress: '创世',
      stateRoot: '',
      receiptsRoot: '',
    });
    return block;
  }
}

module.exports = {
  Block,
  getHaQiMetrics,
  hasLeadingZeroTrits,
};
