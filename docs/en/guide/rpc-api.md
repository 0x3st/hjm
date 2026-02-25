# JSON-RPC API

The node exposes a JSON-RPC 2.0 interface (default `http://127.0.0.1:8546`).

```bash
curl -X POST http://127.0.0.1:8546 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"hjm_info","params":[]}'
```

## Available Methods

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
