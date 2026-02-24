/**
 * 状态转移函数（State Transition）
 */

const { hashData, identifyPublicKeyScheme, formatAddress } = require('./crypto');
const {
  encodeBytes,
  decodeString,
  bytesToTrits,
  tritsToHajimi,
  hajimiToTrits,
  tritsToBytes,
} = require('./encoding');
const { Transaction, SYSTEM_SENDER, TX_TYPES } = require('./transaction');
const { executeBytecode } = require('./vm');
const {
  encodeUint32,
  encodeUint64,
  encodeBool,
  encodeString,
  encodeOptionalString,
  encodeStringArray,
  encodeSortedMap,
  concatBuffers,
} = require('./codec');

const CONTRACT_ADDRESS_PREFIX = '哈合约';
const STORAGE_VALUE_PREFIX = '哈槽';

function asSafeInt(value, fieldName, { allowZero = true } = {}) {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${fieldName} must be an integer`);
  }
  if (value < 0 || (!allowZero && value === 0)) {
    throw new Error(`${fieldName} must be ${allowZero ? '>= 0' : '> 0'}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} is too large`);
  }
  return value;
}

function normalizeAcceptedSignatureSchemes(raw) {
  if (raw === null || raw === undefined) return null;
  if (!Array.isArray(raw)) return null;
  return raw
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0);
}

function createEmptyState() {
  return {
    balances: {},
    nonces: {},
    sigIndices: {},
    contracts: {},
    storage: {},
  };
}

function cloneState(state) {
  const contracts = {};
  for (const [address, meta] of Object.entries(state?.contracts || {})) {
    contracts[address] = { ...meta };
  }

  const storage = {};
  for (const [contractAddress, slots] of Object.entries(state?.storage || {})) {
    storage[contractAddress] = { ...slots };
  }

  return {
    balances: { ...(state?.balances || {}) },
    nonces: { ...(state?.nonces || {}) },
    sigIndices: { ...(state?.sigIndices || {}) },
    contracts,
    storage,
  };
}

function getBalance(state, address) {
  return state.balances[address] || 0;
}

function getNonce(state, address) {
  return state.nonces[address] || 0;
}

function getSigIndex(state, address) {
  return state.sigIndices[address] || 0;
}

function getContract(state, contractAddress) {
  return state.contracts[contractAddress] || null;
}

function getContractStorage(state, contractAddress, key = null) {
  const slots = state.storage[contractAddress] || {};
  if (key === null || key === undefined) {
    const out = {};
    for (const [slotKey, slotVal] of Object.entries(slots)) {
      out[slotKey] = decodeStorageValue(slotVal);
    }
    return out;
  }

  if (!Object.prototype.hasOwnProperty.call(slots, key)) return null;
  return decodeStorageValue(slots[key]);
}

function encodeStorageValue(value) {
  const utf8 = Buffer.from(String(value ?? ''), 'utf-8');
  const trits = bytesToTrits(utf8);
  const encoded = tritsToHajimi(trits);
  return `${STORAGE_VALUE_PREFIX}${encoded}`;
}

function decodeStorageValue(value) {
  if (typeof value !== 'string') return String(value ?? '');
  if (!value.startsWith(STORAGE_VALUE_PREFIX)) return value;

  const payload = value.slice(STORAGE_VALUE_PREFIX.length);
  try {
    const trits = hajimiToTrits(payload);
    const bytes = tritsToBytes(trits);
    return bytes.toString('utf-8');
  } catch {
    return value;
  }
}

function computeContractAddress(sender, nonce, chainId) {
  const payload = concatBuffers([
    encodeString('哈合约地址一版'),
    encodeUint32(chainId, 'chainId'),
    encodeUint64(nonce, 'nonce'),
    encodeString(sender, 'sender'),
  ]);
  const hash = hashData(payload);
  return formatAddress(CONTRACT_ADDRESS_PREFIX, hash.slice(-20), {
    domainTag: '哈合约地址校验',
  });
}

function computeStateRoot(state) {
  const payload = concatBuffers([
    encodeString('哈状态三版'),
    encodeSortedMap(state.balances, (value, key) => encodeUint64(asSafeInt(value, key), key), 'balances'),
    encodeSortedMap(state.nonces, (value, key) => encodeUint64(asSafeInt(value, key), key), 'nonces'),
    encodeSortedMap(state.sigIndices, (value, key) => encodeUint64(asSafeInt(value, key), key), 'sigIndices'),
    encodeSortedMap(
      state.contracts,
      (contract, fieldName) =>
        concatBuffers([
          encodeString(contract.creator || '', `${fieldName}.creator`),
          encodeUint64(asSafeInt(contract.nonce || 0, `${fieldName}.nonce`), `${fieldName}.nonce`),
          encodeUint32(asSafeInt(contract.chainId || 0, `${fieldName}.chainId`), `${fieldName}.chainId`),
          encodeString(contract.codeHash || '', `${fieldName}.codeHash`),
          encodeString(contract.code || '', `${fieldName}.code`),
          encodeOptionalString(contract.initCode || null, `${fieldName}.initCode`),
          encodeOptionalString(contract.createdByTx || null, `${fieldName}.createdByTx`),
        ]),
      'contracts'
    ),
    encodeSortedMap(
      state.storage,
      (slotMap, fieldName) =>
        encodeSortedMap(
          slotMap,
          (value, slotField) => encodeString(String(value), slotField),
          `${fieldName}.slots`
        ),
      'storage'
    ),
  ]);
  return encodeBytes(hashData(payload));
}

function computeTxRoot(transactions) {
  const txs = (transactions || []).map((tx) => Transaction.fromData(tx));
  const parts = [encodeString('哈交易根一版'), encodeUint32(txs.length, 'txCount')];

  for (const tx of txs) {
    const txHash = tx.txHash || tx.calculateHash();
    parts.push(encodeString(txHash, 'txHash'));
  }

  return encodeBytes(hashData(concatBuffers(parts)));
}

function computeReceiptsRoot(receipts) {
  const normalized = receipts || [];
  const parts = [encodeString('哈回执根三版'), encodeUint32(normalized.length, 'receiptCount')];

  for (const receipt of normalized) {
    parts.push(encodeString(receipt.txHash || '', 'receipt.txHash'));
    parts.push(encodeString(receipt.txType || TX_TYPES.TRANSFER, 'receipt.txType'));
    parts.push(encodeBool(Boolean(receipt.success)));
    parts.push(encodeUint64(asSafeInt(receipt.gasUsed || 0, 'receipt.gasUsed')));
    parts.push(encodeUint64(asSafeInt(receipt.feePaid || 0, 'receipt.feePaid')));
    parts.push(encodeOptionalString(receipt.contractAddress || null, 'receipt.contractAddress'));
    parts.push(encodeOptionalString(receipt.returnData || null, 'receipt.returnData'));
    parts.push(encodeStringArray(receipt.logs || [], 'receipt.logs'));
  }

  return encodeBytes(hashData(concatBuffers(parts)));
}

function getProgramTritCost(program) {
  if (!program) return 0;
  const bytes = decodeString(program);
  return bytesToTrits(bytes).length;
}

function getFlexibleDataTritCost(data) {
  if (!data) return 0;
  try {
    return getProgramTritCost(data);
  } catch {
    return bytesToTrits(Buffer.from(String(data), 'utf-8')).length;
  }
}

function sumScriptTransfers(transfers) {
  return (transfers || []).reduce((sum, transfer, index) => {
    const amount = asSafeInt(transfer.amount, `script transfer amount #${index}`, { allowZero: false });
    if (typeof transfer.to !== 'string' || transfer.to.length === 0) {
      throw new Error(`script transfer recipient #${index} is invalid`);
    }
    return sum + amount;
  }, 0);
}

