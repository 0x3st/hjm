/**
 * HJM 区块链单元测试
 */

const {
  Wallet,
  Transaction,
  Block,
  Blockchain,
  encodeHex,
  decodeToHex,
  encodeBytes,
  decodeString,
  getHaQiMetrics,
  hasLeadingZeroTrits,
  estimateTransactionExecution,
  executeBytecode,
  encodeProgram,
  disassembleProgram,
  getSignatureScheme,
  setSignatureScheme,
  Secp256k1SignatureScheme,
  HajimiWOTSSignatureScheme,
  isValidAddress,
  TX_TYPES,
} = require('../hjm');

describe('TestEncoding', () => {
  test('hex encoding roundtrip', () => {
    const hexVal = '0x1234abcd';
    const hajimi = encodeHex(hexVal);
    const result = decodeToHex(hajimi);
    expect(result).toBe(hexVal);
  });

  test('bytes encoding roundtrip', () => {
    const data = Buffer.from('Hello, HJM!');
    const encoded = encodeBytes(data);
    const decoded = decodeString(encoded);
    expect(decoded).toEqual(data);
  });

  test('address checksum detects tampering', () => {
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });
    expect(isValidAddress(wallet.address)).toBe(true);

    const tail = wallet.address[wallet.address.length - 1] === '哈' ? '基' : '哈';
    const tampered = `${wallet.address.slice(0, -1)}${tail}`;
    expect(isValidAddress(tampered)).toBe(false);
  });
});

describe('TestTransaction', () => {
  test('canonical hash is deterministic', () => {
    const tx = Transaction.create('sender', 'recipient', 50, {
      chainId: 7,
      nonce: 12,
      fee: 5,
      gasLimit: 20,
      data: encodeProgram([{ op: 'LOG', message: 'hi' }, { op: 'STOP' }]),
      timestamp: 100,
    });

    const hash1 = tx.calculateHash();
    const hash2 = tx.calculateHash();
    expect(hash1).toBe(hash2);
  });

  test('hash changes when nonce changes', () => {
    const tx1 = Transaction.create('sender', 'recipient', 50, {
      chainId: 7,
      nonce: 0,
      timestamp: 100,
    });
    const tx2 = Transaction.create('sender', 'recipient', 50, {
      chainId: 7,
      nonce: 1,
      timestamp: 100,
    });
    expect(tx1.calculateHash()).not.toBe(tx2.calculateHash());
  });

  test('hash changes when sigIndex changes', () => {
    const tx1 = Transaction.create('sender', 'recipient', 50, {
      chainId: 7,
      nonce: 0,
      sigIndex: 0,
      timestamp: 100,
    });
    const tx2 = Transaction.create('sender', 'recipient', 50, {
      chainId: 7,
      nonce: 0,
      sigIndex: 1,
      timestamp: 100,
    });
    expect(tx1.calculateHash()).not.toBe(tx2.calculateHash());
  });

  test('transaction signing and verify', () => {
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });
    const tx = wallet.createTransaction('recipient', 100, { fee: 2, gasLimit: 100 });

    expect(tx.signature).toBeTruthy();
    expect(tx.txHash).toBeTruthy();
    expect(tx.verify({ chainId: 1 })).toBe(true);
  });

  test('transaction verify fails after tampering', () => {
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });
    const tx = wallet.createTransaction('recipient', 100, { fee: 2, gasLimit: 100 });
    tx.amount = 101;

    expect(tx.verify({ chainId: 1 })).toBe(false);
  });

  test('supports tx type serialization', () => {
    const tx = Transaction.create('sender', '', 0, {
      txType: TX_TYPES.CREATE,
      chainId: 1,
      nonce: 1,
      fee: 10,
      gasLimit: 100,
      data: encodeProgram([{ op: 'STOP' }]),
      timestamp: 101,
    });
    const copy = Transaction.fromData(tx.toDict());
    expect(copy.txType).toBe(TX_TYPES.CREATE);
    expect(copy.calculateHash()).toBe(tx.calculateHash());
  });
});

