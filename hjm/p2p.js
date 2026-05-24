/**
 * HJM P2P 网络层 - 哈基米三进制协议
 *
 * 传输格式: [1个哈基米字符=消息类型] + [哈基米编码的payload]
 * 例如握手消息: 哈蛤嗨嘿呵赫喝核合基鸡机吉叽几积击极米咪迷眯...
 *              ↑ └─ payload的哈基米编码
 *              消息类型（哈=握手）
 */

const WebSocket = require('ws');
const { Block } = require('./block');
const { Transaction } = require('./transaction');
const { encodeBytes, decodeString } = require('./encoding');

// 消息类型 → 哈基米字符
const MSG = Object.freeze({
  HANDSHAKE: '哈',   // 握手
  PEERS: '蛤',       // 节点列表
  GET_PEERS: '嗨',   // 求节点
  NEW_BLOCK: '嘿',   // 新区块
  NEW_TX: '呵',      // 新交易
  GET_CHAIN: '赫',   // 求链
  CHAIN: '喝',       // 全链
});

// 反向映射：哈基米字符 → 消息类型
const MSG_REVERSE = Object.freeze(
  Object.fromEntries(Object.entries(MSG).map(([k, v]) => [v, k]))
);

const VERSION = '0.3.0';

class P2PServer {
  constructor(chain, options = {}) {
    this.chain = chain;
    this.p2pPort = options.p2pPort || 6001;
    this.seeds = options.seeds || [];
    this.rejectPrivateIp = options.rejectPrivateIp || false;
    this.sockets = new Set();       // 所有已连接的 WebSocket
    this.knownPeers = new Set();    // 已知节点地址 ws://host:port
    this.myAddress = null;          // 自身地址，握手后由外部或启动时设置
    this.wss = null;
    this._seenBlocks = new Set();   // 已见区块哈希，防重复广播
    this._seenTxs = new Set();      // 已见交易哈希，防重复广播
    this._peerRateLimits = new Map(); // 速率限制: peerKey -> { timestamps: [] }
    this._rateLimitCleanupTimer = null;

    // 监听链事件
    this.chain.on('newBlock', (block) => this.broadcastBlock(block));
    this.chain.on('newTransaction', (tx) => this.broadcastTransaction(tx));
  }

  _checkRateLimit(peerKey, limit = 5, windowMs = 60000) {
    const now = Date.now();
    let record = this._peerRateLimits.get(peerKey);

    if (!record) {
      record = { timestamps: [], lastActivity: now };
      this._peerRateLimits.set(peerKey, record);
    }

    record.lastActivity = now;
    // 清理过期的时间戳
    record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);

    if (record.timestamps.length >= limit) {
      return false; // 超限
    }

