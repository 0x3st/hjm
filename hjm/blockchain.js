/**
 * 区块链核心
 */

const { Block, getHaQiMetrics } = require('./block');
const { identifyPublicKeyScheme } = require('./crypto');
const { decodeString } = require('./encoding');
const { Transaction, SYSTEM_SENDER, TX_TYPES } = require('./transaction');
const {
  createEmptyState,
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
  applyTransactions,
} = require('./state_transition');

class Blockchain {
  constructor(difficulty = 2, options = {}) {
    if (typeof difficulty === 'object') {
      options = difficulty;
      difficulty = options.haQiValue ?? options.difficulty ?? 2;
    }

    this.difficulty = getHaQiMetrics(options.haQiValue ?? difficulty).haQiValue;
    this.haQiValue = this.difficulty;
    this.chainId = options.chainId ?? 1;
    this.miningReward = options.miningReward ?? 100;
    this.acceptedSignatureSchemes = this._normalizeAcceptedSignatureSchemes(options.acceptedSignatureSchemes);

    this.pendingTransactions = [];
    this.receiptsByBlock = {};

    // 事件监听器
    this._listeners = {};

    this.state = createEmptyState();
    this.balances = this.state.balances;
    this.nonces = this.state.nonces;
    this.sigIndices = this.state.sigIndices;

    const genesisMiner = options.genesisRecipient ?? '创世';
    const genesisTx = Transaction.create(SYSTEM_SENDER, genesisMiner, 0, {
      txType: TX_TYPES.TRANSFER,
      chainId: this.chainId,
      nonce: 0,
      sigIndex: 0,
      fee: 0,
      gasLimit: 0,
      timestamp: 0,
    });
    genesisTx.txHash = genesisTx.calculateHash();

    const genesisBlock = new Block({
      index: 0,
      timestamp: 0,
      transactions: [genesisTx],
      previousHash: 'GENESIS',
      nonce: 0,
      difficulty: 1,
      chainId: this.chainId,
      minerAddress: genesisMiner,
    });

    const applied = applyTransactions(this.state, genesisBlock.transactions, {
      chainId: this.chainId,
      minerAddress: genesisMiner,
      allowZeroSystem: true,
      acceptedSignatureSchemes: this.acceptedSignatureSchemes,
    });

    if (!applied.ok) {
      throw new Error(`Failed to initialize genesis block: ${applied.error}`);
    }

    genesisBlock.txRoot = computeTxRoot(genesisBlock.transactions);
    genesisBlock.receiptsRoot = computeReceiptsRoot(applied.receipts);
    genesisBlock.stateRoot = computeStateRoot(applied.state);
    genesisBlock.mineBlock(genesisBlock.difficulty);

    this.chain = [genesisBlock];
    this.state = applied.state;
    this.balances = this.state.balances;
    this.nonces = this.state.nonces;
    this.sigIndices = this.state.sigIndices;
    this.receiptsByBlock[0] = applied.receipts;
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  log(...args) {
    console.log(...args);
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  emit(event, ...args) {
    for (const fn of this._listeners[event] || []) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[Event:${event}] 监听器异常:`, err.message);
      }
    }
  }

  getHaQiValue() {
    return this.difficulty;
  }

  getHaQiMetrics() {
    return getHaQiMetrics(this.difficulty);
  }

  getBalance(address) {
    return getBalance(this.state, address);
  }

  getNonce(address) {
    return getNonce(this.state, address);
  }

  getSigIndex(address) {
    return getSigIndex(this.state, address);
  }

  getAcceptedSignatureSchemes() {
    return [...this.acceptedSignatureSchemes];
  }

  getContract(contractAddress) {
    const contract = getContract(this.state, contractAddress);
    return contract ? { ...contract } : null;
  }

  getContractStorage(contractAddress, key = null) {
    return getContractStorage(this.state, contractAddress, key);
  }

  _isValidAmount(amount, { allowZero = false } = {}) {
    if (!Number.isFinite(amount) || !Number.isInteger(amount)) return false;
    if (allowZero) return amount >= 0;
    return amount > 0;
  }

  _normalizeAcceptedSignatureSchemes(rawSchemes) {
    const source = rawSchemes === undefined ? ['hajimi-wots'] : rawSchemes;
    if (!Array.isArray(source)) {
      throw new Error('acceptedSignatureSchemes must be an array');
    }
    const normalized = source
      .map((name) => String(name).trim())
      .filter((name) => name.length > 0);
    if (normalized.length === 0) {
      throw new Error('acceptedSignatureSchemes cannot be empty');
    }
    return Array.from(new Set(normalized));
  }

  _detectTxSignatureScheme(tx) {
    if (!tx.senderPublicKey) return null;
    try {
      return identifyPublicKeyScheme(decodeString(tx.senderPublicKey));
    } catch {
      return null;
    }
  }

  _isSignatureSchemeAccepted(tx) {
    const schemeName = this._detectTxSignatureScheme(tx);
    return Boolean(schemeName && this.acceptedSignatureSchemes.includes(schemeName));
  }

  _nextPendingNonce(address) {
    let nonce = this.getNonce(address);
    for (const tx of this.pendingTransactions) {
      if (tx.sender === address) nonce += 1;
    }
    return nonce;
  }

  _nextPendingSigIndex(address) {
    let sigIndex = this.getSigIndex(address);
    for (const tx of this.pendingTransactions) {
      if (tx.sender === address) sigIndex += 1;
    }
    return sigIndex;
  }

  _pendingDebitForSender(address) {
    let debit = 0;
    for (const tx of this.pendingTransactions) {
      if (tx.sender !== address) continue;
      const contract = tx.txType === TX_TYPES.CALL ? this._resolveKnownContract(tx.recipient) : null;
      const estimate = estimateTransactionExecution(tx, { state: this.state, contract });
      debit += tx.amount + tx.fee + estimate.scriptTransferTotal;
    }
    return debit;
  }

  _resolveKnownContract(contractAddress) {
    const onChain = getContract(this.state, contractAddress);
    if (onChain) return onChain;

    for (const tx of this.pendingTransactions) {
      if (tx.txType !== TX_TYPES.CREATE) continue;
      const created = computeContractAddress(tx.sender, tx.nonce, tx.chainId);
      if (created !== contractAddress) continue;
      let runtimeCode = tx.data || '';
      try {
        runtimeCode = simulateCreateExecution(tx).runtimeCode;
      } catch {
        // 无法模拟时回退到原始 data，避免影响交易池可用性。
      }
      return {
        creator: tx.sender,
        nonce: tx.nonce,
        chainId: tx.chainId,
        code: runtimeCode,
        createdByTx: tx.txHash || null,
      };
    }

    return null;
  }

  _isContractKnown(contractAddress) {
    return Boolean(this._resolveKnownContract(contractAddress));
  }

  _validateRewardTransactions(transactions, { isGenesis = false, minerAddress }) {
    const txs = transactions.map((tx) => Transaction.fromData(tx));
    const rewardTxs = txs.filter((tx) => tx.sender === SYSTEM_SENDER);

    if (rewardTxs.length !== 1) {
      console.log('奖励交易数量异常');
      return false;
    }

    const rewardTx = rewardTxs[0];
    if (rewardTx.recipient !== minerAddress) {
      console.log('奖励交易接收地址与矿工不匹配');
      return false;
    }

    if (rewardTx.txType !== TX_TYPES.TRANSFER) {
      console.log('奖励交易类型异常');
      return false;
    }

    if (rewardTx.fee !== 0 || rewardTx.gasLimit !== 0 || rewardTx.nonce !== 0 || rewardTx.sigIndex !== 0) {
      console.log('奖励交易字段非法');
      return false;
    }

    if (isGenesis) {
      return rewardTx.amount === 0;
    }

    if (rewardTx.amount !== this.miningReward) {
      console.log('奖励交易金额异常');
      return false;
    }

    return true;
  }

  addTransaction(transaction, options = {}) {
    const silent = options.silent || false;

    try {
      const tx = Transaction.fromData(transaction);

      if (tx.sender === SYSTEM_SENDER) {
        console.log('系统交易只能由矿工奖励生成');
        return false;
      }

      const allowZeroAmount = tx.txType !== TX_TYPES.TRANSFER;
      if (!this._isValidAmount(tx.amount, { allowZero: allowZeroAmount })) {
        console.log(`交易金额无效: ${tx.amount}`);
        return false;
      }

      if (!this._isValidAmount(tx.fee, { allowZero: true })) {
        console.log(`交易手续费无效: ${tx.fee}`);
        return false;
      }

      if (!this._isValidAmount(tx.gasLimit, { allowZero: true })) {
        console.log(`交易燃料上限无效: ${tx.gasLimit}`);
        return false;
      }
      if (!this._isValidAmount(tx.sigIndex, { allowZero: true })) {
        console.log(`签名索引无效: ${tx.sigIndex}`);
        return false;
      }

      if (tx.chainId !== this.chainId) {
        console.log(`链标识不匹配: ${tx.chainId} != ${this.chainId}`);
        return false;
      }

      if (tx.txType === TX_TYPES.CREATE && tx.recipient !== '') {
        console.log('哈创约交易的接收方必须为空字符串');
        return false;
      }

      if (tx.txType === TX_TYPES.CALL && !this._isContractKnown(tx.recipient)) {
        console.log(`目标合约不存在: ${tx.recipient}`);
        return false;
      }

      if (!this._isSignatureSchemeAccepted(tx)) {
        const schemeName = this._detectTxSignatureScheme(tx);
        console.log(`签名方案不被链策略接受: ${schemeName || '未知'}`);
        return false;
      }

      if (!tx.verify({ chainId: this.chainId })) {
        console.log('交易签名或哈希校验失败');
        return false;
      }

      let estimate;
      try {
        estimate = estimateTransactionExecution(tx, {
          state: this.state,
          contract: tx.txType === TX_TYPES.CALL ? this._resolveKnownContract(tx.recipient) : null,
        });
      } catch (err) {
        console.log(`交易脚本执行失败: ${err.message}`);
        return false;
      }

      if (tx.gasLimit < estimate.gasUsed) {
        console.log(`燃料上限不足: ${tx.gasLimit} < ${estimate.gasUsed}`);
        return false;
      }

      if (tx.fee < estimate.gasUsed) {
        console.log(`手续费不足: ${tx.fee} < ${estimate.gasUsed}`);
        return false;
      }

      const expectedNonce = this._nextPendingNonce(tx.sender);
      if (tx.nonce !== expectedNonce) {
        console.log(`序号不匹配: ${tx.nonce} != ${expectedNonce}`);
        return false;
      }
      const expectedSigIndex = this._nextPendingSigIndex(tx.sender);
      if (tx.sigIndex !== expectedSigIndex) {
        console.log(`签名索引不匹配: ${tx.sigIndex} != ${expectedSigIndex}`);
        return false;
      }

      const totalDebit = tx.amount + tx.fee + estimate.scriptTransferTotal;
      const availableBalance = this.getBalance(tx.sender) - this._pendingDebitForSender(tx.sender);
      if (availableBalance < totalDebit) {
        console.log(`余额不足: ${availableBalance} < ${totalDebit}`);
        return false;
      }

      this.pendingTransactions.push(tx);
      if (!silent) {
        this.emit('newTransaction', tx);
      }
      return true;
    } catch (err) {
      console.log(`添加交易时发生异常: ${err.message}`);
      return false;
    }
  }

  _createRewardTransaction(miningRewardAddress) {
    const rewardTx = Transaction.create(SYSTEM_SENDER, miningRewardAddress, this.miningReward, {
      txType: TX_TYPES.TRANSFER,
      chainId: this.chainId,
      nonce: 0,
      sigIndex: 0,
      fee: 0,
      gasLimit: 0,
      timestamp: Math.floor(Date.now() / 1000),
    });
    rewardTx.txHash = rewardTx.calculateHash();
    return rewardTx;
  }

  minePendingTransactions(miningRewardAddress) {
    const rewardTx = this._createRewardTransaction(miningRewardAddress);

    const block = new Block({
      index: this.chain.length,
      timestamp: Math.floor(Date.now() / 1000),
      transactions: [...this.pendingTransactions, rewardTx],
      previousHash: this.getLatestBlock().hash,
      haQiValue: this.difficulty,
      chainId: this.chainId,
      minerAddress: miningRewardAddress,
    });

    if (!this._validateRewardTransactions(block.transactions, { minerAddress: miningRewardAddress })) {
      return false;
    }

    const applied = applyTransactions(this.state, block.transactions, {
      chainId: this.chainId,
      minerAddress: miningRewardAddress,
      allowZeroSystem: false,
      acceptedSignatureSchemes: this.acceptedSignatureSchemes,
    });

    if (!applied.ok) {
      console.log(`区块状态转移失败: ${applied.error}`);
      return false;
    }

    block.txRoot = computeTxRoot(block.transactions);
    block.receiptsRoot = computeReceiptsRoot(applied.receipts);
    block.stateRoot = computeStateRoot(applied.state);

    const haQi = getHaQiMetrics(this.difficulty);
    console.log(`开始挖矿区块 #${block.index}... 哈气值(H): ${haQi.haQiValue} (${haQi.haQiLevel}阶${haQi.haQiPoint}点)`);
    block.mineBlock(this.difficulty);
    console.log(`区块已挖出! 哈希: ${block.hash.slice(0, 20)}... 哈气压强: ${haQi.haQiPressure}`);

    this.chain.push(block);
    this.state = applied.state;
    this.balances = this.state.balances;
    this.nonces = this.state.nonces;
    this.sigIndices = this.state.sigIndices;
    this.receiptsByBlock[block.index] = applied.receipts;
    this.pendingTransactions = [];
    this.emit('newBlock', block);

    return true;
  }

  addBlock(blockData) {
    try {
      const block = new Block(blockData);
      const latest = this.getLatestBlock();

      if (block.index !== this.chain.length) {
        this.log(`区块索引不匹配: ${block.index} != ${this.chain.length}`);
        return false;
      }
      if (block.previousHash !== latest.hash) {
        this.log(`区块前置哈希不匹配`);
        return false;
      }
      if (block.chainId !== this.chainId) {
        this.log(`区块链标识不匹配: ${block.chainId} != ${this.chainId}`);
        return false;
      }
      if (block.hash !== block.calculateHash()) {
        this.log(`区块哈希无效`);
        return false;
      }
      if (!block.hasValidProof()) {
        this.log(`区块工作量证明无效`);
        return false;
      }
      if (block.difficulty !== this.difficulty) {
        this.log(`区块难度不符: ${block.difficulty} != ${this.difficulty}`);
        return false;
      }
      if (block.txRoot !== block.calculateTxRoot()) {
        this.log(`区块 txRoot 无效`);
        return false;
      }
      if (!this._validateRewardTransactions(block.transactions, { minerAddress: block.minerAddress })) {
        this.log(`区块奖励交易校验失败`);
        return false;
      }

      const applied = applyTransactions(this.state, block.transactions, {
        chainId: this.chainId,
        minerAddress: block.minerAddress,
        allowZeroSystem: false,
        acceptedSignatureSchemes: this.acceptedSignatureSchemes,
      });
      if (!applied.ok) {
        this.log(`区块状态转移失败: ${applied.error}`);
        return false;
      }
      if (block.stateRoot !== computeStateRoot(applied.state)) {
        this.log(`区块 stateRoot 无效`);
        return false;
      }
      if (block.receiptsRoot !== computeReceiptsRoot(applied.receipts)) {
        this.log(`区块 receiptsRoot 无效`);
        return false;
      }

      this.chain.push(block);
      this.state = applied.state;
      this.balances = this.state.balances;
      this.nonces = this.state.nonces;
      this.sigIndices = this.state.sigIndices;
      this.receiptsByBlock[block.index] = applied.receipts;

      // 移除已被打包的交易
      const packedHashes = new Set(block.transactions.map(tx => tx.txHash));
      this.pendingTransactions = this.pendingTransactions.filter(tx => !packedHashes.has(tx.txHash));

      this.emit('blockAccepted', block);
      return true;
    } catch (err) {
      this.log(`接收区块异常: ${err.message}`);
      return false;
    }
  }

  replaceChain(newChainData) {
    if (!Array.isArray(newChainData) || newChainData.length <= this.chain.length) {
      this.log(`新链不够长: ${newChainData ? newChainData.length : 0} <= ${this.chain.length}`);
      return false;
    }

    // 创世块锚定验证
    const myGenesisHash = this.chain[0].hash;
    const newGenesisHash = newChainData[0]?.hash;
    if (newGenesisHash !== myGenesisHash) {
      this.log('创世块不匹配，拒绝链替换');
      return false;
    }

    // 保存旧的 pending 交易用于恢复
    const oldPending = [...this.pendingTransactions];

    // 从创世块开始完整验证新链
    let replayState = createEmptyState();
    const newChain = [];
    const newReceipts = {};

    for (let i = 0; i < newChainData.length; i++) {
      const block = new Block(newChainData[i]);
      const isGenesis = i === 0;

      if (block.index !== i) return false;
      if (block.chainId !== this.chainId) return false;
      if (block.hash !== block.calculateHash()) return false;
      if (!block.hasValidProof()) return false;
      if (!isGenesis && block.difficulty !== this.difficulty) return false;
      if (!isGenesis && block.previousHash !== newChain[i - 1].hash) return false;
      if (block.txRoot !== block.calculateTxRoot()) return false;
      if (!this._validateRewardTransactions(block.transactions, { isGenesis, minerAddress: block.minerAddress })) return false;

      const applied = applyTransactions(replayState, block.transactions, {
        chainId: this.chainId,
        minerAddress: block.minerAddress,
        allowZeroSystem: isGenesis,
        acceptedSignatureSchemes: this.acceptedSignatureSchemes,
      });
      if (!applied.ok) return false;
      if (block.stateRoot !== computeStateRoot(applied.state)) return false;
      if (block.receiptsRoot !== computeReceiptsRoot(applied.receipts)) return false;

      replayState = applied.state;
      newChain.push(block);
      newReceipts[i] = applied.receipts;
    }

    // 收集新链所有交易哈希
    const onChainTxHashes = new Set();
    for (const block of newChain) {
      for (const tx of block.transactions) {
        onChainTxHashes.add(tx.txHash);
      }
    }

    this.chain = newChain;
    this.state = replayState;
    this.balances = this.state.balances;
    this.nonces = this.state.nonces;
    this.sigIndices = this.state.sigIndices;
    this.receiptsByBlock = newReceipts;
    this.pendingTransactions = [];

    // 恢复未上链的有效交易（静默模式，不触发事件）
    for (const tx of oldPending) {
      if (!onChainTxHashes.has(tx.txHash)) {
        this.addTransaction(tx, { silent: true });
      }
    }

    this.log(`链已切换，新高度: ${this.chain.length}`);
    this.emit('chainReplaced', this.chain);
    return true;
  }

  loadChain(chainData) {
    if (!Array.isArray(chainData) || chainData.length === 0) {
      this.log('链快照为空，拒绝加载');
      return false;
    }

    const oldChain = this.chain;
    const oldState = this.state;
    const oldBalances = this.balances;
    const oldNonces = this.nonces;
    const oldSigIndices = this.sigIndices;
    const oldReceipts = this.receiptsByBlock;
    const oldPending = [...this.pendingTransactions];
    this.pendingTransactions = [];
    this.chain = [this.chain[0]];
    const ok = chainData.length === 1
      ? this._loadGenesisOnly(chainData[0])
      : this.replaceChain(chainData);

    if (!ok) {
      this.chain = oldChain;
      this.state = oldState;
      this.balances = oldBalances;
      this.nonces = oldNonces;
      this.sigIndices = oldSigIndices;
      this.receiptsByBlock = oldReceipts;
      this.pendingTransactions = oldPending;
      this.log(`链快照加载失败，保留当前高度: ${oldChain.length}`);
      return false;
    }
    this.pendingTransactions = oldPending.filter((tx) => this.addTransaction(tx, { silent: true }));
    this.log(`链快照已加载，高度: ${this.chain.length}`);
    return true;
  }

  _loadGenesisOnly(genesisData) {
    const genesis = new Block(genesisData);
    if (genesis.hash !== this.chain[0].hash) return false;
    return true;
  }

  isChainValid() {
    if (this.chain.length === 0) return false;

    let replayState = createEmptyState();

    for (let i = 0; i < this.chain.length; i++) {
      const current = new Block(this.chain[i]);
      const isGenesis = i === 0;

      if (current.index !== i) {
        console.log(`区块 #${i} 索引异常`);
        return false;
      }

      if (current.chainId !== this.chainId) {
        console.log(`区块 #${i} 链标识异常`);
        return false;
      }

      if (current.hash !== current.calculateHash()) {
        console.log(`区块 #${i} 哈希无效`);
        return false;
      }

      if (!current.hasValidProof()) {
        console.log(`区块 #${i} 工作量证明无效`);
        return false;
      }

      if (!isGenesis && current.difficulty !== this.difficulty) {
        console.log(`区块 #${i} 难度不符合链策略: ${current.difficulty} != ${this.difficulty}`);
        return false;
      }

      if (!isGenesis) {
        const previous = this.chain[i - 1];
        if (current.previousHash !== previous.hash) {
          console.log(`区块 #${i} 链接断裂`);
          return false;
        }
      }

      if (current.txRoot !== current.calculateTxRoot()) {
        console.log(`区块 #${i} txRoot 无效`);
        return false;
      }

      if (!this._validateRewardTransactions(current.transactions, {
        isGenesis,
        minerAddress: current.minerAddress,
      })) {
        console.log(`区块 #${i} 奖励交易校验失败`);
        return false;
      }

      const applied = applyTransactions(replayState, current.transactions, {
        chainId: this.chainId,
        minerAddress: current.minerAddress,
        allowZeroSystem: isGenesis,
        acceptedSignatureSchemes: this.acceptedSignatureSchemes,
      });

      if (!applied.ok) {
        console.log(`区块 #${i} 状态转移失败: ${applied.error}`);
        return false;
      }

      const expectedStateRoot = computeStateRoot(applied.state);
      if (current.stateRoot !== expectedStateRoot) {
        console.log(`区块 #${i} stateRoot 无效`);
        return false;
      }

      const expectedReceiptsRoot = computeReceiptsRoot(applied.receipts);
      if (current.receiptsRoot !== expectedReceiptsRoot) {
        console.log(`区块 #${i} receiptsRoot 无效`);
        return false;
      }

      replayState = applied.state;
    }

    return true;
  }
}

module.exports = { Blockchain };