describe('TestVM', () => {
  test('execute bytecode program', () => {
    const program = encodeProgram([
      { op: 'LOG', message: 'hello' },
      { op: 'TRANSFER', to: 'alice', amount: 3 },
      { op: 'STOP' },
    ]);
    const result = executeBytecode(program, { sender: 's', recipient: 'r', chainId: 1 });
    expect(result.logs).toEqual(['hello']);
    expect(result.transfers).toEqual([{ to: 'alice', amount: 3 }]);
    expect(result.gasUsed).toBeGreaterThan(0);
  });

  test('disassemble bytecode program', () => {
    const program = encodeProgram([
      { op: 'ASSERT_CHAIN_ID', chainId: 1 },
      { op: 'ASSERT_RECIPIENT', recipient: 'alice' },
      { op: 'STOP' },
    ]);
    const decoded = disassembleProgram(program);
    expect(decoded[0]).toEqual({ op: 'ASSERT_CHAIN_ID', chainId: 1 });
    expect(decoded[1]).toEqual({ op: 'ASSERT_RECIPIENT', recipient: 'alice' });
  });

  test('estimate transaction execution', () => {
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });
    const tx = wallet.createTransaction('recipient', 5, {
      fee: 20,
      gasLimit: 200,
      data: encodeProgram([
        { op: 'TRANSFER', to: 'bob', amount: 2 },
        { op: 'LOG', message: 'ok' },
        { op: 'STOP' },
      ]),
    });

    const estimate = estimateTransactionExecution(tx);
    expect(estimate.scriptTransferTotal).toBe(2);
    expect(estimate.gasUsed).toBeGreaterThan(1);
  });

  test('supports storage ops and return data', () => {
    const program = encodeProgram([
      { op: 'SSTORE', key: 'k', value: 'v1' },
      { op: 'SLOAD', key: 'k' },
      { op: 'RETURN', data: 'ok' },
    ]);

    const result = executeBytecode(program, { storage: {} });
    expect(result.storageWrites).toEqual({ k: 'v1' });
    expect(result.returnData).toBe('ok');
    expect(result.logs).toContain('哈读槽:k=v1');
  });

  test('revert exposes vm metadata', () => {
    const program = encodeProgram([{ op: 'REVERT', message: 'denied' }]);

    try {
      executeBytecode(program, {});
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.vmRevert).toBe(true);
      expect(err.returnData).toBe('denied');
      expect(err.vmGasUsed).toBeGreaterThan(0);
    }
  });

  test('supports long return payload', () => {
    const longData = 'x'.repeat(600);
    const program = encodeProgram([{ op: 'RETURN', data: longData }]);
    const decoded = disassembleProgram(program);
    const result = executeBytecode(program, {});

    expect(decoded[0]).toEqual({ op: 'RETURN', data: longData });
    expect(result.returnData).toBe(longData);
  });

  test('supports calldata load and slice ops', () => {
    const program = encodeProgram([
      { op: 'CALLDATA_LOAD', key: 'all' },
      { op: 'CALLDATA_SLICE', key: 'head', offset: 0, length: 6 },
      { op: 'RETURN', data: 'ok' },
    ]);

    const result = executeBytecode(program, { callData: 'hakimi:payload' });
    expect(result.storageWrites).toEqual({ all: 'hakimi:payload', head: 'hakimi' });
    expect(result.returnData).toBe('ok');
  });
});

