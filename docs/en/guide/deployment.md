# Deploy Nodes

This page shows how to turn HJM from a local demo into a real multi-node network.

HJM is still educational, but it now supports the minimum pieces needed for deployment:

- P2P advertised address: `--p2p-advertise`
- Network parameter checks during handshake
- Chain snapshot persistence: `--data-dir`
- Docker and Docker Compose

## Ports

| Port | Purpose |
| --- | --- |
| `8546` | JSON-RPC |
| `6001` | P2P WebSocket |

For public deployment, prefer exposing only the P2P port. Do not expose JSON-RPC to the public internet unless you know what you are doing.

## Single VPS

```bash
npm install
```

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --port 8546 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://<your-public-ip>:6001 \
  --data-dir .hjm-node
```

Open only:

```text
6001/tcp
```

## Multiple VPS Nodes

Node A:

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://1.1.1.1:6001 \
  --data-dir .hjm-node
```

Node B:

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://2.2.2.2:6001 \
  --seeds ws://1.1.1.1:6001 \
  --data-dir .hjm-node
```

All nodes must share the same `--chain-id`, `--haqi`, and `--reward`.

## Docker Compose

Start three local nodes:

```bash
docker compose up --build
```

Inspect peers:

```bash
node cli.js peers --rpc http://127.0.0.1:8546
node cli.js peers --rpc http://127.0.0.1:8547
```

Each container stores its chain in `/data/chain.json`, backed by a Docker volume.

## Persistence

`--data-dir` stores:

```text
chain.json
```

The node loads and validates this chain snapshot on startup.

Private keys are not saved in `chain.json`. Provide the private key again when you need to send transactions or deploy contracts.

## Public RPC Gateway

If you want normal users to access RPC, expose only a small public method set:

```text
hjm_info
hjm_getBalance
hjm_getNonce
hjm_getStorage
hjm_getReceipts
hjm_sendRawTransaction
hjm_peers
```

`hjm_sendRawTransaction` is the important method: users sign transactions locally, and the RPC node only receives already-signed transactions.

The safer CLI commands are:

```bash
node cli.js transfer-local <privateKey> <to> 100 --rpc https://rpc.example.com
node cli.js deploy-local <privateKey> '<opsJson>' --rpc https://rpc.example.com
node cli.js call-local <privateKey> <contractAddress> --rpc https://rpc.example.com
```

They do:

```text
query nonce/sigIndex -> sign locally -> submit via hjm_sendRawTransaction
```

The private key is not sent to the RPC node.

These legacy teaching methods should not be exposed to public users:

```text
hjm_transfer
hjm_deploy
hjm_call
hjm_importWallet
hjm_newWallet
```
