# JSON-RPC API

节点启动后暴露 JSON-RPC 2.0 接口（默认 `http://127.0.0.1:8546`）。

```bash
curl -X POST http://127.0.0.1:8546 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"hjm_info","params":[]}'
```

## 可用方法

| 方法 | 参数 | 说明 |
|------|------|------|
| `hjm_info` | — | 链信息 |
| `hjm_newWallet` | — | 创建钱包 |
| `hjm_importWallet` | `[privateKey]` | 导入钱包 |
| `hjm_getBalance` | `[address]` | 查余额 |
| `hjm_getNonce` | `[address]` | 查 nonce / sigIndex |
| `hjm_mine` | `[minerAddress]` | 挖矿 |
| `hjm_transfer` | `[from, to, amount, opts?]` | 转账 |
| `hjm_deploy` | `[from, codeOps, opts?]` | 部署合约 |
| `hjm_call` | `[from, contract, amount, opts?]` | 调用合约 |
| `hjm_getStorage` | `[contract, key?]` | 查合约存储 |
| `hjm_getReceipts` | `[blockIndex]` | 查区块收据 |
| `hjm_listWallets` | — | 列出节点钱包 |
