# 地址体系

| 前缀 | 含义 |
|------|------|
| `哈原生` | 外部账户（hajimi-wots 签名） |
| `哈曲线` | 外部账户（secp256k1 签名） |
| `哈合约` | 合约地址 |

地址结构：`前缀 + 版本tryte + 主体 + 4字节校验码`

```javascript
const { Wallet, isValidAddress } = require('hajimi-chain');

const w = new Wallet();
console.log(w.address);              // 哈原生...
console.log(isValidAddress(w.address)); // true

const bad = w.address.slice(0, -1) + '哈';
console.log(isValidAddress(bad));    // false
```
