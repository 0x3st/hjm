/**
 * HJM JSON-RPC Server
 *
 * 用 Node 原生 http 实现，零额外依赖。
 * 协议：POST JSON-RPC 2.0 风格（简化版，不做 batch）。
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Blockchain } = require('./blockchain');
const { Wallet } = require('./wallet');
const { getHaQiMetrics } = require('./block');
const { isValidAddress } = require('./crypto');
const { encodeProgram } = require('./vm');
const { P2PServer } = require('./p2p');

const VERSION = '0.3.0';
const PUBLIC_RPC_METHODS = [
  'hjm_info',
  'hjm_getBalance',
  'hjm_getNonce',
  'hjm_getStorage',
  'hjm_getReceipts',
  'hjm_sendRawTransaction',
  'hjm_peers',
];

function createNode(options = {}) {
  const port = options.port || 8546;
  const rpcMode = options.publicRpc ? 'public' : 'local';
  const allowedRpcMethods = options.allowedRpcMethods
    ? new Set(options.allowedRpcMethods)
    : (options.publicRpc ? new Set(PUBLIC_RPC_METHODS) : null);
  const chainOpts = {
    chainId: options.chainId ?? 1,
    miningReward: options.miningReward ?? 1000,
    haQiValue: options.haQiValue ?? 1,
    ...(options.acceptedSignatureSchemes
      ? { acceptedSignatureSchemes: options.acceptedSignatureSchemes }
      : {}),
  };

  const chain = new Blockchain(chainOpts);
  const persistence = createPersistence(options.dataDir, chain);
  persistence.load();
  chain.on('newBlock', () => persistence.save());
  chain.on('blockAccepted', () => persistence.save());
  chain.on('chainReplaced', () => persistence.save());
  // 节点内置钱包缓存：address → Wallet
  const wallets = new Map();

  // ── P2P ──
  const p2pEnabled = options.p2p !== false;
  const p2p = p2pEnabled ? new P2PServer(chain, {
    p2pHost: options.p2pHost || '0.0.0.0',
    p2pPort: options.p2pPort || 6001,
    seeds: options.seeds || [],
    advertisedAddress: options.p2pAdvertise || null,
    rejectPrivateIp: options.rejectPrivateIp || false,
  }) : null;

  // ── RPC 方法 ──

  const methods = {
    // 创建钱包，返回地址和私钥
    hjm_newWallet(_params) {
      const w = new Wallet({ chainId: chain.chainId });
      wallets.set(w.address, w);
      return { address: w.address, privateKey: w.exportPrivateKey() };
    },

    // 导入钱包到节点内存
    hjm_importWallet([encodedPrivateKey]) {
      requireParam(encodedPrivateKey, 'privateKey');
      const w = Wallet.fromPrivateKey(encodedPrivateKey, { chainId: chain.chainId });
      // 同步链上 nonce/sigIndex
      w.nextNonce = chain.getNonce(w.address);
      w.nextSigIndex = chain.getSigIndex(w.address);
      wallets.set(w.address, w);
      return { address: w.address };
    },

    // 查余额
    hjm_getBalance([address]) {
      requireParam(address, 'address');
      return { address, balance: chain.getBalance(address) };
    },

    // 查 nonce
    hjm_getNonce([address]) {
      requireParam(address, 'address');
      return {
        address,
        chainId: chain.chainId,
        nonce: chain.getNonce(address),
        sigIndex: chain.getSigIndex(address),
      };
    },

    // 挖矿
    hjm_mine([minerAddress]) {
      requireParam(minerAddress, 'minerAddress');
      const pendingCount = chain.pendingTransactions.length;
      const ok = chain.minePendingTransactions(minerAddress);
      if (!ok) throw new Error('挖矿失败');
      const block = chain.getLatestBlock();
      return {
        blockIndex: block.index,
        hash: block.hash,
        txCount: pendingCount + 1,
        minerBalance: chain.getBalance(minerAddress),
      };
    },

    // 转账（需要节点内有发送方钱包）
    hjm_transfer([privateKeyOrAddress, to, amount, opts]) {
      requireParam(privateKeyOrAddress, 'from (privateKey or address)');
      requireParam(to, 'to');
      requireParam(amount, 'amount');
      const w = resolveWallet(privateKeyOrAddress);
      syncWalletState(w);
      const fee = (opts && opts.fee) || 500;
      const gasLimit = (opts && opts.gasLimit) || 1000;
      const tx = w.createTransaction(to, Number(amount), {
        chainId: chain.chainId,
        nonce: chain.getNonce(w.address),
        sigIndex: chain.getSigIndex(w.address),
        fee,
        gasLimit,
        data: encodeProgram([{ op: 'LOG', message: 'transfer' }, { op: 'STOP' }]),
      });
      const ok = chain.addTransaction(tx);
      if (!ok) throw new Error('交易被拒绝（余额不足/签名无效/nonce 错误）');
      return { txHash: tx.txHash, sender: w.address, recipient: to, amount: Number(amount) };
    },

    // 提交客户端已签名交易（公网 RPC 推荐使用）
    hjm_sendRawTransaction([rawTx]) {
      requireParam(rawTx, 'rawTransaction');
      const txData = typeof rawTx === 'string' ? JSON.parse(rawTx) : rawTx;
      const tx = require('./transaction').Transaction.fromData(txData);
      const ok = chain.addTransaction(tx);
      if (!ok) throw new Error('已签名交易被拒绝（余额不足/签名无效/nonce 错误）');
      return {
        txHash: tx.txHash,
        sender: tx.sender,
        recipient: tx.recipient,
        amount: tx.amount,
        txType: tx.txType,
      };
    },

    // 链信息
    hjm_info() {
      const latest = chain.getLatestBlock();
      const metrics = chain.getHaQiMetrics();
      return {
        version: VERSION,
        chainId: chain.chainId,
        blockHeight: chain.chain.length,
        latestHash: latest.hash,
        haQiValue: metrics.haQiValue,
        haQiLevel: metrics.haQiLevel,
        haQiPoint: metrics.haQiPoint,
        haQiPressure: metrics.haQiPressure,
        pendingTxCount: chain.pendingTransactions.length,
        miningReward: chain.miningReward,
        rpcMode,
        valid: chain.isChainValid(),
        publicMethods: PUBLIC_RPC_METHODS,
        p2p: p2p ? p2p.getPeersInfo() : null,
      };
    },

    // 部署合约
    hjm_deploy([privateKeyOrAddress, codeOps, opts]) {
      requireParam(privateKeyOrAddress, 'from (privateKey or address)');
      requireParam(codeOps, 'code (op array)');
      const w = resolveWallet(privateKeyOrAddress);
      syncWalletState(w);
      const code = typeof codeOps === 'string' ? codeOps : encodeProgram(codeOps);
      const fee = (opts && opts.fee) || 2000;
      const gasLimit = (opts && opts.gasLimit) || 5000;
      const amount = (opts && opts.amount) || 0;
      const tx = w.createContract(code, {
        chainId: chain.chainId,
        nonce: chain.getNonce(w.address),
        sigIndex: chain.getSigIndex(w.address),
        fee, gasLimit, amount,
      });
      const ok = chain.addTransaction(tx);
      if (!ok) throw new Error('部署交易被拒绝');
      return { txHash: tx.txHash, sender: w.address };
    },

    // 调用合约
    hjm_call([privateKeyOrAddress, contractAddress, amount, opts]) {
      requireParam(privateKeyOrAddress, 'from (privateKey or address)');
      requireParam(contractAddress, 'contractAddress');
      const w = resolveWallet(privateKeyOrAddress);
      syncWalletState(w);
      const fee = (opts && opts.fee) || 1200;
      const gasLimit = (opts && opts.gasLimit) || 4000;
      const data = (opts && opts.data) || '';
      const tx = w.callContract(contractAddress, Number(amount) || 0, {
        chainId: chain.chainId,
        nonce: chain.getNonce(w.address),
        sigIndex: chain.getSigIndex(w.address),
        fee, gasLimit, data,
      });
      const ok = chain.addTransaction(tx);
      if (!ok) throw new Error('调用交易被拒绝');
      return { txHash: tx.txHash, sender: w.address, contractAddress };
    },

    // 查合约存储
    hjm_getStorage([contractAddress, key]) {
      requireParam(contractAddress, 'contractAddress');
      const value = chain.getContractStorage(contractAddress, key || null);
      return { contractAddress, key: key || null, value };
    },

    // 查区块收据
    hjm_getReceipts([blockIndex]) {
      const idx = Number(blockIndex);
      return { blockIndex: idx, receipts: chain.receiptsByBlock[idx] || [] };
    },

    // 列出节点内钱包
    hjm_listWallets() {
      return [...wallets.keys()].map((addr) => ({
        address: addr,
        balance: chain.getBalance(addr),
      }));
    },

    // 查看 P2P 节点信息
    hjm_peers() {
      if (!p2p) return { enabled: false, connectedCount: 0, knownPeers: [] };
      return { enabled: true, ...p2p.getPeersInfo() };
    },
  };

  // ── 辅助 ──

  function resolveWallet(privateKeyOrAddress) {
    // 先按地址查缓存
    if (wallets.has(privateKeyOrAddress)) return wallets.get(privateKeyOrAddress);
    // 否则当作私钥导入
    try {
      const w = Wallet.fromPrivateKey(privateKeyOrAddress, { chainId: chain.chainId });
      wallets.set(w.address, w);
      return w;
    } catch {
      throw new Error(`无法解析钱包: ${privateKeyOrAddress.slice(0, 20)}...`);
    }
  }

  function syncWalletState(w) {
    w.nextNonce = chain.getNonce(w.address);
    w.nextSigIndex = chain.getSigIndex(w.address);
  }

  // ── HTTP Server ──

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
        return;
      }

      const { method, params, id } = parsed;
      if (allowedRpcMethods && !allowedRpcMethods.has(method)) {
        respond(res, id, null, { code: -32601, message: `Method not available in ${rpcMode} RPC mode: ${method}` });
        return;
      }

      const fn = methods[method];
      if (!fn) {
        respond(res, id, null, { code: -32601, message: `Method not found: ${method}` });
        return;
      }

      try {
        const result = fn(params || []);
        respond(res, id, result, null);
      } catch (err) {
        respond(res, id, null, { code: -32000, message: err.message });
      }
    });
  });

  function respond(res, id, result, error) {
    const payload = { jsonrpc: '2.0', id: id ?? null };
    if (error) payload.error = error;
    else payload.result = result;
    res.writeHead(error ? 400 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  function requireParam(value, name) {
    if (value === undefined || value === null || value === '') {
      throw new Error(`缺少参数: ${name}`);
    }
  }

  return { server, chain, wallets, port, methods, p2p, rpcMode, publicRpcMethods: PUBLIC_RPC_METHODS };
}

function createPersistence(dataDir, chain) {
  if (!dataDir) {
    return { load() {}, save() {} };
  }

  const chainFile = path.join(dataDir, 'chain.json');

  return {
    load() {
      if (!fs.existsSync(chainFile)) return;
      try {
        const snapshot = JSON.parse(fs.readFileSync(chainFile, 'utf8'));
        const chainData = Array.isArray(snapshot) ? snapshot : snapshot.chain;
        if (Array.isArray(chainData) && chainData.length > 1) {
          chain.loadChain(chainData);
        }
      } catch (err) {
        console.error(`[Persistence] 读取链快照失败: ${err.message}`);
      }
    },

    save() {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        const payload = {
          version: VERSION,
          savedAt: new Date().toISOString(),
          chain: chain.chain.map((block) => block.toDict()),
        };
        const tmpFile = `${chainFile}.tmp`;
        fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2));
        fs.renameSync(tmpFile, chainFile);
      } catch (err) {
        console.error(`[Persistence] 保存链快照失败: ${err.message}`);
      }
    },
  };
}

module.exports = { createNode };
