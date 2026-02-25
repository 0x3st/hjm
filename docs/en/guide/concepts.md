# Core Concepts

## Encoding

Each byte is split into 2 base-27 trytes, mapped to Chinese characters.

```
Byte data → base-27 split → Chinese character string
```

## Address Generation

```
Private key → Public key → Troika hash → last 20 bytes → Hajimi encode → add prefix/version/checksum
```

## Transaction Flow

```
Create tx → canonical serialize → Troika hash → sign → mempool → mine → state transition → on-chain
```