function simulateCreateExecution(tx) {
  const contractAddress = computeContractAddress(tx.sender, tx.nonce, tx.chainId);
  const legacyRuntimeCode = tx.data || '';
  const legacyRuntimeBytes = legacyRuntimeCode ? decodeString(legacyRuntimeCode) : Buffer.alloc(0);
  const legacyResult = {
    mode: 'LEGACY',
    contractAddress,
    initResult: {
      gasUsed: getProgramTritCost(tx.data || ''),
      logs: [],
      transfers: [],
      storageWrites: {},
      returnData: null,
      halted: false,
    },
    runtimeCode: legacyRuntimeCode,
    runtimeCodeHash: encodeBytes(hashData(legacyRuntimeBytes)),
    gasUsed: 20 + getProgramTritCost(tx.data || ''),
  };

  let initResult;
  try {
    initResult = executeBytecode(tx.data || '', {
      sender: tx.sender,
      recipient: contractAddress,
      chainId: tx.chainId,
      storage: {},
    });
  } catch {
    return legacyResult;
  }

  // 兼容旧行为：无 RETURN 时，tx.data 直接作为 runtime code，不执行 constructor 副作用。
  if (initResult.returnData === null) {
    return legacyResult;
  }

  let runtimeBytes;
  try {
    runtimeBytes = decodeString(initResult.returnData);
  } catch {
    return legacyResult;
  }

  if (initResult.transfers.length > 0) {
    throw new Error('哈创约初始化代码不允许内置转账');
  }

  const runtimeCode = initResult.returnData;
  const runtimeCodeHash = encodeBytes(hashData(runtimeBytes));

  return {
    mode: 'INIT_RUNTIME',
    contractAddress,
    initResult,
    runtimeCode,
    runtimeCodeHash,
    gasUsed: 20 + initResult.gasUsed,
  };
}

