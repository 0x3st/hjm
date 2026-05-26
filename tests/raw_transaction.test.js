const { createNode } = require('../hjm/rpc');
const {
  Wallet,
  encodeProgram,
  getSignatureScheme,
  setSignatureScheme,
  Secp256k1SignatureScheme,
} = require('../hjm');

describe('Raw transaction RPC', () => {
  const NODE_OPTS = {
    haQiValue: 0,
    miningReward: 1000,
    p2p: false,
    acceptedSignatureSchemes: ['secp256k1'],
  };
  let previousScheme;

  beforeEach(() => {
    previousScheme = getSignatureScheme();
    setSignatureScheme(new Secp256k1SignatureScheme());
  });

  afterEach(() => {
    setSignatureScheme(previousScheme);
  });

  test('accepts a locally signed transfer without sending private key to node', () => {
    const { chain, methods } = createNode(NODE_OPTS);
    const alice = new Wallet({ chainId: 1 });
    const bob = new Wallet({ chainId: 1 });

    methods.hjm_mine([alice.address]);
    expect(chain.getBalance(alice.address)).toBe(1000);

    const nonce = methods.hjm_getNonce([alice.address]);
    const tx = alice.createTransaction(bob.address, 100, {
      chainId: nonce.chainId,
      nonce: nonce.nonce,
      sigIndex: nonce.sigIndex,
      fee: 500,
      gasLimit: 1000,
      data: encodeProgram([{ op: 'LOG', message: 'transfer' }, { op: 'STOP' }]),
    });

    const submitted = methods.hjm_sendRawTransaction([tx.toDict()]);
    expect(submitted.txHash).toBe(tx.txHash);
    expect(chain.pendingTransactions).toHaveLength(1);

    methods.hjm_mine([bob.address]);
    expect(chain.getBalance(alice.address)).toBe(400);
    expect(chain.getBalance(bob.address)).toBe(1600);
  });

  test('rejects tampered signed transactions', () => {
    const { methods } = createNode(NODE_OPTS);
    const alice = new Wallet({ chainId: 1 });
    const bob = new Wallet({ chainId: 1 });

    methods.hjm_mine([alice.address]);
    const nonce = methods.hjm_getNonce([alice.address]);
    const tx = alice.createTransaction(bob.address, 100, {
      chainId: nonce.chainId,
      nonce: nonce.nonce,
      sigIndex: nonce.sigIndex,
      fee: 500,
      gasLimit: 1000,
    }).toDict();
    tx.amount = 101;

    expect(() => methods.hjm_sendRawTransaction([tx])).toThrow('已签名交易被拒绝');
  });
});
