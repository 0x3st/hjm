# 合约部署与调用

## 部署合约（CREATE）

```javascript
const code = encodeProgram([
  { op: 'SSTORE', key: 'greeting', value: 'hakimi' },
  { op: 'RETURN', data: 'ok' },
]);
const createTx = alice.createContract(code, {
  chainId: 1,
  nonce: chain.getNonce(alice.address),
  sigIndex: chain.getSigIndex(alice.address),
  fee: 2000, gasLimit: 3000, amount: 0,
});
chain.addTransaction(createTx);
chain.minePendingTransactions(bob.address);
```

## 调用合约（CALL）

```javascript
const receipt = (chain.receiptsByBlock[2] || []).find(r => r.txType === '哈创约');
const contractAddress = receipt.contractAddress;

const callTx = alice.callContract(contractAddress, 10, {
  chainId: 1,
  nonce: chain.getNonce(alice.address),
  sigIndex: chain.getSigIndex(alice.address),
  fee: 1200, gasLimit: 4000, data: '',
});
chain.addTransaction(callTx);
chain.minePendingTransactions(bob.address);

console.log(chain.getContractStorage(contractAddress, 'greeting')); // 'hakimi'
```

## init/runtime 两段式部署

还支持 init/runtime 两段式部署（更接近 ETH）：

```javascript
const runtimeCode = encodeProgram([{ op: 'STOP' }]);
const initCode = encodeProgram([
  { op: 'SSTORE', key: 'boot', value: 'ready' }, // constructor 写状态
  { op: 'RETURN', data: runtimeCode },            // 返回运行时代码
]);
const createTx = alice.createContract(initCode, { /* ... */ });
```

- constructor 成功且 `RETURN` 为合法字节码时 → init/runtime 模式
- 否则自动兼容 legacy 模式：`tx.data` 直接作为 runtime code