describe('TestBlock', () => {
  test('block hash is deterministic', () => {
    const tx = Transaction.create('sender', 'recipient', 50, {
      chainId: 1,
      nonce: 0,
      fee: 2,
      gasLimit: 30,
      timestamp: 123,
    });
    tx.txHash = tx.calculateHash();

    const block = new Block({
      index: 1,
      timestamp: 1234567890,
      transactions: [tx],
      previousHash: 'GENESIS',
      difficulty: 1,
      chainId: 1,
      minerAddress: 'miner',
      stateRoot: 'state',
      receiptsRoot: 'receipts',
    });

    const hash1 = block.calculateHash();
    const hash2 = block.calculateHash();
    expect(hash1).toBe(hash2);
  });

  test('PoW uses leading zero trits', () => {
    const block = new Block({
      index: 1,
      timestamp: 1,
      transactions: [],
      previousHash: 'GENESIS',
      difficulty: 4,
      chainId: 1,
      minerAddress: 'miner',
      stateRoot: 's',
      receiptsRoot: 'r',
    });

    block.mineBlock(4);
    const hashBytes = decodeString(block.hash);
    expect(hasLeadingZeroTrits(hashBytes, 4)).toBe(true);
    expect(block.hasValidProof()).toBe(true);
  });

  test('haQi aliases and metrics are stable', () => {
    const block = new Block({
      index: 1,
      timestamp: 1,
      transactions: [],
      previousHash: 'GENESIS',
      haQiValue: 4,
      chainId: 1,
      minerAddress: 'miner',
      stateRoot: 's',
      receiptsRoot: 'r',
    });

    expect(block.difficulty).toBe(4);
    expect(block.haQiValue).toBe(4);
    expect(block.getHaQiMetrics()).toEqual({
      haQiValue: 4,
      haQiLevel: 1,
      haQiPoint: 1,
      haQiPressure: '81',
    });
    expect(getHaQiMetrics(4)).toEqual(block.getHaQiMetrics());

    const serialized = block.toDict();
    expect(serialized.ha_qi_value).toBe(4);
    expect(serialized.ha_qi_level).toBe(1);
    expect(serialized.ha_qi_point).toBe(1);
    expect(serialized.ha_qi_pressure).toBe('81');
  });

  test('genesis block structure', () => {
    const genesis = Block.createGenesisBlock({ chainId: 1, difficulty: 1 });
    expect(genesis.index).toBe(0);
    expect(genesis.transactions.length).toBe(1);
  });
});

