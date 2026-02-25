# Architecture

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

## Relation to ETH

- Uses ETH-style account model (not BTC UTXO)
- Has nonce / sigIndex / chainId / fee / gas and state commitments
- Educational/experimental implementation, not an EVM-compatible production chain

## Testing

```bash
npm test                        # run all tests
node examples/simple_test.js    # basic feature check
node examples/quick_test.js     # quick chain demo
node examples/demo.js           # full demo
```
