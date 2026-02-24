/**
 * HJM - 哈基米区块链
 *
 * 一个使用中文字符编码的以太坊风格区块链实现
 */

const {
  encodeBytes,
  decodeString,
  encodeHex,
  decodeToHex,
  bytesToTrits,
  tritsToBytes,
  tritsToHajimi,
  hajimiToTrits,
  TRYTE_CHARS,
  TRIT_CHARS,
} = require('./encoding');
const {
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
} = require('./crypto');
const { troika, troikaTrits } = require('./troika');
const { Transaction, SYSTEM_SENDER, TX_TYPES } = require('./transaction');
const { Block, getHaQiMetrics, hasLeadingZeroTrits } = require('./block');
const { Blockchain } = require('./blockchain');
const { Wallet } = require('./wallet');
const {
  createEmptyState,
  cloneState,
  getBalance,
  getNonce,
  getSigIndex,
  getContract,
  getContractStorage,
  computeContractAddress,
  computeStateRoot,
  computeTxRoot,
  computeReceiptsRoot,
  estimateTransactionExecution,
  applyTransaction,
  applyTransactions,
} = require('./state_transition');
const {
  OPCODES,
  VMRevertError,
  executeBytecode,
  buildProgram,
  encodeProgram,
  disassembleProgram,
} = require('./vm');

const { createNode } = require('./rpc');

const VERSION = '0.3.0';

module.exports = {
  encodeBytes,
  decodeString,
  encodeHex,
  decodeToHex,
  bytesToTrits,
  tritsToBytes,
  tritsToHajimi,
  hajimiToTrits,
  TRYTE_CHARS,
  TRIT_CHARS,
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
  troika,
  troikaTrits,
  Transaction,
  SYSTEM_SENDER,
  TX_TYPES,
  Block,
  getHaQiMetrics,
  hasLeadingZeroTrits,
  Blockchain,
  Wallet,
  createEmptyState,
  cloneState,
  getBalance,
  getNonce,
  getSigIndex,
  getContract,
  getContractStorage,
  computeContractAddress,
  computeStateRoot,
  computeTxRoot,
  computeReceiptsRoot,
  estimateTransactionExecution,
  applyTransaction,
  applyTransactions,
  OPCODES,
  VMRevertError,
  executeBytecode,
  buildProgram,
  encodeProgram,
  disassembleProgram,
  createNode,
  VERSION,
};
