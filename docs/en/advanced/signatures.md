# Signature Schemes

| Scheme | Description |
|--------|-------------|
| `hajimi-wots` (default) | Troika-based stateful hash signature, one signature tree per address, `sigIndex` selects one-time leaf |
| `secp256k1` (optional) | Compatible with traditional elliptic curve signatures |

The chain only accepts `hajimi-wots` by default. For dev/testing:

```javascript
const chain = new Blockchain({
  chainId: 1,
  acceptedSignatureSchemes: ['hajimi-wots', 'secp256k1'],
});
```

## Switch Signature Scheme

```javascript
const { setSignatureScheme, Secp256k1SignatureScheme } = require('hajimi-chain');
setSignatureScheme(new Secp256k1SignatureScheme());
```