function estimateTransactionExecution(txInput, options = {}) {
  const tx = Transaction.fromData(txInput);

  if (tx.sender === SYSTEM_SENDER) {
    return {
      gasUsed: 0,
      logs: [],
      scriptTransfers: [],
      scriptTransferTotal: 0,
    };
  }

  const requiresPositiveAmount = tx.txType === TX_TYPES.TRANSFER;
  asSafeInt(tx.amount, 'amount', { allowZero: !requiresPositiveAmount });
  asSafeInt(tx.fee, 'fee');
  asSafeInt(tx.gasLimit, 'gasLimit');
  asSafeInt(tx.nonce, 'nonce');
  asSafeInt(tx.sigIndex, 'sigIndex');
  asSafeInt(tx.chainId, 'chainId', { allowZero: false });

  if (tx.txType === TX_TYPES.TRANSFER) {
    const vmResult = executeBytecode(tx.data || '', {
      sender: tx.sender,
      recipient: tx.recipient,
      chainId: tx.chainId,
    });

    return {
      gasUsed: 1 + vmResult.gasUsed,
      logs: vmResult.logs,
      scriptTransfers: vmResult.transfers,
      scriptTransferTotal: sumScriptTransfers(vmResult.transfers),
    };
  }

  if (tx.txType === TX_TYPES.CREATE) {
    const createSim = simulateCreateExecution(tx);
    const createLogs = createSim.mode === 'INIT_RUNTIME' ? ['哈创约', ...createSim.initResult.logs] : ['哈创约'];
    return {
      gasUsed: createSim.gasUsed,
      logs: createLogs,
      scriptTransfers: [],
      scriptTransferTotal: 0,
    };
  }

  if (tx.txType === TX_TYPES.CALL) {
    const contract = options.contract || (options.state ? getContract(options.state, tx.recipient) : null);
    const contractCode = contract?.code || '';
    const callDataCost = getFlexibleDataTritCost(tx.data || '');

    if (!contractCode) {
      return {
        gasUsed: 10 + callDataCost,
        logs: ['哈调用'],
        scriptTransfers: [],
        scriptTransferTotal: 0,
      };
    }

    const storage =
      options.state && tx.recipient
        ? getContractStorage(options.state, tx.recipient)
        : {};

    try {
      const vmResult = executeBytecode(contractCode, {
        sender: tx.sender,
        recipient: tx.recipient,
        chainId: tx.chainId,
        callData: tx.data || '',
        callValue: tx.amount,
        storage,
      });

      return {
        gasUsed: 10 + vmResult.gasUsed + callDataCost,
        logs: ['哈调用'],
        scriptTransfers: [],
        scriptTransferTotal: 0,
      };
    } catch (err) {
      if (Number.isSafeInteger(err?.vmGasUsed)) {
        return {
          gasUsed: 10 + err.vmGasUsed + callDataCost,
          logs: ['哈调用'],
          scriptTransfers: [],
          scriptTransferTotal: 0,
        };
      }
      throw err;
    }
  }

  throw new Error(`不支持的交易类型: ${tx.txType}`);
}

