const fs = require('fs');
const os = require('os');
const path = require('path');
const { createNode } = require('../hjm/rpc');

describe('Node persistence', () => {
  test('loads chain snapshot from dataDir after restart', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hjm-node-'));

    try {
      const first = createNode({ dataDir, haQiValue: 0, miningReward: 1000, p2p: false });
      const wallet = first.methods.hjm_newWallet([]);
      const mined = first.methods.hjm_mine([wallet.address]);

      expect(mined.blockIndex).toBe(1);
      expect(fs.existsSync(path.join(dataDir, 'chain.json'))).toBe(true);

      const second = createNode({ dataDir, haQiValue: 0, miningReward: 1000, p2p: false });
      expect(second.chain.chain.length).toBe(2);
      expect(second.chain.getBalance(wallet.address)).toBe(1000);
      expect(second.chain.isChainValid()).toBe(true);
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
