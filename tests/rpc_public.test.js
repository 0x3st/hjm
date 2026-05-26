const { Readable, Writable } = require('stream');
const { createNode } = require('../hjm/rpc');

function rpcPost(server, method, params = []) {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
  const req = Readable.from([payload]);
  req.method = 'POST';

  return new Promise((resolve, reject) => {
    let body = '';
    const res = new Writable({
      write(chunk, _encoding, callback) {
        body += chunk.toString();
        callback();
      },
    });
    res.writeHead = (statusCode) => {
      res.statusCode = statusCode;
      return res;
    };
    res.end = (chunk) => {
      if (chunk) body += chunk.toString();
      try {
        resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
      } catch (err) {
        reject(err);
      }
    };

    server.emit('request', req, res);
  });
}

describe('Public RPC mode', () => {
  test('allows public methods and blocks private-key node methods over HTTP', async () => {
    const { server } = createNode({ publicRpc: true, p2p: false });

    const info = await rpcPost(server, 'hjm_info');
    expect(info.statusCode).toBe(200);
    expect(info.body.result.rpcMode).toBe('public');

    const blocked = await rpcPost(server, 'hjm_transfer', ['private-key', 'to', 1]);
    expect(blocked.statusCode).toBe(400);
    expect(blocked.body.error.code).toBe(-32601);
    expect(blocked.body.error.message).toContain('public RPC mode');
  });

  test('keeps local teaching RPC methods available by default', async () => {
    const { server } = createNode({ p2p: false });

    const missingParams = await rpcPost(server, 'hjm_transfer', []);
    expect(missingParams.statusCode).toBe(400);
    expect(missingParams.body.error.message).toContain('缺少参数');
  });
});
