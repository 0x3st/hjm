# Getting Started

## What is HJM?

HJM replaces the hexadecimal addresses and hashes in traditional blockchains with an encoding based on 27 Chinese characters such as **"哈基米莫南北绿豆阿西呀库"**.

It's not a toy — it features a full account model, PoW consensus, transaction signing, a contract VM, and a state tree. Everything is just represented in Hajimi ternary.

Key features:

| Feature | Description |
|---------|-------------|
| Hajimi Encoding | Base-27 tryte encoding, bidirectional byte ↔ Chinese character conversion |
| Troika Hash | Ternary-friendly hash algorithm used for all hashing |
| Account Model | ETH-style with nonce / sigIndex / chainId / fee / gasLimit |
| Transaction Types | `TRANSFER`, `CREATE` (deploy contract), `CALL` (invoke contract) |
| Trit PoW | Difficulty measured by leading zero trits (HaQi value H) |
| State Commitments | Block header includes txRoot / stateRoot / receiptsRoot |
| HJM VM | Script execution, storage R/W, internal transfers, gas metering |
| Pluggable Signatures | Default `hajimi-wots` (hash-based), switchable to `secp256k1` |
| Address Checksum | Prefix + version + body + 4-byte checksum, tamper-detectable |
| Rollback Semantics | `REVERT` rolls back state changes, keeps failed receipt, deducts fee |

## Install

```bash
git clone https://github.com/0x3st/hjm.git
cd hjm
npm install

# Global install (optional, enables the `hjm` command)
npm install -g .
```

## Quick Start

Fastest way to try it — one-click demo:

```bash
hjm demo
# or
node cli.js demo
```

This automatically runs: create wallets → mine → transfer → deploy contract → call contract → validate chain.

You can also start a node and interact manually:

```bash
# Terminal 1: start node
hjm node

# Terminal 2: interact
hjm new --show-private-key          # create wallet
hjm mine <address>                   # mine for initial balance
hjm balance <address>                # check balance
hjm transfer <privkey> <to> 100     # transfer
hjm mine <address>                   # confirm
hjm info                             # chain status
```

## JS API Usage

```javascript
const { Blockchain, Wallet, encodeHex, decodeToHex, encodeProgram } = require('hajimi-chain');

// Encoding
encodeHex('0xdeadbeef');   // → Hajimi string
decodeToHex('哈基米...');   // → 0x...

// Create chain and wallets
const chain = new Blockchain({ chainId: 1, miningReward: 1000, haQiValue: 1 });
const alice = new Wallet({ chainId: 1, startNonce: 0 });
const bob   = new Wallet({ chainId: 1, startNonce: 0 });

// Mine for initial balance
chain.minePendingTransactions(alice.address);

// Transfer
const tx = alice.createTransaction(bob.address, 30, {
  chainId: 1,
  nonce: chain.getNonce(alice.address),
  sigIndex: chain.getSigIndex(alice.address),
  fee: 500,
  gasLimit: 1000,
  data: encodeProgram([
    { op: 'LOG', message: 'transfer-ok' },
    { op: 'STOP' },
  ]),
});
chain.addTransaction(tx);
chain.minePendingTransactions(bob.address);

console.log('alice:', chain.getBalance(alice.address));
console.log('bob:',   chain.getBalance(bob.address));
console.log('valid:', chain.isChainValid());
```