describe('TestBlockchain', () => {
  test('blockchain creation', () => {
    const blockchain = new Blockchain(1, { chainId: 99 });
    expect(blockchain.chain.length).toBe(1);
    expect(blockchain.chain[0].index).toBe(0);
    expect(blockchain.chain[0].chainId).toBe(99);
    expect(blockchain.chain[0].stateRoot).toBeTruthy();
    expect(blockchain.chain[0].txRoot).toBeTruthy();
    expect(blockchain.chain[0].receiptsRoot).toBeTruthy();
  });

  test('blockchain supports haQiValue alias', () => {
    const blockchain = new Blockchain({ chainId: 66, haQiValue: 5 });
    expect(blockchain.difficulty).toBe(5);
    expect(blockchain.getHaQiValue()).toBe(5);
    expect(blockchain.getHaQiMetrics()).toEqual({
      haQiValue: 5,
      haQiLevel: 1,
      haQiPoint: 2,
      haQiPressure: '243',
    });
  });

  test('add transaction enforces chainId and nonce', () => {
    const blockchain = new Blockchain(1, { chainId: 77 });
    const wallet = new Wallet({ chainId: 77, startNonce: 0 });

    blockchain.minePendingTransactions(wallet.address);

    const okTx = wallet.createTransaction('recipient', 20, {
      chainId: 77,
      nonce: blockchain.getNonce(wallet.address),
      fee: 2,
      gasLimit: 30,
    });

    const wrongChain = wallet.createTransaction('recipient', 20, {
      chainId: 78,
      nonce: blockchain.getNonce(wallet.address),
      fee: 2,
      gasLimit: 30,
    });

    const reusedNonce = wallet.createTransaction('recipient', 20, {
      chainId: 77,
      nonce: blockchain.getNonce(wallet.address),
      fee: 2,
      gasLimit: 30,
    });

    expect(blockchain.addTransaction(okTx)).toBe(true);
    expect(blockchain.addTransaction(wrongChain)).toBe(false);
    expect(blockchain.addTransaction(reusedNonce)).toBe(false);
  });

  test('add transaction enforces sigIndex anti-reuse', () => {
    const blockchain = new Blockchain(1, { chainId: 88 });
    const wallet = new Wallet({ chainId: 88, startNonce: 0, startSigIndex: 0 });

    blockchain.minePendingTransactions(wallet.address);

    const first = wallet.createTransaction('recipient-1', 10, {
      chainId: 88,
      nonce: blockchain.getNonce(wallet.address),
      sigIndex: blockchain.getSigIndex(wallet.address),
      fee: 2,
      gasLimit: 30,
    });
    expect(blockchain.addTransaction(first)).toBe(true);

    const badReuse = wallet.createTransaction('recipient-2', 10, {
      chainId: 88,
      nonce: blockchain.getNonce(wallet.address) + 1,
      sigIndex: blockchain.getSigIndex(wallet.address),
      fee: 2,
      gasLimit: 30,
    });
    expect(blockchain.addTransaction(badReuse)).toBe(false);

    const second = wallet.createTransaction('recipient-3', 10, {
      chainId: 88,
      nonce: blockchain.getNonce(wallet.address) + 1,
      sigIndex: blockchain.getSigIndex(wallet.address) + 1,
      fee: 2,
      gasLimit: 30,
    });
    expect(blockchain.addTransaction(second)).toBe(true);
  });

  test('default policy rejects secp256k1 transactions', () => {
    const original = getSignatureScheme();
    try {
      setSignatureScheme(new Secp256k1SignatureScheme());
      const blockchain = new Blockchain(1, { chainId: 89 });
      const wallet = new Wallet({ chainId: 89, startNonce: 0, startSigIndex: 0 });

      blockchain.minePendingTransactions(wallet.address);

      const tx = wallet.createTransaction('recipient', 10, {
        chainId: 89,
        nonce: blockchain.getNonce(wallet.address),
        sigIndex: blockchain.getSigIndex(wallet.address),
        fee: 2,
        gasLimit: 30,
      });

      expect(blockchain.getAcceptedSignatureSchemes()).toEqual(['hajimi-wots']);
      expect(blockchain.addTransaction(tx)).toBe(false);
    } finally {
      setSignatureScheme(original);
    }
  });

  test('mixed policy can accept secp256k1 transactions', () => {
    const original = getSignatureScheme();
    try {
      setSignatureScheme(new Secp256k1SignatureScheme());
      const blockchain = new Blockchain(1, {
        chainId: 90,
        acceptedSignatureSchemes: ['hajimi-wots', 'secp256k1'],
      });
      const wallet = new Wallet({ chainId: 90, startNonce: 0, startSigIndex: 0 });

      blockchain.minePendingTransactions(wallet.address);

      const tx = wallet.createTransaction('recipient', 10, {
        chainId: 90,
        nonce: blockchain.getNonce(wallet.address),
        sigIndex: blockchain.getSigIndex(wallet.address),
        fee: 2,
        gasLimit: 30,
      });

      expect(blockchain.addTransaction(tx)).toBe(true);
    } finally {
      setSignatureScheme(original);
    }
  });

  test('fee and gas rules are enforced', () => {
    const blockchain = new Blockchain(1, { chainId: 1 });
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });

    blockchain.minePendingTransactions(wallet.address);

    const tx = wallet.createTransaction('recipient', 10, {
      nonce: blockchain.getNonce(wallet.address),
      fee: 1,
      gasLimit: 1,
      data: encodeProgram([
        { op: 'LOG', message: 'a lot of gas usage here' },
        { op: 'STOP' },
      ]),
    });

    expect(blockchain.addTransaction(tx)).toBe(false);
  });

  test('mining updates balances, nonces, roots', () => {
    const blockchain = new Blockchain(1, { chainId: 1, miningReward: 100 });
    const wallet1 = new Wallet({ chainId: 1, startNonce: 0 });
    const wallet2 = new Wallet({ chainId: 1, startNonce: 0 });

    blockchain.minePendingTransactions(wallet1.address);
    expect(blockchain.getBalance(wallet1.address)).toBe(100);

    const tx = wallet1.createTransaction(wallet2.address, 30, {
      nonce: blockchain.getNonce(wallet1.address),
      fee: 5,
      gasLimit: 50,
    });

    expect(blockchain.addTransaction(tx)).toBe(true);
    blockchain.minePendingTransactions(wallet2.address);

    expect(blockchain.getBalance(wallet1.address)).toBe(65);
    expect(blockchain.getBalance(wallet2.address)).toBe(135);
    expect(blockchain.getNonce(wallet1.address)).toBe(1);

    const latest = blockchain.getLatestBlock();
    expect(latest.stateRoot).toBeTruthy();
    expect(latest.txRoot).toBeTruthy();
    expect(latest.receiptsRoot).toBeTruthy();
  });

  test('pending overspend is rejected', () => {
    const blockchain = new Blockchain(1, { chainId: 1 });
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });

    blockchain.minePendingTransactions(wallet.address);

    const nonceBase = blockchain.getNonce(wallet.address);
    const tx1 = wallet.createTransaction('recipient-a', 70, {
      nonce: nonceBase,
      fee: 1,
      gasLimit: 20,
    });
    const tx2 = wallet.createTransaction('recipient-b', 70, {
      nonce: nonceBase + 1,
      fee: 1,
      gasLimit: 20,
    });

    expect(blockchain.addTransaction(tx1)).toBe(true);
    expect(blockchain.addTransaction(tx2)).toBe(false);
  });

  test('vm transfer works in state transition', () => {
    const blockchain = new Blockchain(1, { chainId: 1, miningReward: 5000 });
    const wallet1 = new Wallet({ chainId: 1, startNonce: 0 });
    const wallet2 = new Wallet({ chainId: 1, startNonce: 0 });
    const wallet3 = new Wallet({ chainId: 1, startNonce: 0 });

    blockchain.minePendingTransactions(wallet1.address);

    const tx = wallet1.createTransaction(wallet2.address, 20, {
      nonce: blockchain.getNonce(wallet1.address),
      fee: 4000,
      gasLimit: 5000,
      data: encodeProgram([
        { op: 'TRANSFER', to: wallet3.address, amount: 15 },
        { op: 'LOG', message: 'vm-ok' },
        { op: 'ASSERT_RECIPIENT', recipient: wallet2.address },
        { op: 'STOP' },
      ]),
    });

    expect(blockchain.addTransaction(tx)).toBe(true);
    blockchain.minePendingTransactions(wallet2.address);

    expect(blockchain.getBalance(wallet1.address)).toBe(965);
    expect(blockchain.getBalance(wallet2.address)).toBe(9020);
    expect(blockchain.getBalance(wallet3.address)).toBe(15);
  });

  test('chain validation catches tampering', () => {
    const blockchain = new Blockchain(1, { chainId: 1 });
    const wallet = new Wallet({ chainId: 1, startNonce: 0 });

    blockchain.minePendingTransactions(wallet.address);
    expect(blockchain.isChainValid()).toBe(true);

    blockchain.chain[1].stateRoot = '篡改';
    expect(blockchain.isChainValid()).toBe(false);
  });

  test('create and call contract tx type', () => {
    const blockchain = new Blockchain(1, { chainId: 5, miningReward: 2000 });
    const deployer = new Wallet({ chainId: 5, startNonce: 0 });
    const miner = new Wallet({ chainId: 5, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const createTx = deployer.createContract(encodeProgram([{ op: 'NOOP' }, { op: 'STOP' }]), {
      chainId: 5,
      nonce: blockchain.getNonce(deployer.address),
      fee: 500,
      gasLimit: 3000,
      amount: 0,
    });

    expect(createTx.txType).toBe(TX_TYPES.CREATE);
    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipts = blockchain.receiptsByBlock[2] || [];
    const createReceipt = createReceipts.find((r) => r.txType === TX_TYPES.CREATE);
    expect(createReceipt).toBeTruthy();
    const contractAddress = createReceipt.contractAddress;
    expect(contractAddress).toBeTruthy();
    expect(isValidAddress(contractAddress)).toBe(true);

    const contractMeta = blockchain.getContract(contractAddress);
    expect(contractMeta).toBeTruthy();
    expect(contractMeta.creator).toBe(deployer.address);
    expect(contractMeta.code).toBe(createTx.data);

    const callTx = deployer.callContract(contractAddress, 25, {
      chainId: 5,
      nonce: blockchain.getNonce(deployer.address),
      fee: 300,
      gasLimit: 2000,
      data: encodeProgram([{ op: 'STOP' }]),
    });

    expect(callTx.txType).toBe(TX_TYPES.CALL);
    expect(blockchain.addTransaction(callTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    expect(blockchain.getBalance(contractAddress)).toBe(25);
    expect(blockchain.getContractStorage(contractAddress)).toEqual({});
  });

  test('reject call to unknown contract', () => {
    const blockchain = new Blockchain(1, { chainId: 9 });
    const wallet = new Wallet({ chainId: 9, startNonce: 0 });

    blockchain.minePendingTransactions(wallet.address);

    const tx = wallet.callContract('哈合约不存在', 1, {
      chainId: 9,
      nonce: blockchain.getNonce(wallet.address),
      fee: 100,
      gasLimit: 500,
      data: encodeProgram([{ op: 'STOP' }]),
    });

    expect(blockchain.addTransaction(tx)).toBe(false);
  });

  test('create supports init/runtime split', () => {
    const blockchain = new Blockchain(1, { chainId: 12, miningReward: 3000 });
    const deployer = new Wallet({ chainId: 12, startNonce: 0 });
    const miner = new Wallet({ chainId: 12, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const runtimeCode = encodeProgram([{ op: 'STOP' }]);
    const initCode = encodeProgram([
      { op: 'SSTORE', key: 'boot', value: 'ready' },
      { op: 'RETURN', data: runtimeCode },
    ]);

    const createTx = deployer.createContract(initCode, {
      chainId: 12,
      nonce: blockchain.getNonce(deployer.address),
      fee: 2000,
      gasLimit: 6000,
      amount: 0,
    });

    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipt = (blockchain.receiptsByBlock[2] || []).find((r) => r.txHash === createTx.txHash);
    const contractAddress = createReceipt.contractAddress;
    const meta = blockchain.getContract(contractAddress);
    expect(meta.code).toBe(runtimeCode);
    expect(meta.initCode).toBe(initCode);
    expect(blockchain.getContractStorage(contractAddress, 'boot')).toBe('ready');
  });

  test('call executes contract code and persists storage', () => {
    const blockchain = new Blockchain(1, { chainId: 15, miningReward: 10000 });
    const deployer = new Wallet({ chainId: 15, startNonce: 0 });
    const miner = new Wallet({ chainId: 15, startNonce: 0 });
    const beneficiary = new Wallet({ chainId: 15, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const code = encodeProgram([
      { op: 'SSTORE', key: 'greeting', value: 'hakimi' },
      { op: 'TRANSFER', to: beneficiary.address, amount: 5 },
      { op: 'RETURN', data: 'done' },
    ]);

    const createTx = deployer.createContract(code, {
      chainId: 15,
      nonce: blockchain.getNonce(deployer.address),
      fee: 2000,
      gasLimit: 3000,
      amount: 0,
    });
    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipt = (blockchain.receiptsByBlock[2] || []).find((r) => r.txType === TX_TYPES.CREATE);
    const contractAddress = createReceipt.contractAddress;

    const senderBefore = blockchain.getBalance(deployer.address);
    const contractBefore = blockchain.getBalance(contractAddress);
    const beneficiaryBefore = blockchain.getBalance(beneficiary.address);

    const callAmount = 20;
    const callFee = 3000;
    const callTx = deployer.callContract(contractAddress, callAmount, {
      chainId: 15,
      nonce: blockchain.getNonce(deployer.address),
      fee: callFee,
      gasLimit: 9000,
      data: '',
    });

    expect(blockchain.addTransaction(callTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const callReceipt = (blockchain.receiptsByBlock[3] || []).find((r) => r.txHash === callTx.txHash);
    expect(callReceipt.success).toBe(true);
    expect(callReceipt.returnData).toBe('done');
    expect(blockchain.getContractStorage(contractAddress, 'greeting')).toBe('hakimi');
    expect(blockchain.state.storage[contractAddress].greeting.startsWith('哈槽')).toBe(true);
    expect(blockchain.getBalance(beneficiary.address) - beneficiaryBefore).toBe(5);
    expect(blockchain.getBalance(contractAddress) - contractBefore).toBe(callAmount - 5);
    expect(blockchain.getBalance(deployer.address)).toBe(senderBefore - callAmount - callFee);
  });

  test('reverted call rolls back state and value but charges fee', () => {
    const blockchain = new Blockchain(1, { chainId: 16, miningReward: 10000 });
    const deployer = new Wallet({ chainId: 16, startNonce: 0 });
    const miner = new Wallet({ chainId: 16, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const createTx = deployer.createContract(
      encodeProgram([
        { op: 'SSTORE', key: 'x', value: '1' },
        { op: 'REVERT', message: 'rollback' },
      ]),
      {
        chainId: 16,
        nonce: blockchain.getNonce(deployer.address),
        fee: 500,
        gasLimit: 3000,
        amount: 0,
      }
    );

    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipt = (blockchain.receiptsByBlock[2] || []).find((r) => r.txType === TX_TYPES.CREATE);
    const contractAddress = createReceipt.contractAddress;

    const senderBefore = blockchain.getBalance(deployer.address);
    const contractBefore = blockchain.getBalance(contractAddress);
    const nonceBefore = blockchain.getNonce(deployer.address);

    const callTx = deployer.callContract(contractAddress, 9, {
      chainId: 16,
      nonce: nonceBefore,
      fee: 1200,
      gasLimit: 9000,
      data: '',
    });

    expect(blockchain.addTransaction(callTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const callReceipt = (blockchain.receiptsByBlock[3] || []).find((r) => r.txHash === callTx.txHash);
    expect(callReceipt.success).toBe(false);
    expect(callReceipt.returnData).toBe('rollback');
    expect(blockchain.getContractStorage(contractAddress, 'x')).toBeNull();
    expect(blockchain.getBalance(contractAddress)).toBe(contractBefore);
    expect(blockchain.getBalance(deployer.address)).toBe(senderBefore - 1200);
    expect(blockchain.getNonce(deployer.address)).toBe(nonceBefore + 1);
  });

  test('call supports calldata and callvalue assertions', () => {
    const blockchain = new Blockchain(1, { chainId: 17, miningReward: 8000 });
    const deployer = new Wallet({ chainId: 17, startNonce: 0 });
    const miner = new Wallet({ chainId: 17, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const createTx = deployer.createContract(
      encodeProgram([
        { op: 'ASSERT_CALLDATA_EQ', data: 'ping' },
        { op: 'ASSERT_CALL_VALUE', value: 7 },
        { op: 'SSTORE', key: 'mode', value: 'ok' },
        { op: 'RETURN', data: 'pong' },
      ]),
      {
        chainId: 17,
        nonce: blockchain.getNonce(deployer.address),
        fee: 2200,
        gasLimit: 7000,
        amount: 0,
      }
    );

    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipt = (blockchain.receiptsByBlock[2] || []).find((r) => r.txType === TX_TYPES.CREATE);
    const contractAddress = createReceipt.contractAddress;

    const okCall = deployer.callContract(contractAddress, 7, {
      chainId: 17,
      nonce: blockchain.getNonce(deployer.address),
      fee: 1600,
      gasLimit: 5000,
      data: 'ping',
    });
    expect(blockchain.addTransaction(okCall)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const okReceipt = (blockchain.receiptsByBlock[3] || []).find((r) => r.txHash === okCall.txHash);
    expect(okReceipt.success).toBe(true);
    expect(okReceipt.returnData).toBe('pong');
    expect(blockchain.getContractStorage(contractAddress, 'mode')).toBe('ok');

    const badCall = deployer.callContract(contractAddress, 7, {
      chainId: 17,
      nonce: blockchain.getNonce(deployer.address),
      fee: 1600,
      gasLimit: 5000,
      data: 'wrong',
    });
    expect(blockchain.addTransaction(badCall)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const badReceipt = (blockchain.receiptsByBlock[4] || []).find((r) => r.txHash === badCall.txHash);
    expect(badReceipt.success).toBe(false);
    expect(badReceipt.logs.join('|')).toContain('调用数据全等断言失败');
  });

  test('call can persist calldata slices into storage', () => {
    const blockchain = new Blockchain(1, { chainId: 18, miningReward: 5000 });
    const deployer = new Wallet({ chainId: 18, startNonce: 0 });
    const miner = new Wallet({ chainId: 18, startNonce: 0 });

    blockchain.minePendingTransactions(deployer.address);

    const createTx = deployer.createContract(
      encodeProgram([
        { op: 'ASSERT_CALLDATA_PREFIX', prefix: 'name=' },
        { op: 'CALLDATA_SLICE', key: 'name', offset: 5, length: 5 },
        { op: 'RETURN', data: 'stored' },
      ]),
      {
        chainId: 18,
        nonce: blockchain.getNonce(deployer.address),
        fee: 2200,
        gasLimit: 7000,
        amount: 0,
      }
    );

    expect(blockchain.addTransaction(createTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const createReceipt = (blockchain.receiptsByBlock[2] || []).find((r) => r.txType === TX_TYPES.CREATE);
    const contractAddress = createReceipt.contractAddress;

    const callTx = deployer.callContract(contractAddress, 0, {
      chainId: 18,
      nonce: blockchain.getNonce(deployer.address),
      fee: 1600,
      gasLimit: 5000,
      data: 'name=alice',
    });

    expect(blockchain.addTransaction(callTx)).toBe(true);
    blockchain.minePendingTransactions(miner.address);

    const callReceipt = (blockchain.receiptsByBlock[3] || []).find((r) => r.txHash === callTx.txHash);
    expect(callReceipt.success).toBe(true);
    expect(callReceipt.returnData).toBe('stored');
    expect(blockchain.getContractStorage(contractAddress, 'name')).toBe('alice');
  });
});

describe('TestSignatureScheme', () => {
  test('native hajimi signature scheme works', () => {
    const original = getSignatureScheme();
    try {
      setSignatureScheme(new HajimiWOTSSignatureScheme());
      const wallet = new Wallet({ chainId: 1, startNonce: 0 });
      const tx = wallet.createTransaction('recipient', 3, {
        nonce: 0,
        fee: 2,
        gasLimit: 100,
      });
      expect(tx.sender.startsWith('哈原生')).toBe(true);
      expect(tx.verify({ chainId: 1 })).toBe(true);
    } finally {
      setSignatureScheme(original);
    }
  });

  test('signature scheme is pluggable', () => {
    const original = getSignatureScheme();

    class CustomSecpScheme extends Secp256k1SignatureScheme {
      constructor() {
        super();
        this.name = 'custom-secp';
      }
    }

    try {
      setSignatureScheme(new CustomSecpScheme());
      const wallet = new Wallet({ chainId: 1, startNonce: 0 });
      const tx = wallet.createTransaction('recipient', 1, {
        nonce: 0,
        fee: 1,
        gasLimit: 30,
      });
      expect(tx.verify({ chainId: 1 })).toBe(true);
    } finally {
      setSignatureScheme(original);
    }
  });
});
