/**
 * P2P 网络层测试
 */

const { Blockchain } = require('../hjm/blockchain');
const { Wallet } = require('../hjm/wallet');
const { P2PServer } = require('../hjm/p2p');

const CHAIN_OPTS = { chainId: 1, miningReward: 1000, haQiValue: 1 };
const TIMEOUT = 60000;

function createTestChain() {
  return new Blockchain(CHAIN_OPTS);
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

describe('P2P', () => {
  let p2pA, p2pB, chainA, chainB;

  afterEach(() => {
    if (p2pA) { p2pA.stop(); p2pA = null; }
    if (p2pB) { p2pB.stop(); p2pB = null; }
  });

  test('two nodes connect and handshake', async () => {
    chainA = createTestChain();
    chainB = createTestChain();

    p2pA = new P2PServer(chainA, { p2pPort: 9001 });
    p2pB = new P2PServer(chainB, { p2pPort: 9002, seeds: ['ws://127.0.0.1:9001'] });

    await new Promise(r => p2pA.start(r));
    await new Promise(r => p2pB.start(r));
    await wait(500);

    expect(p2pA.sockets.size).toBeGreaterThanOrEqual(1);
    expect(p2pB.sockets.size).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);

  test('new node syncs longer chain on join', async () => {
    chainA = createTestChain();

    p2pA = new P2PServer(chainA, { p2pPort: 9003 });
    await new Promise(r => p2pA.start(r));

    // A 先挖 2 个块
    const wallet = new Wallet({ chainId: 1 });
    chainA.minePendingTransactions(wallet.address);
    chainA.minePendingTransactions(wallet.address);
    expect(chainA.chain.length).toBe(3);

    // B 加入（只有创世块），A 更长，B 应该同步
    chainB = createTestChain();
    p2pB = new P2PServer(chainB, { p2pPort: 9004, seeds: ['ws://127.0.0.1:9003'] });
    await new Promise(r => p2pB.start(r));

    await wait(1500);

    expect(chainB.chain.length).toBe(3);
    expect(chainB.getLatestBlock().hash).toBe(chainA.getLatestBlock().hash);
  }, TIMEOUT);

  test('block mined on synced node propagates', async () => {
    chainA = createTestChain();

    // A 先挖一个块
    const wallet = new Wallet({ chainId: 1 });
    chainA.minePendingTransactions(wallet.address);

    p2pA = new P2PServer(chainA, { p2pPort: 9005 });
    await new Promise(r => p2pA.start(r));

    // B 连接 A，先同步
    chainB = createTestChain();
    p2pB = new P2PServer(chainB, { p2pPort: 9006, seeds: ['ws://127.0.0.1:9005'] });
    await new Promise(r => p2pB.start(r));
    await wait(1500);

    expect(chainB.chain.length).toBe(2);

    // A 再挖一个块，B 应该通过 addBlock 追加
    chainA.minePendingTransactions(wallet.address);
    await wait(1000);

    expect(chainB.chain.length).toBe(3);
    expect(chainB.getLatestBlock().hash).toBe(chainA.getLatestBlock().hash);
  }, TIMEOUT);

  test('longest chain wins when connecting', async () => {
    chainA = createTestChain();
    chainB = createTestChain();

    // A 挖 3 个块
    const walletA = new Wallet({ chainId: 1 });
    chainA.minePendingTransactions(walletA.address);
    chainA.minePendingTransactions(walletA.address);
    chainA.minePendingTransactions(walletA.address);
    expect(chainA.chain.length).toBe(4);

    // B 只挖 1 个块
    const walletB = new Wallet({ chainId: 1 });
    chainB.minePendingTransactions(walletB.address);
    expect(chainB.chain.length).toBe(2);

    // 连接后 B 应该切换到 A 的更长链
    p2pA = new P2PServer(chainA, { p2pPort: 9007 });
    p2pB = new P2PServer(chainB, { p2pPort: 9008, seeds: ['ws://127.0.0.1:9007'] });

    await new Promise(r => p2pA.start(r));
    await new Promise(r => p2pB.start(r));

    await wait(1500);

    expect(chainB.chain.length).toBe(4);
    expect(chainB.getLatestBlock().hash).toBe(chainA.getLatestBlock().hash);
  }, TIMEOUT);
});

describe('P2P Address Validation', () => {
  let p2p, chain;

  beforeEach(() => {
    chain = createTestChain();
    p2p = new P2PServer(chain, { p2pPort: 9100 });
  });

  afterEach(() => {
    if (p2p) { p2p.stop(); p2p = null; }
  });

  test('accepts ws:// and wss:// addresses', () => {
    expect(p2p._isValidPeerAddress('ws://example.com:6001')).toBe(true);
    expect(p2p._isValidPeerAddress('wss://example.com:6001')).toBe(true);
  });

  test('rejects http:// and invalid URLs', () => {
    expect(p2p._isValidPeerAddress('http://example.com:6001')).toBe(false);
    expect(p2p._isValidPeerAddress('https://example.com:6001')).toBe(false);
    expect(p2p._isValidPeerAddress('ftp://example.com:6001')).toBe(false);
    expect(p2p._isValidPeerAddress('not-a-url')).toBe(false);
    expect(p2p._isValidPeerAddress('')).toBe(false);
  });

  test('rejectPrivateIp option blocks private IPs', () => {
    const p2pStrict = new P2PServer(chain, { p2pPort: 9101, rejectPrivateIp: true });

    expect(p2pStrict._isValidPeerAddress('ws://10.0.0.1:6001')).toBe(false);
    expect(p2pStrict._isValidPeerAddress('ws://172.16.0.1:6001')).toBe(false);
    expect(p2pStrict._isValidPeerAddress('ws://192.168.1.1:6001')).toBe(false);
    expect(p2pStrict._isValidPeerAddress('ws://127.0.0.1:6001')).toBe(false);
    expect(p2pStrict._isValidPeerAddress('ws://8.8.8.8:6001')).toBe(true);

    p2pStrict.stop();
  });

  test('default allows private IPs', () => {
    expect(p2p._isValidPeerAddress('ws://192.168.1.1:6001')).toBe(true);
    expect(p2p._isValidPeerAddress('ws://10.0.0.1:6001')).toBe(true);
  });

  test('_isPrivateIp detects RFC1918 addresses', () => {
    expect(p2p._isPrivateIp('10.0.0.1')).toBe(true);
    expect(p2p._isPrivateIp('10.255.255.255')).toBe(true);
    expect(p2p._isPrivateIp('172.16.0.1')).toBe(true);
    expect(p2p._isPrivateIp('172.31.255.255')).toBe(true);
    expect(p2p._isPrivateIp('192.168.0.1')).toBe(true);
    expect(p2p._isPrivateIp('192.168.255.255')).toBe(true);
    expect(p2p._isPrivateIp('127.0.0.1')).toBe(true);

    expect(p2p._isPrivateIp('8.8.8.8')).toBe(false);
    expect(p2p._isPrivateIp('172.32.0.1')).toBe(false);
    expect(p2p._isPrivateIp('192.169.0.1')).toBe(false);
  });
});

describe('P2P Rate Limiting', () => {
  let p2p, chain;

  beforeEach(() => {
    chain = createTestChain();
    p2p = new P2PServer(chain, { p2pPort: 9200 });
  });

  afterEach(() => {
    if (p2p) { p2p.stop(); p2p = null; }
  });

  test('first 5 requests are allowed', () => {
    const peerKey = 'ws://test-peer:6001';

    for (let i = 0; i < 5; i++) {
      expect(p2p._checkRateLimit(peerKey, 5, 60000)).toBe(true);
    }
  });

  test('6th request is blocked', () => {
    const peerKey = 'ws://test-peer:6001';

    for (let i = 0; i < 5; i++) {
      p2p._checkRateLimit(peerKey, 5, 60000);
    }

    expect(p2p._checkRateLimit(peerKey, 5, 60000)).toBe(false);
  });

  test('rate limit resets after window expires', () => {
    const peerKey = 'ws://test-peer:6001';
    const shortWindow = 100; // 100ms

    for (let i = 0; i < 5; i++) {
      p2p._checkRateLimit(peerKey, 5, shortWindow);
    }

    expect(p2p._checkRateLimit(peerKey, 5, shortWindow)).toBe(false);

    // 等待窗口过期
    return new Promise(resolve => {
      setTimeout(() => {
        expect(p2p._checkRateLimit(peerKey, 5, shortWindow)).toBe(true);
        resolve();
      }, 150);
    });
  });

  test('cleanup removes inactive peers', () => {
    const peerKey = 'ws://inactive-peer:6001';
    p2p._checkRateLimit(peerKey, 5, 60000);

    expect(p2p._peerRateLimits.has(peerKey)).toBe(true);

    // 模拟 5 分钟前的活动
    p2p._peerRateLimits.get(peerKey).lastActivity = Date.now() - 6 * 60 * 1000;

    p2p._cleanupRateLimits();

    expect(p2p._peerRateLimits.has(peerKey)).toBe(false);
  });
});