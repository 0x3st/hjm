# 签名方案

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

## 切换签名方案

```javascript
const { setSignatureScheme, Secp256k1SignatureScheme } = require('./hjm');
setSignatureScheme(new Secp256k1SignatureScheme());
```