function executeContractCall(state, tx) {
  const contract = getContract(state, tx.recipient);
  if (!contract) {
    throw new Error(`目标合约不存在: ${tx.recipient}`);
  }

  const vmResult = executeBytecode(contract.code || '', {
    sender: tx.sender,
    recipient: tx.recipient,
    chainId: tx.chainId,
    callData: tx.data || '',
    callValue: tx.amount,
    storage: getContractStorage(state, tx.recipient),
  });

  return {
    vmResult,
    scriptTransferTotal: sumScriptTransfers(vmResult.transfers),
    gasUsed: 10 + vmResult.gasUsed + getFlexibleDataTritCost(tx.data || ''),
  };
}

function applyFailedCall(state, tx, expectedNonce, expectedSigIndex, context, gasUsed, reason, extras = {}) {
  const senderBalance = getBalance(state, tx.sender);
  if (senderBalance < tx.fee) {
    return {
      ok: false,
      error: `余额不足以支付失败手续费: ${senderBalance} < ${tx.fee}`,
    };
  }

  state.balances[tx.sender] = senderBalance - tx.fee;

  if (context.minerAddress) {
    state.balances[context.minerAddress] = getBalance(state, context.minerAddress) + tx.fee;
  }

  state.nonces[tx.sender] = expectedNonce + 1;
  state.sigIndices[tx.sender] = expectedSigIndex + 1;

  return {
    ok: true,
    receipt: {
      txHash: tx.txHash,
      txType: tx.txType,
      success: false,
      gasUsed: asSafeInt(gasUsed, 'receipt.gasUsed'),
      feePaid: tx.fee,
      contractAddress: null,
      returnData: extras.returnData ?? null,
      logs: [`哈调用失败:${reason}`, ...(extras.logs || [])],
    },
  };
}