    record.timestamps.push(now);
    return true;
  }

  _cleanupRateLimits() {
    const now = Date.now();
    const inactiveThreshold = 5 * 60 * 1000; // 5 分钟无活动

    for (const [peerKey, record] of this._peerRateLimits) {
      if (now - record.lastActivity > inactiveThreshold) {
        this._peerRateLimits.delete(peerKey);
      }
    }
  }

  _isPrivateIp(hostname) {
    // RFC1918 私有 IP 检测
    const parts = hostname.split('.');
    if (parts.length !== 4) return false;
    const nums = parts.map(p => parseInt(p, 10));
    if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return false;

    // 10.0.0.0/8
    if (nums[0] === 10) return true;
    // 172.16.0.0/12
    if (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) return true;
    // 192.168.0.0/16
    if (nums[0] === 192 && nums[1] === 168) return true;
    // 127.0.0.0/8 (loopback)
    if (nums[0] === 127) return true;

    return false;
  }

  _isValidPeerAddress(address, options = {}) {
    const rejectPrivate = options.rejectPrivateIp ?? this.rejectPrivateIp;

    try {
      const url = new URL(address);
      // 只接受 ws:// 或 wss://
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        return false;
      }
      // 检查私有 IP
      if (rejectPrivate && this._isPrivateIp(url.hostname)) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
  start(callback) {
    this.wss = new WebSocket.Server({ port: this.p2pPort }, () => {
      this.log(`P2P 服务启动，端口: ${this.p2pPort}`);
      if (callback) callback();
    });

    this.wss.on('connection', (ws, req) => {
      this._initConnection(ws);
    });

    // 启动速率限制清理定时器（每分钟清理一次）
    this._rateLimitCleanupTimer = setInterval(() => {
      this._cleanupRateLimits();
    }, 60000);

    // 连接种子节点
    for (const seed of this.seeds) {
      this.connectToPeer(seed);
    }
  }

  stop() {
    // 清除速率限制清理定时器
    if (this._rateLimitCleanupTimer) {
      clearInterval(this._rateLimitCleanupTimer);
      this._rateLimitCleanupTimer = null;
    }
    for (const ws of this.sockets) {
      ws.close();
    }
    this.sockets.clear();
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  connectToPeer(address) {
    if (address === this.myAddress) return;
    if (!this._isValidPeerAddress(address)) {
      this.log(`无效节点地址，拒绝连接: ${address}`);
      return;
    }
    if (this.knownPeers.has(address)) {
      // 检查是否已有活跃连接
      for (const ws of this.sockets) {
        if (ws._peerAddress === address && ws.readyState === WebSocket.OPEN) return;
      }
    }

    try {
      const ws = new WebSocket(address);
      ws.on('open', () => {
        this._initConnection(ws);
        ws._peerAddress = address;
        this.knownPeers.add(address);
      });
      ws.on('error', () => {});
    } catch {}
  }

  _initConnection(ws) {
    this.sockets.add(ws);

    ws.on('message', (data) => {
      try {
        // 哈基米协议解码：第一个字符=消息类型，剩余=payload
        const str = data.toString();
        if (str.length < 1) return;

        const typeChar = str[0];
        const msgType = MSG_REVERSE[typeChar];
        if (!msgType) return; // 无效消息类型

        let msgData = null;
        if (str.length > 1) {
          const payloadBytes = decodeString(str.slice(1));
          msgData = JSON.parse(payloadBytes.toString('utf8'));
        }

        this._handleMessage(ws, { type: MSG[msgType], data: msgData });
      } catch {}
    });

    ws.on('close', () => {
      this.sockets.delete(ws);
    });

    ws.on('error', () => {
      this.sockets.delete(ws);
    });

    // 发送握手
    this._send(ws, {
      type: MSG.HANDSHAKE,
      data: {
        chainId: this.chain.chainId,
        version: VERSION,
        blockHeight: this.chain.chain.length,
        p2pPort: this.p2pPort,
        address: this.myAddress,
      },
    });
  }
  _handleMessage(ws, msg) {
    const peerKey = ws._peerAddress || 'unknown';

    switch (msg.type) {
      case MSG.HANDSHAKE:
        this._onHandshake(ws, msg.data);
        break;
      case MSG.GET_PEERS:
        this._send(ws, { type: MSG.PEERS, data: [...this.knownPeers] });
        break;
      case MSG.PEERS:
        this._onPeers(msg.data);
        break;
      case MSG.NEW_BLOCK:
        this._onNewBlock(ws, msg.data);
        break;
      case MSG.NEW_TX:
        this._onNewTx(ws, msg.data);
        break;
      case MSG.GET_CHAIN:
        if (!this._checkRateLimit(peerKey, 5, 60000)) {
          this.log(`速率限制: peer ${peerKey} GET_CHAIN 请求过于频繁`);
          break;
        }
        this._send(ws, {
          type: MSG.CHAIN,
          data: this.chain.chain.map(b => b.toDict()),
        });
        break;
      case MSG.CHAIN:
        this._onChain(msg.data);
        break;
    }
  }

  _onHandshake(ws, data) {
    if (data.chainId !== this.chain.chainId) {
      this.log(`节点链标识不匹配，断开连接`);
      ws.close();
      return;
    }
    if (data.address) {
      ws._peerAddress = data.address;
      this.knownPeers.add(data.address);
    }
    // 如果对方链更长，请求同步
    if (data.blockHeight > this.chain.chain.length) {
      this._send(ws, { type: MSG.GET_CHAIN, data: null });
    }
    // 交换节点列表
    this._send(ws, { type: MSG.GET_PEERS, data: null });
  }

  _onPeers(peers) {
    if (!Array.isArray(peers)) return;
    for (const addr of peers) {
      if (addr === this.myAddress) continue;
      if (!this._isValidPeerAddress(addr)) {
        this.log(`收到无效节点地址，已忽略: ${addr}`);
        continue;
      }
      if (!this.knownPeers.has(addr)) {
        this.knownPeers.add(addr);
        this.connectToPeer(addr);
      }
    }
  }

  _onNewBlock(senderWs, blockData) {
    const hash = blockData.hash;
    if (this._seenBlocks.has(hash)) return;
    this._seenBlocks.add(hash);
    // 限制缓存大小
    if (this._seenBlocks.size > 1000) {
      const first = this._seenBlocks.values().next().value;
      this._seenBlocks.delete(first);
    }

    const ok = this.chain.addBlock(blockData);
    if (ok) {
      this.log(`收到新区块 #${blockData.index}，已同步`);
      // 转发给其他节点（排除发送者）
      this._broadcast({ type: MSG.NEW_BLOCK, data: blockData }, senderWs);
    } else if (blockData.index >= this.chain.chain.length) {
      // 区块无法直接追加，可能链分叉或落后，请求完整链
      this._send(senderWs, { type: MSG.GET_CHAIN, data: null });
    }
  }

  _onNewTx(senderWs, txData) {
    const hash = txData.tx_hash || txData.txHash;
    if (this._seenTxs.has(hash)) return;
    this._seenTxs.add(hash);
    if (this._seenTxs.size > 5000) {
      const first = this._seenTxs.values().next().value;
      this._seenTxs.delete(first);
    }

    const ok = this.chain.addTransaction(txData);
    if (ok) {
      // 转发给其他节点
      this._broadcast({ type: MSG.NEW_TX, data: txData }, senderWs);
    }
  }

  _onChain(chainData) {
    if (!Array.isArray(chainData)) return;
    if (chainData.length <= this.chain.chain.length) return;
    const ok = this.chain.replaceChain(chainData);
    if (ok) {
      this.log(`链同步完成，高度: ${this.chain.chain.length}`);
    }
  }
  broadcastBlock(block) {
    const data = block.toDict ? block.toDict() : block;
    if (this._seenBlocks.has(data.hash)) return;
    this._seenBlocks.add(data.hash);
    this._broadcast({ type: MSG.NEW_BLOCK, data });
  }

  broadcastTransaction(tx) {
    const data = tx.toDict ? tx.toDict() : tx;
    const hash = data.tx_hash || data.txHash;
    if (this._seenTxs.has(hash)) return;
    this._seenTxs.add(hash);
    this._broadcast({ type: MSG.NEW_TX, data });
  }

  _broadcast(msg, excludeWs = null) {
    // 哈基米协议编码：消息类型字符 + payload的哈基米编码
    const typeChar = msg.type; // 已经是哈基米字符了
    const payloadJson = msg.data != null ? JSON.stringify(msg.data) : '';
    const payloadEncoded = payloadJson ? encodeBytes(Buffer.from(payloadJson, 'utf8')) : '';
    const packet = typeChar + payloadEncoded;

    for (const ws of this.sockets) {
      if (ws === excludeWs) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(packet);
      }
    }
  }

  _send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
      // 哈基米协议编码：消息类型字符 + payload的哈基米编码
      const typeChar = msg.type; // 已经是哈基米字符了
      const payloadJson = msg.data != null ? JSON.stringify(msg.data) : '';
      const payloadEncoded = payloadJson ? encodeBytes(Buffer.from(payloadJson, 'utf8')) : '';
      const packet = typeChar + payloadEncoded;
      ws.send(packet);
    }
  }

  log(...args) {
    console.log('[P2P]', ...args);
  }

  getPeersInfo() {
    return {
      connectedCount: this.sockets.size,
      knownPeers: [...this.knownPeers],
    };
  }
}

module.exports = { P2PServer, MSG };
