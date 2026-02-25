# Address System

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
