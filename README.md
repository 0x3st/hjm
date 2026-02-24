<p align="center">
  <strong>哈 基 米 区 块 链</strong><br/>
  <code>HJM v0.3.0</code>
</p>

<p align="center">
  用中文字符编码的以太坊风格区块链 —— 地址是哈基米，哈希是哈基米，连 PoW 都在数哈气。
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license" />
  <img src="https://img.shields.io/badge/node-%3E%3D16-green" alt="node" />
  <img src="https://img.shields.io/badge/version-0.3.0-orange" alt="version" />
</p>

---

## 目录

- [这是什么](#这是什么)
- [安装](#安装)
- [快速开始](#快速开始)
- [CLI 命令行](#cli-命令行)
- [JSON-RPC API](#json-rpc-api)
- [核心概念](#核心概念)
- [合约部署与调用](#合约部署与调用)
- [HJM VM 指令集](#hjm-vm-指令集)
- [签名方案](#签名方案)
- [地址体系](#地址体系)
- [哈气值系统](#哈气值系统)
- [项目结构](#项目结构)
- [测试](#测试)
- [License](#license)

## 这是什么

HJM 把传统区块链里的十六进制地址和哈希值，替换成了 **"哈基米莫南北绿豆阿西呀库"** 等 27 个中文字符组成的编码。

它不是玩具——它有完整的账户模型、PoW 共识、交易签名、合约 VM、状态树，只是所有数据都用哈基米三进制表示。

核心特性一览：

| 特性 | 说明 |
|------|------|
| 哈基米编码 | 27 进制 tryte 编码，字节数据 ↔ 中文字符双向转换 |
| Troika 哈希 | 三进制友好的哈希算法，所有哈希运算的基础 |
| 账户模型 | ETH 风格，支持 nonce / sigIndex / chainId / fee / gasLimit |
| 交易类型 | `TRANSFER`（转账）、`CREATE`（部署合约）、`CALL`（调用合约） |
| trit PoW | 按前导零 trit 数计算难度（哈气值 H） |
| 状态承诺 | 区块头包含 txRoot / stateRoot / receiptsRoot |
| HJM VM | 支持脚本执行、存储读写、内部转账、gas 计费 |
| 可插拔签名 | 默认 `hajimi-wots`（哈希签名），可切换 `secp256k1` |
| 地址校验 | 前缀 + 版本 + 主体 + 4 字节校验码，篡改可检测 |
| 回滚语义 | `REVERT` 回滚状态变更，保留失败收据并扣手续费 |

## 安装

```bash
git clone <repo-url>
cd hjm
npm install

# 全局安装（可选，安装后可直接用 hjm 命令）
npm install -g .
```

## 快速开始

最快的体验方式——一键 demo：

```bash
hjm demo
# 或
node cli.js demo
```

会自动完成：创建钱包 → 挖矿 → 转账 → 部署合约 → 调用合约 → 验链。

也可以启动节点后手动操作：

```bash
# 终端 1：启动节点
hjm node

# 终端 2：交互
hjm new --show-private-key          # 创建钱包，记下地址和私钥
hjm mine <地址>                      # 挖矿获得初始余额
hjm balance <地址>                   # 查余额
hjm transfer <私钥> <目标地址> 100   # 转账
hjm mine <地址>                      # 打包确认
hjm info                             # 查看链状态
```

JS API 用法：

```javascript
const { Blockchain, Wallet, encodeHex, decodeToHex, encodeProgram } = require('hjm');

// 编码转换
encodeHex('0xdeadbeef');   // → 哈基米字符串
decodeToHex('哈基米...');   // → 0x...

// 创建链与钱包
const chain = new Blockchain({ chainId: 1, miningReward: 1000, haQiValue: 1 });
const alice = new Wallet({ chainId: 1, startNonce: 0 });
const bob   = new Wallet({ chainId: 1, startNonce: 0 });

// 挖矿获得初始余额
chain.minePendingTransactions(alice.address);

// 转账
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

## CLI 命令行

HJM CLI 分两类：离线命令（不需要节点）和链交互命令（需要先 `hjm node`）。

### 离线命令

```bash
hjm new [--show-private-key]    # 创建新钱包
hjm import <私钥>               # 导入钱包
hjm encode 0xdeadbeef           # hex → 哈基米
hjm decode <哈基米编码>          # 哈基米 → hex
hjm demo                        # 一键演示完整流程
```

### 节点 + 链交互

```bash
# 启动节点（默认 127.0.0.1:8546）
hjm node [--port 8546] [--haqi 1] [--reward 1000] [--chain-id 1]

# 以下命令连接运行中的节点（可加 --rpc <url> 指定地址）
hjm info                                    # 链信息
hjm balance <地址>                           # 查余额
hjm mine <地址>                              # 挖矿
hjm transfer <私钥> <目标地址> <金额>         # 转账
hjm deploy <私钥> '<指令JSON>'               # 部署合约
hjm call <私钥> <合约地址> [金额]             # 调用合约
hjm storage <合约地址> [key]                  # 查合约存储
hjm receipts <区块号>                         # 查区块收据
hjm wallets                                  # 列出节点内钱包
```

示例——部署一个存储合约：

```bash
hjm deploy <私钥> '[{"op":"SSTORE","key":"hello","value":"hakimi"},{"op":"RETURN","data":"ok"}]'
hjm mine <地址>
hjm receipts 2          # 查看收据，获取合约地址
hjm storage <合约地址> hello
```

## JSON-RPC API

节点启动后暴露 JSON-RPC 2.0 接口（默认 `http://127.0.0.1:8546`）。

```bash
curl -X POST http://127.0.0.1:8546 \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"hjm_info","params":[]}'
```

可用方法：

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

## 核心概念

**编码**：每字节拆为 27 进制的 2 个 tryte，映射到中文字符。

```
字节数据 → 27 进制拆分 → 中文字符串
```

**地址生成**：

```
私钥 → 公钥 → Troika 哈希 → 取后 20 字节 → 哈基米编码 → 加前缀/版本/校验码
```

**交易流程**：

```
创建交易 → 规范序列化 → Troika 哈希 → 签名 → 入池 → 挖矿打包 → 状态转移 → 上链
```

## 合约部署与调用

部署合约（CREATE）：

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

调用合约（CALL）：

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

## HJM VM 指令集

| 指令 | 说明 |
|------|------|
| `NOOP` | 空操作 |
| `LOG <text>` | 输出日志 |
| `TRANSFER <addr> <amount>` | 内部转账 |
| `SLOAD <key>` | 读取合约存储 |
| `SSTORE <key> <value>` | 写入合约存储 |
| `RETURN <data>` | 返回数据并结束 |
| `REVERT <message>` | 回滚并返回错误信息 |
| `ASSERT_RECIPIENT <addr>` | 断言接收方地址 |
| `ASSERT_SENDER <addr>` | 断言发送方地址 |
| `ASSERT_CHAIN_ID <id>` | 断言链 ID |
| `ASSERT_CALLDATA_EQ <text>` | 断言 callData 完全匹配 |
| `ASSERT_CALLDATA_PREFIX <text>` | 断言 callData 前缀匹配 |
| `ASSERT_CALL_VALUE <amount>` | 断言调用附带金额 |
| `CALLDATA_LOAD <key>` | 加载 callData 字段 |
| `CALLDATA_SLICE <key> <offset> <len>` | 截取 callData 片段 |

gas 规则：
- 每条指令按字节码 trit 成本 + 指令固定成本累加
- 交易要求 `fee >= gasUsed` 且 `gasLimit >= gasUsed`
- `REVERT` 回滚 storage/value 变更，收据 `success=false`

## 签名方案

| 方案 | 说明 |
|------|------|
| `hajimi-wots`（默认） | 基于 Troika 的状态型哈希签名，每地址一棵签名树，`sigIndex` 选择一次性叶子 |
| `secp256k1`（可选） | 兼容传统椭圆曲线签名 |

链默认只接受 `hajimi-wots`。开发/测试可放开：

```javascript
const chain = new Blockchain({
  chainId: 1,
  acceptedSignatureSchemes: ['hajimi-wots', 'secp256k1'],
});
```

切换签名方案：

```javascript
const { setSignatureScheme, Secp256k1SignatureScheme } = require('./hjm');
setSignatureScheme(new Secp256k1SignatureScheme());
```

## 地址体系

| 前缀 | 含义 |
|------|------|
| `哈原生` | 外部账户（hajimi-wots 签名） |
| `哈曲线` | 外部账户（secp256k1 签名） |
| `哈合约` | 合约地址 |

地址结构：`前缀 + 版本tryte + 主体 + 4字节校验码`

```javascript
const { Wallet, isValidAddress } = require('./hjm');

const w = new Wallet();
console.log(w.address);              // 哈原生...
console.log(isValidAddress(w.address)); // true

const bad = w.address.slice(0, -1) + '哈';
console.log(isValidAddress(bad));    // false
```

## 哈气值系统

PoW 难度用"哈气值"表达，本质是前导零 trit 数。

| 概念 | 公式 | 说明 |
|------|------|------|
| 哈气值 H | — | 前导零 trit 数，共识变量 |
| 哈气阶 | `floor(H / 3)` | 展示分档 |
| 哈气点 | `H % 3` | 展示余位 |
| 哈气压强 | `3^H` | 工作量量级（展示值） |

H 每 +1，期望算力成本约提升 3 倍。

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

## 测试

```bash
npm test                        # 运行全部测试
node examples/simple_test.js    # 基础功能验证
node examples/quick_test.js     # 快速链演示
node examples/demo.js           # 完整演示
```

## 与 ETH 的关系

- 采用 ETH 风格账户模型（非 BTC UTXO）
- 具备 nonce / sigIndex / chainId / fee / gas 与状态承诺
- 教学/实验实现，不是兼容 EVM 的生产链

## License

MIT
