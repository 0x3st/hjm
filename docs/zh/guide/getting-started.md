# 快速开始

## 安装

```bash
npm install hajimi-chain
```

或从源码安装：

```bash
git clone https://github.com/0x3st/hjm.git
cd hjm
npm install

# 全局安装（可选，安装后可直接用 hjm 命令）
npm install -g .
```

## 一键 Demo

最快的体验方式——一键 demo：

```bash
hjm demo
# 或
node cli.js demo
```

会自动完成：创建钱包 → 挖矿 → 转账 → 部署合约 → 调用合约 → 验链。

## 手动操作

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

## JS API 用法

```javascript
const { Blockchain, Wallet, encodeHex, decodeToHex, encodeProgram } = require('hajimi-chain');

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
