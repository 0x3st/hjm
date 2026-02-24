/**
 * HJM JSON-RPC Server
 *
 * 用 Node 原生 http 实现，零额外依赖。
 * 协议：POST JSON-RPC 2.0 风格（简化版，不做 batch）。
 */

const http = require('http');
const { Blockchain } = require('./blockchain');
const { Wallet } = require('./wallet');
const { getHaQiMetrics } = require('./block');
const { isValidAddress } = require('./crypto');
const { encodeProgram } = require('./vm');

const VERSION = '0.3.0';

function createNode(options = {}) {
  const port = options.port || 8546;
  const chainOpts = {
    chainId: options.chainId ?? 1,
    miningReward: options.miningReward ?? 1000,
    haQiValue: options.haQiValue ?? 1,
    ...(options.acceptedSignatureSchemes
      ? { acceptedSignatureSchemes: options.acceptedSignatureSchemes }
      : {}),
  };

  const chain = new Blockchain(chainOpts);
  // 节点内置钱包缓存：address → Wallet
  const wallets = new Map();

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
      return { address, nonce: chain.getNonce(address), sigIndex: chain.getSigIndex(address) };
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
        valid: chain.isChainValid(),
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

  return { server, chain, wallets, port, methods };
}

module.exports = { createNode };
