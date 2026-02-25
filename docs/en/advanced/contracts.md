# Smart Contracts

## Deploy a Contract (CREATE)

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

## Call a Contract (CALL)

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

## Init/Runtime Two-Phase Deployment

This approach is closer to ETH's deployment model:

```javascript
const runtimeCode = encodeProgram([{ op: 'STOP' }]);
const initCode = encodeProgram([
  { op: 'SSTORE', key: 'boot', value: 'ready' }, // constructor writes state
  { op: 'RETURN', data: runtimeCode },            // returns runtime code
]);
const createTx = alice.createContract(initCode, { /* ... */ });
```

- If constructor succeeds and `RETURN` contains valid bytecode → init/runtime mode
- Otherwise falls back to legacy mode: `tx.data` used directly as runtime code
