<p align="center">
  <strong>H a j i m i &nbsp; B l o c k c h a i n</strong><br/>
  <code>HJM v0.3.0</code>
</p>

<p align="center">
  An Ethereum-style blockchain encoded in Chinese characters — addresses are Hajimi, hashes are Hajimi, even PoW counts HaQi.
</p>

<p align="center">
  <a href="./README.md">中文</a> | English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D16-green" alt="node" />
  <img src="https://img.shields.io/badge/version-0.3.0-orange" alt="version" />
  <a href="https://www.npmjs.com/package/hajimi-chain"><img src="https://img.shields.io/npm/v/hajimi-chain" alt="npm" /></a>
</p>

---

## Table of Contents

- [What is HJM?](#what-is-hjm)
- [Install](#install)
- [Quick Start](#quick-start)
- [CLI](#cli)
- [JSON-RPC API](#json-rpc-api)
- [Core Concepts](#core-concepts)
- [Smart Contracts](#smart-contracts)
- [HJM VM Instructions](#hjm-vm-instructions)
- [Signature Schemes](#signature-schemes)
- [Address System](#address-system)
- [HaQi Difficulty System](#haqi-difficulty-system)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [License](#license)

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
npm install hajimi-chain
```

Or install from source:

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

JS API usage:

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

<!-- PLACEHOLDER_CLI -->

## CLI

HJM CLI has two categories: offline commands (no node needed) and chain commands (require `hjm node`).

### Offline Commands

```bash
hjm new [--show-private-key]    # create new wallet
hjm import <private_key>        # import wallet
hjm encode 0xdeadbeef           # hex → Hajimi
hjm decode <hajimi_string>      # Hajimi → hex
hjm demo                        # one-click full demo
```

### Node + Chain Interaction

```bash
# Start node (default 127.0.0.1:8546)
hjm node [--port 8546] [--haqi 1] [--reward 1000] [--chain-id 1]

# Commands below connect to a running node (use --rpc <url> to override)
hjm info                                    # chain info
hjm balance <address>                       # check balance
hjm mine <address>                          # mine a block
hjm transfer <privkey> <to> <amount>        # transfer
hjm deploy <privkey> '<instructions_json>'  # deploy contract
hjm call <privkey> <contract> [amount]      # call contract
hjm storage <contract> [key]                # query contract storage
hjm receipts <block_index>                  # query block receipts
hjm wallets                                 # list node wallets
```

Example — deploy a storage contract:

```bash
hjm deploy <privkey> '[{"op":"SSTORE","key":"hello","value":"hakimi"},{"op":"RETURN","data":"ok"}]'
hjm mine <address>
hjm receipts 2
hjm storage <contract_address> hello
```

## JSON-RPC API

The node exposes a JSON-RPC 2.0 interface (default `http://127.0.0.1:8546`).

```bash
curl -X POST http://127.0.0.1:8546 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"hjm_info","params":[]}'
```

Available methods:

| Method | Params | Description |
|--------|--------|-------------|
| `hjm_info` | — | Chain info |
| `hjm_newWallet` | — | Create wallet |
| `hjm_importWallet` | `[privateKey]` | Import wallet |
| `hjm_getBalance` | `[address]` | Get balance |
| `hjm_getNonce` | `[address]` | Get nonce / sigIndex |
| `hjm_mine` | `[minerAddress]` | Mine a block |
| `hjm_transfer` | `[from, to, amount, opts?]` | Transfer |
| `hjm_deploy` | `[from, codeOps, opts?]` | Deploy contract |
| `hjm_call` | `[from, contract, amount, opts?]` | Call contract |
| `hjm_getStorage` | `[contract, key?]` | Query contract storage |
| `hjm_getReceipts` | `[blockIndex]` | Query block receipts |
| `hjm_listWallets` | — | List node wallets |

## Core Concepts

**Encoding**: Each byte is split into 2 base-27 trytes, mapped to Chinese characters.

```
Byte data → base-27 split → Chinese character string
```

**Address generation**:

```
Private key → Public key → Troika hash → last 20 bytes → Hajimi encode → add prefix/version/checksum
```

**Transaction flow**:

```
Create tx → canonical serialize → Troika hash → sign → mempool → mine → state transition → on-chain
```

<!-- PLACEHOLDER_CONTRACTS -->

## Smart Contracts

Deploy a contract (CREATE):

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

Call a contract (CALL):

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

Init/runtime two-phase deployment (closer to ETH):

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

## HJM VM Instructions

| Instruction | Description |
|-------------|-------------|
| `NOOP` | No operation |
| `LOG <text>` | Output log |
| `TRANSFER <addr> <amount>` | Internal transfer |
| `SLOAD <key>` | Read contract storage |
| `SSTORE <key> <value>` | Write contract storage |
| `RETURN <data>` | Return data and halt |
| `REVERT <message>` | Rollback and return error |
| `ASSERT_RECIPIENT <addr>` | Assert recipient address |
| `ASSERT_SENDER <addr>` | Assert sender address |
| `ASSERT_CHAIN_ID <id>` | Assert chain ID |
| `ASSERT_CALLDATA_EQ <text>` | Assert callData exact match |
| `ASSERT_CALLDATA_PREFIX <text>` | Assert callData prefix match |
| `ASSERT_CALL_VALUE <amount>` | Assert attached call value |
| `CALLDATA_LOAD <key>` | Load callData field |
| `CALLDATA_SLICE <key> <offset> <len>` | Slice callData segment |

Gas rules:
- Each instruction costs bytecode trit cost + fixed instruction cost
- Transaction requires `fee >= gasUsed` and `gasLimit >= gasUsed`
- `REVERT` rolls back storage/value changes, receipt has `success=false`

<!-- PLACEHOLDER_REST -->

## Signature Schemes

| Scheme | Description |
|--------|-------------|
| `hajimi-wots` (default) | Troika-based stateful hash signature, one signature tree per address, `sigIndex` selects one-time leaf |
| `secp256k1` (optional) | Compatible with traditional elliptic curve signatures |

The chain only accepts `hajimi-wots` by default. For dev/testing:

```javascript
const chain = new Blockchain({
  chainId: 1,
  acceptedSignatureSchemes: ['hajimi-wots', 'secp256k1'],
});
```

Switch signature scheme:

```javascript
const { setSignatureScheme, Secp256k1SignatureScheme } = require('hajimi-chain');
setSignatureScheme(new Secp256k1SignatureScheme());
```

## Address System

| Prefix | Meaning |
|--------|---------|
| `哈原生` | External account (hajimi-wots signature) |
| `哈曲线` | External account (secp256k1 signature) |
| `哈合约` | Contract address |

Address structure: `prefix + version tryte + body + 4-byte checksum`

```javascript
const { Wallet, isValidAddress } = require('hajimi-chain');

const w = new Wallet();
console.log(w.address);              // 哈原生...
console.log(isValidAddress(w.address)); // true

const bad = w.address.slice(0, -1) + '哈';
console.log(isValidAddress(bad));    // false
```

## HaQi Difficulty System

PoW difficulty is expressed as "HaQi value" — essentially the number of leading zero trits.

| Concept | Formula | Description |
|---------|---------|-------------|
| HaQi Value H | — | Leading zero trit count, consensus variable |
| HaQi Level | `floor(H / 3)` | Display tier |
| HaQi Point | `H % 3` | Display remainder |
| HaQi Pressure | `3^H` | Work magnitude (display value) |

Each +1 to H increases expected computation cost by ~3x.

## Project Structure

```
hjm/
├── hjm/
│   ├── index.js              # Unified exports
│   ├── encoding.js           # Hajimi encoding & trit/byte conversion
│   ├── codec.js              # Canonical serialization (fixed field order + length prefix)
│   ├── crypto.js             # Troika hash + pluggable signatures
│   ├── troika.js             # Troika hash implementation
│   ├── transaction.js        # Transaction model
│   ├── vm.js                 # HJM VM
│   ├── state_transition.js   # State transition & roots computation
│   ├── block.js              # Block model & trit PoW
│   ├── blockchain.js         # Block production, chain validation, mempool
│   ├── wallet.js             # Wallet & signing
│   └── rpc.js                # JSON-RPC node server
├── examples/                 # Example scripts
├── tests/                    # Jest tests
├── cli.js                    # CLI tool
└── package.json
```

## Testing

```bash
npm test                        # run all tests
node examples/simple_test.js    # basic feature check
node examples/quick_test.js     # quick chain demo
node examples/demo.js           # full demo
```

## Relation to ETH

- Uses ETH-style account model (not BTC UTXO)
- Has nonce / sigIndex / chainId / fee / gas and state commitments
- Educational/experimental implementation, not an EVM-compatible production chain

## License

MIT
