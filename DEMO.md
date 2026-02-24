# HJM 演示脚本

## 1. 编码演示

```bash
# 启动 CLI
node cli.js encode 0xdeadbeef
node cli.js decode <哈基米编码>
```

## 2. 钱包演示

```bash
# 创建新钱包
node cli.js new

# 导入钱包
node cli.js import <私钥>
```

## 3. 快速功能测试

```bash
node examples/simple_test.js
```

## 4. 区块链演示

```bash
node examples/quick_test.js
node examples/demo.js
```

## 5. JavaScript API 演示

```javascript
const { Wallet, encodeHex } = require('./hjm');

console.log(encodeHex('0x1234abcd'));

const wallet = new Wallet();
console.log(wallet.address);

const tx = wallet.createTransaction('哈基米莫南北', 100);
console.log(tx.txHash);
```

## 6. 单元测试

```bash
# 完整测试（包含挖矿）
npm test
```

## 关键特性展示

1. 中文字符编码：地址和哈希使用哈基米字符集
2. 完整加密：ECDSA 签名 + Troika 哈希
3. 区块链结构：区块、交易池、PoW 挖矿
4. 交易系统：创建、签名、验签、余额检查
5. 链校验：哈希链接、PoW、交易有效性校验
