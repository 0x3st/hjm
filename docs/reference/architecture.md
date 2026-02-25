# 项目结构与架构

## 项目结构

```
hjm/
├── hjm/
│   ├── index.js              # 统一导出
│   ├── encoding.js           # 哈基米编码与 trit/byte 转换
│   ├── codec.js              # 规范序列化（固定字段顺序 + 长度前缀）
│   ├── crypto.js             # Troika 哈希 + 可插拔签名
│   ├── troika.js             # Troika 哈希实现
│   ├── transaction.js        # 交易模型
│   ├── vm.js                 # HJM VM
│   ├── state_transition.js   # 状态转移与 roots 计算
│   ├── block.js              # 区块模型与 trit PoW
│   ├── blockchain.js         # 出块、验链、交易池
│   ├── wallet.js             # 钱包与签名
│   └── rpc.js                # JSON-RPC 节点服务
├── examples/                 # 示例脚本
├── tests/                    # Jest 测试
├── cli.js                    # 命令行工具
└── package.json
```

## 与 ETH 的关系

- 采用 ETH 风格账户模型（非 BTC UTXO）
- 具备 nonce / sigIndex / chainId / fee / gas 与状态承诺
- 教学/实验实现，不是兼容 EVM 的生产链

## 测试

```bash
npm test                        # 运行全部测试
node examples/simple_test.js    # 基础功能验证
node examples/quick_test.js     # 快速链演示
node examples/demo.js           # 完整演示
```