function applyTransaction(stateInput, txInput, context = {}) {
  try {
    const state = stateInput;
    const tx = Transaction.fromData(txInput);

    if (!tx.txHash || tx.txHash !== tx.calculateHash()) {
    return {
      ok: false,
      error: '交易哈希无效',
      receipt: {
        txHash: tx.txHash || '',
        txType: tx.txType,
        success: false,
        gasUsed: 0,
        feePaid: 0,
        contractAddress: null,
        returnData: null,
        logs: ['哈交易哈希无效'],
      },
    };
  }

  if (context.chainId !== undefined && tx.chainId !== context.chainId) {
    return {
      ok: false,
      error: `链标识不匹配: ${tx.chainId} != ${context.chainId}`,
    };
  }

  if (tx.sender === SYSTEM_SENDER) {
    const allowZeroSystem = Boolean(context.allowZeroSystem);
    if (!Number.isInteger(tx.amount) || tx.amount < 0 || (!allowZeroSystem && tx.amount === 0)) {
      return {
        ok: false,
        error: '系统交易金额无效',
      };
    }
    if (tx.signature) {
      return {
        ok: false,
        error: '系统交易不应包含签名',
      };
    }
    if (tx.sigIndex !== 0) {
      return {
        ok: false,
        error: '系统交易 sigIndex 必须为 0',
      };
    }

    state.balances[tx.recipient] = getBalance(state, tx.recipient) + tx.amount;

    return {
      ok: true,
      receipt: {
        txHash: tx.txHash,
        txType: tx.txType,
        success: true,
        gasUsed: 0,
        feePaid: 0,
        contractAddress: null,
        returnData: null,
        logs: ['哈系统交易'],
      },
    };
  }

  const acceptedSchemes = normalizeAcceptedSignatureSchemes(context.acceptedSignatureSchemes);
  if (acceptedSchemes && acceptedSchemes.length > 0) {
    let schemeName = null;
    try {
      const publicKeyBytes = decodeString(tx.senderPublicKey || '');
      schemeName = identifyPublicKeyScheme(publicKeyBytes);
    } catch {
      schemeName = null;
    }

    if (!schemeName) {
      return {
        ok: false,
        error: '无法识别签名方案',
      };
    }
    if (!acceptedSchemes.includes(schemeName)) {
      return {
        ok: false,
        error: `签名方案不被链策略接受: ${schemeName}`,
      };
    }
  }

  if (!tx.verify({ chainId: context.chainId })) {
    return {
      ok: false,
      error: '交易签名校验失败',
    };
  }

  const expectedNonce = getNonce(state, tx.sender);
  if (tx.nonce !== expectedNonce) {
    return {
      ok: false,
      error: `序号不匹配: ${tx.nonce} != ${expectedNonce}`,
    };
  }
  const expectedSigIndex = getSigIndex(state, tx.sender);
  if (tx.sigIndex !== expectedSigIndex) {
    return {
      ok: false,
      error: `签名索引不匹配: ${tx.sigIndex} != ${expectedSigIndex}`,
    };
  }

  if (tx.txType === TX_TYPES.CALL) {
    const contract = getContract(state, tx.recipient);
    if (!contract) {
      return {
        ok: false,
        error: `目标合约不存在: ${tx.recipient}`,
      };
    }

    const staticEstimate = estimateTransactionExecution(tx, { contract });
    if (tx.gasLimit < staticEstimate.gasUsed) {
      return {
        ok: false,
        error: `燃料上限不足: ${tx.gasLimit} < ${staticEstimate.gasUsed}`,
      };
    }
    if (tx.fee < staticEstimate.gasUsed) {
      return {
        ok: false,
        error: `手续费不足: ${tx.fee} < ${staticEstimate.gasUsed}`,
      };
    }

    const senderBalance = getBalance(state, tx.sender);
    if (senderBalance < tx.fee) {
      return {
        ok: false,
        error: `余额不足: ${senderBalance} < ${tx.fee}`,
      };
    }

    if (senderBalance < tx.amount + tx.fee) {
      return applyFailedCall(
        state,
        tx,
        expectedNonce,
        expectedSigIndex,
        context,
        staticEstimate.gasUsed,
        `余额不足以附带金额: ${senderBalance} < ${tx.amount + tx.fee}`
      );
    }

    let execution;
    try {
      execution = executeContractCall(state, tx);
    } catch (err) {
      const vmGasUsed = Number.isSafeInteger(err?.vmGasUsed) ? err.vmGasUsed : 0;
      const gasUsed = 10 + vmGasUsed + getFlexibleDataTritCost(tx.data || '');

      if (tx.gasLimit < gasUsed) {
        return {
          ok: false,
          error: `燃料上限不足: ${tx.gasLimit} < ${gasUsed}`,
        };
      }
      if (tx.fee < gasUsed) {
        return {
          ok: false,
          error: `手续费不足: ${tx.fee} < ${gasUsed}`,
        };
      }

      return applyFailedCall(state, tx, expectedNonce, expectedSigIndex, context, gasUsed, err.message || 'VM error', {
        returnData: err?.returnData || null,
        logs: [err?.vmRevert ? '哈虚拟机回滚' : '哈虚拟机错误'],
      });
    }

    if (tx.gasLimit < execution.gasUsed) {
      return {
        ok: false,
        error: `燃料上限不足: ${tx.gasLimit} < ${execution.gasUsed}`,
      };
    }

    if (tx.fee < execution.gasUsed) {
      return {
        ok: false,
        error: `手续费不足: ${tx.fee} < ${execution.gasUsed}`,
      };
    }

    const contractBalanceAfterDeposit = getBalance(state, tx.recipient) + tx.amount;
    if (contractBalanceAfterDeposit < execution.scriptTransferTotal) {
      return applyFailedCall(
        state,
        tx,
        expectedNonce,
        expectedSigIndex,
        context,
        execution.gasUsed,
        `合约余额不足以执行转账: ${contractBalanceAfterDeposit} < ${execution.scriptTransferTotal}`
      );
    }

    state.balances[tx.sender] = senderBalance - tx.amount - tx.fee;

    let contractBalance = contractBalanceAfterDeposit;
    for (const transfer of execution.vmResult.transfers) {
      contractBalance -= transfer.amount;
      state.balances[transfer.to] = getBalance(state, transfer.to) + transfer.amount;
    }
    state.balances[tx.recipient] = contractBalance;

    const slots = { ...(state.storage[tx.recipient] || {}) };
    for (const [key, value] of Object.entries(execution.vmResult.storageWrites || {})) {
      slots[key] = encodeStorageValue(value);
    }
    state.storage[tx.recipient] = slots;

    if (context.minerAddress) {
      state.balances[context.minerAddress] = getBalance(state, context.minerAddress) + tx.fee;
    }

    state.nonces[tx.sender] = expectedNonce + 1;
    state.sigIndices[tx.sender] = expectedSigIndex + 1;

    return {
      ok: true,
      receipt: {
        txHash: tx.txHash,
        txType: tx.txType,
        success: true,
        gasUsed: execution.gasUsed,
        feePaid: tx.fee,
        contractAddress: null,
        returnData: execution.vmResult.returnData,
        logs: execution.vmResult.logs,
      },
    };
  }

  let estimate;
  try {
    estimate = estimateTransactionExecution(tx);
  } catch (err) {
    return {
      ok: false,
      error: `交易执行预估失败: ${err.message}`,
    };
  }

  if (tx.gasLimit < estimate.gasUsed) {
    return {
      ok: false,
      error: `燃料上限不足: ${tx.gasLimit} < ${estimate.gasUsed}`,
    };
  }

  if (tx.fee < estimate.gasUsed) {
    return {
      ok: false,
      error: `手续费不足: ${tx.fee} < ${estimate.gasUsed}`,
    };
  }

  const totalDebit = tx.amount + tx.fee + estimate.scriptTransferTotal;
  const senderBalance = getBalance(state, tx.sender);
  if (senderBalance < totalDebit) {
    return {
      ok: false,
      error: `余额不足: ${senderBalance} < ${totalDebit}`,
    };
  }

  state.balances[tx.sender] = senderBalance - totalDebit;

  let contractAddress = null;

  let createSim = null;
  if (tx.txType === TX_TYPES.CREATE) {
    try {
      createSim = simulateCreateExecution(tx);
    } catch (err) {
      return {
        ok: false,
        error: `哈创约执行失败: ${err.message}`,
      };
    }

    contractAddress = createSim.contractAddress;
    if (state.contracts[contractAddress]) {
      return {
        ok: false,
        error: `合约地址冲突: ${contractAddress}`,
      };
    }

    state.contracts[contractAddress] = {
      creator: tx.sender,
      nonce: tx.nonce,
      chainId: tx.chainId,
      code: createSim.runtimeCode,
      codeHash: createSim.runtimeCodeHash,
      createdByTx: tx.txHash,
      initCode: tx.data || '',
    };

    if (!state.storage[contractAddress]) {
      state.storage[contractAddress] = {};
    }

    const initStorage = {};
    if (createSim.mode === 'INIT_RUNTIME') {
      for (const [slotKey, slotVal] of Object.entries(createSim.initResult.storageWrites || {})) {
        initStorage[slotKey] = encodeStorageValue(slotVal);
      }
    }
    state.storage[contractAddress] = initStorage;

    state.balances[contractAddress] = getBalance(state, contractAddress) + tx.amount;
  } else {
    state.balances[tx.recipient] = getBalance(state, tx.recipient) + tx.amount;

    for (const transfer of estimate.scriptTransfers) {
      state.balances[transfer.to] = getBalance(state, transfer.to) + transfer.amount;
    }
  }

  if (context.minerAddress) {
    state.balances[context.minerAddress] = getBalance(state, context.minerAddress) + tx.fee;
  }

  state.nonces[tx.sender] = expectedNonce + 1;
  state.sigIndices[tx.sender] = expectedSigIndex + 1;

      return {
        ok: true,
        receipt: {
          txHash: tx.txHash,
          txType: tx.txType,
          success: true,
          gasUsed: createSim ? createSim.gasUsed : estimate.gasUsed,
          feePaid: tx.fee,
          contractAddress,
          returnData: createSim ? createSim.runtimeCode || null : null,
          logs: createSim
            ? (createSim.mode === 'INIT_RUNTIME' ? ['哈创约', ...createSim.initResult.logs] : ['哈创约'])
            : estimate.logs,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: `状态转移异常: ${err.message}`,
      };
    }
  }
function applyTransactions(stateInput, transactions, context = {}) {
  const state = cloneState(stateInput);
  const receipts = [];

  for (const rawTx of transactions) {
    let tx;
    try {
      tx = Transaction.fromData(rawTx);
    } catch (err) {
      return {
        ok: false,
        error: `交易格式无效: ${err.message}`,
        failedTx: rawTx,
        receipts,
      };
    }
    const result = applyTransaction(state, tx, context);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        failedTx: tx,
        receipts,
      };
    }
    receipts.push(result.receipt);
  }

  return {
    ok: true,
    state,
    receipts,
  };
}

module.exports = {
  SYSTEM_SENDER,
  TX_TYPES,
  CONTRACT_ADDRESS_PREFIX,
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
  simulateCreateExecution,
  estimateTransactionExecution,
  applyTransaction,
  applyTransactions,
};
