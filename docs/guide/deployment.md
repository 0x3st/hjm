# 部署节点

这一页讲怎么把 HJM 从本地 demo 变成一个真的多节点网络。

HJM 仍然是教学项目，但现在已经支持几个部署必需能力：

- P2P 对外宣告地址：`--p2p-advertise`
- 链参数握手校验：`chainId`、`haQiValue`、`miningReward`、签名方案必须一致
- 链快照持久化：`--data-dir`
- Docker / Docker Compose

## 端口

默认端口：

| 端口 | 用途 |
| --- | --- |
| `8546` | JSON-RPC |
| `6001` | P2P WebSocket |

公网部署时，优先开放 P2P 端口。RPC 端口不建议直接暴露给公网，因为它可以创建钱包、提交交易、挖矿和部署合约。

## 单台 VPS

在服务器上安装依赖：

```bash
npm install
```

启动节点：

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --port 8546 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://<你的公网IP>:6001 \
  --data-dir .hjm-node
```

只需要在防火墙开放：

```text
6001/tcp
```

如果你确实要让外部访问 RPC，可以改成：

```bash
--rpc-host 0.0.0.0
```

同时加上公网 RPC 模式：

```bash
--public-rpc
```

`--public-rpc` 会在 HTTP JSON-RPC 层只允许查询类方法和 `hjm_sendRawTransaction`，挡住 `hjm_transfer`、`hjm_importWallet`、`hjm_newWallet`、`hjm_mine` 这类更适合本机教学或私有管理的命令。

## 多台 VPS

假设 A 节点公网 IP 是 `1.1.1.1`，B 节点公网 IP 是 `2.2.2.2`。

A 节点：

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://1.1.1.1:6001 \
  --data-dir .hjm-node
```

B 节点：

```bash
node cli.js node \
  --rpc-host 127.0.0.1 \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://2.2.2.2:6001 \
  --seeds ws://1.1.1.1:6001 \
  --data-dir .hjm-node
```

两个节点必须使用相同链参数：

```text
--chain-id
--haqi
--reward
```

如果这些参数不同，握手会断开，避免错链互连。

## Docker

构建镜像：

```bash
docker build -t hajimi-chain .
```

启动单节点：

```bash
docker run -d \
  --name hjm-node \
  -p 6001:6001 \
  -v hjm-node-data:/data \
  hajimi-chain \
  node cli.js node \
    --rpc-host 127.0.0.1 \
    --p2p-port 6001 \
    --p2p-advertise ws://<你的公网IP>:6001 \
    --data-dir /data
```

如果需要在宿主机访问 RPC，把 `--rpc-host` 改成 `0.0.0.0` 并映射 `8546`：

```bash
-p 8546:8546
```

## Docker Compose 三节点

项目自带 `docker-compose.yml`，可以直接启动三个节点：

```bash
docker compose up --build
```

查看节点 A：

```bash
node cli.js peers --rpc http://127.0.0.1:8546
```

查看节点 B：

```bash
node cli.js peers --rpc http://127.0.0.1:8547
```

三个节点的数据分别存在 Docker volume 里，容器重启后会从 `/data/chain.json` 恢复链。

## 持久化说明

`--data-dir` 会保存：

```text
chain.json
```

里面包含区块链快照。节点启动时会加载并校验这条链。

注意：钱包私钥不会保存到 `chain.json`。需要转账或部署合约时，请重新提供私钥或重新导入钱包。

## 公共 RPC 网关

如果你要给普通用户提供 RPC，推荐只公开这些方法：

```text
hjm_info
hjm_getBalance
hjm_getNonce
hjm_getStorage
hjm_getReceipts
hjm_sendRawTransaction
hjm_peers
```

关键是 `hjm_sendRawTransaction`：用户在本地签名，RPC 节点只接收已经签好的交易。

启动公开 RPC 时，建议这样写：

```bash
node cli.js node \
  --rpc-host 0.0.0.0 \
  --port 8546 \
  --public-rpc \
  --p2p-host 0.0.0.0 \
  --p2p-port 6001 \
  --p2p-advertise ws://<你的公网IP>:6001 \
  --data-dir .hjm-node
```

CLI 里对应的安全命令是：

```bash
node cli.js transfer-local <私钥> <目标地址> 100 --rpc https://rpc.example.com
node cli.js deploy-local <私钥> '<指令JSON>' --rpc https://rpc.example.com
node cli.js call-local <私钥> <合约地址> --rpc https://rpc.example.com
```

这些命令会：

```text
查询 nonce/sigIndex -> 本地签名 -> 调 hjm_sendRawTransaction 提交
```

私钥不会发送给 RPC 节点。

下面这些旧命令适合本机教学，不建议开放给公网用户：

```text
hjm_transfer
hjm_deploy
hjm_call
hjm_importWallet
hjm_newWallet
```

因为它们会让节点持有或使用用户私钥。

## 部署检查清单

启动前确认：

- 每个节点都有不同的 P2P 监听端口，或者运行在不同机器上。
- `--p2p-advertise` 是其他机器能访问到的 `ws://host:port`。
- 所有节点的 `--chain-id`、`--haqi`、`--reward` 一致。
- 防火墙开放 P2P 端口。
- 不要随便把 RPC 端口暴露到公网。
