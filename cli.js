#!/usr/bin/env node
/**
 * HJM CLI - 哈基米区块链命令行工具
 *
 * 离线命令（new / import / encode / decode）不需要节点。
 * 链交互命令（balance / mine / transfer / info / deploy / call / storage / demo）
 * 需要先 `hjm node` 启动节点，然后通过 JSON-RPC 通信。
 */

const { program } = require('commander');
const http = require('http');
const {
  Wallet,
  encodeHex,
  decodeToHex,
  createNode,
  VERSION,
} = require('./hjm');

const DEFAULT_RPC = 'http://127.0.0.1:8546';

program.name('hjm').description('HJM - 哈基米区块链命令行工具').version(VERSION);

// ── 辅助：RPC 客户端 ──

function rpcCall(method, params = [], rpcUrl) {
  const url = new URL(rpcUrl || DEFAULT_RPC);
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.error) reject(new Error(json.error.message));
            else resolve(json.result);
          } catch { reject(new Error('无法解析节点响应')); }
        });
      },
    );
    req.on('error', () => reject(new Error(`无法连接节点 ${rpcUrl || DEFAULT_RPC}，请先运行 hjm node`)));
    req.write(payload);
    req.end();
  });
}

// ── 离线命令 ──

program
  .command('new')
  .description('创建新钱包（离线）')
  .option('--show-private-key', '显示私钥')
  .action((opts) => {
    const wallet = new Wallet();
    console.log('✓ 新钱包已创建');
    console.log(`地址: ${wallet.address}`);
    if (opts.showPrivateKey) {
      console.log(`私钥: ${wallet.exportPrivateKey()}`);
    } else {
      console.log('私钥已隐藏，使用 --show-private-key 显示');
    }
    console.log('\n⚠️  请妥善保管私钥！');
  });

program
  .command('import <private_key>')
  .description('导入钱包（离线）')
  .action((privateKey) => {
    try {
      const wallet = Wallet.fromPrivateKey(privateKey);
      console.log('✓ 钱包已导入');
      console.log(`地址: ${wallet.address}`);
    } catch (err) {
      console.error(`❌ 导入失败: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('encode <hex>')
  .description('hex → 哈基米（离线）')
  .action((hex) => {
    try {
      console.log(encodeHex(hex));
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('decode <hajimi>')
  .description('哈基米 → hex（离线）')
  .action((hajimi) => {
    try {
      console.log(decodeToHex(hajimi));
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  });

// ── 节点命令 ──

program
  .command('node')
  .description('启动 HJM 节点（HTTP JSON-RPC）')
  .option('-p, --port <port>', '端口', '8546')
  .option('--haqi <value>', '哈气值', '1')
  .option('--reward <amount>', '挖矿奖励', '1000')
  .option('--chain-id <id>', '链 ID', '1')
  .action((opts) => {
    const { server, port } = createNode({
      port: Number(opts.port),
      haQiValue: Number(opts.haqi),
      miningReward: Number(opts.reward),
      chainId: Number(opts.chainId),
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`⛓  HJM 节点已启动`);
      console.log(`   RPC: http://127.0.0.1:${port}`);
      console.log(`   链ID: ${opts.chainId}  哈气值: ${opts.haqi}  奖励: ${opts.reward}`);
      console.log(`   Ctrl+C 停止\n`);
    });
  });

// ── RPC 客户端命令 ──

function withRpc(fn) {
  return async (...args) => {
    const opts = args[args.length - 1];
    const rpcUrl = opts.rpc || DEFAULT_RPC;
    try {
      await fn(...args, rpcUrl);
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exit(1);
    }
  };
}

program
  .command('info')
  .description('查看链信息')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (_opts, rpcUrl) => {
    const r = await rpcCall('hjm_info', [], rpcUrl);
    console.log(`HJM v${r.version}  链ID: ${r.chainId}`);
    console.log(`区块高度: ${r.blockHeight}  待处理交易: ${r.pendingTxCount}`);
    console.log(`哈气值: H=${r.haQiValue} (${r.haQiLevel}阶${r.haQiPoint}点)  压强: ${r.haQiPressure}`);
    console.log(`挖矿奖励: ${r.miningReward}  链有效: ${r.valid}`);
    console.log(`最新哈希: ${r.latestHash.slice(0, 30)}...`);
  }));

program
  .command('balance <address>')
  .description('查询余额')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (address, _opts, rpcUrl) => {
    const r = await rpcCall('hjm_getBalance', [address], rpcUrl);
    console.log(`地址: ${r.address}`);
    console.log(`余额: ${r.balance}`);
  }));

program
  .command('mine <address>')
  .description('挖矿（将待处理交易打包）')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (address, _opts, rpcUrl) => {
    console.log('⛏  挖矿中...');
    const r = await rpcCall('hjm_mine', [address], rpcUrl);
    console.log(`✓ 区块 #${r.blockIndex} 已挖出`);
    console.log(`  哈希: ${r.hash.slice(0, 30)}...`);
    console.log(`  交易数: ${r.txCount}  矿工余额: ${r.minerBalance}`);
  }));

program
  .command('transfer <private_key> <to> <amount>')
  .description('转账（交易进入待处理池，需挖矿确认）')
  .option('--fee <fee>', '手续费', '500')
  .option('--gas-limit <limit>', '燃料上限', '1000')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (privateKey, to, amount, opts, rpcUrl) => {
    const r = await rpcCall('hjm_transfer', [privateKey, to, Number(amount), {
      fee: Number(opts.fee), gasLimit: Number(opts.gasLimit),
    }], rpcUrl);
    console.log(`✓ 交易已提交`);
    console.log(`  ${r.sender.slice(0, 20)}... → ${r.recipient.slice(0, 20)}...`);
    console.log(`  金额: ${r.amount}  哈希: ${r.txHash.slice(0, 30)}...`);
    console.log('  提示: 运行 hjm mine <地址> 打包确认');
  }));

program
  .command('deploy <private_key> <code_json>')
  .description('部署合约（code_json 为指令数组 JSON）')
  .option('--fee <fee>', '手续费', '2000')
  .option('--gas-limit <limit>', '燃料上限', '5000')
  .option('--amount <amount>', '附带金额', '0')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (privateKey, codeJson, opts, rpcUrl) => {
    let codeOps;
    try { codeOps = JSON.parse(codeJson); } catch { throw new Error('code_json 格式错误，需要 JSON 数组'); }
    const r = await rpcCall('hjm_deploy', [privateKey, codeOps, {
      fee: Number(opts.fee), gasLimit: Number(opts.gasLimit), amount: Number(opts.amount),
    }], rpcUrl);
    console.log(`✓ 部署交易已提交`);
    console.log(`  发送方: ${r.sender.slice(0, 20)}...`);
    console.log(`  哈希: ${r.txHash.slice(0, 30)}...`);
    console.log('  提示: 挖矿后查看收据获取合约地址');
  }));

program
  .command('call <private_key> <contract_address> [amount]')
  .description('调用合约')
  .option('--data <data>', '调用数据', '')
  .option('--fee <fee>', '手续费', '1200')
  .option('--gas-limit <limit>', '燃料上限', '4000')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (privateKey, contractAddress, amount, opts, rpcUrl) => {
    const r = await rpcCall('hjm_call', [privateKey, contractAddress, Number(amount) || 0, {
      fee: Number(opts.fee), gasLimit: Number(opts.gasLimit), data: opts.data,
    }], rpcUrl);
    console.log(`✓ 调用交易已提交`);
    console.log(`  合约: ${r.contractAddress.slice(0, 20)}...`);
    console.log(`  哈希: ${r.txHash.slice(0, 30)}...`);
    console.log('  提示: 挖矿后查看收据获取执行结果');
  }));

program
  .command('storage <contract_address> [key]')
  .description('查询合约存储')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (contractAddress, key, _opts, rpcUrl) => {
    const r = await rpcCall('hjm_getStorage', [contractAddress, key || null], rpcUrl);
    if (r.key) {
      console.log(`${r.key}: ${JSON.stringify(r.value)}`);
    } else {
      console.log(JSON.stringify(r.value, null, 2));
    }
  }));

program
  .command('receipts <block_index>')
  .description('查询区块收据')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (blockIndex, _opts, rpcUrl) => {
    const r = await rpcCall('hjm_getReceipts', [blockIndex], rpcUrl);
    if (!r.receipts.length) {
      console.log(`区块 #${r.blockIndex} 无收据`);
    } else {
      r.receipts.forEach((receipt, i) => {
        console.log(`[${i}] ${receipt.txType || 'TX'}  success=${receipt.success}  gas=${receipt.gasUsed || 0}`);
        if (receipt.contractAddress) console.log(`    合约地址: ${receipt.contractAddress}`);
        if (receipt.returnData) console.log(`    返回: ${receipt.returnData}`);
      });
    }
  }));

program
  .command('wallets')
  .description('列出节点内钱包')
  .option('--rpc <url>', 'RPC 地址', DEFAULT_RPC)
  .action(withRpc(async (_opts, rpcUrl) => {
    const r = await rpcCall('hjm_listWallets', [], rpcUrl);
    if (!r.length) { console.log('节点内无钱包'); return; }
    r.forEach((w) => console.log(`${w.address.slice(0, 24)}...  余额: ${w.balance}`));
  }));

program
  .command('demo')
  .description('一键演示完整流程（自动启动临时节点）')
  .action(async () => {
    console.log('=== HJM 哈基米区块链演示 ===\n');
    const { createNode: cn } = require('./hjm');
    const { chain, wallets, methods } = cn({ haQiValue: 1, miningReward: 1000 });

    console.log('1. 创建钱包');
    const alice = methods.hjm_newWallet([]);
    const bob = methods.hjm_newWallet([]);
    console.log(`   Alice: ${alice.address.slice(0, 24)}...`);
    console.log(`   Bob:   ${bob.address.slice(0, 24)}...`);

    console.log('\n2. 挖矿给 Alice');
    const b1 = methods.hjm_mine([alice.address]);
    console.log(`   区块 #${b1.blockIndex}  Alice 余额: ${b1.minerBalance}`);

    console.log('\n3. Alice → Bob 转账 100');
    const tx = methods.hjm_transfer([alice.address, bob.address, 100, { fee: 200, gasLimit: 500 }]);
    console.log(`   交易哈希: ${tx.txHash.slice(0, 30)}...`);

    console.log('\n4. 挖矿确认');
    const b2 = methods.hjm_mine([bob.address]);
    console.log(`   区块 #${b2.blockIndex}`);

    const aliceBal = methods.hjm_getBalance([alice.address]);
    const bobBal = methods.hjm_getBalance([bob.address]);
    console.log(`   Alice 余额: ${aliceBal.balance}`);
    console.log(`   Bob 余额:   ${bobBal.balance}`);

    console.log('\n5. 部署合约');
    methods.hjm_mine([alice.address]); // 给 Alice 补充余额
    const deployResult = methods.hjm_deploy([alice.address, [
      { op: 'SSTORE', key: 'greeting', value: 'hakimi' },
      { op: 'RETURN', data: 'deployed' },
    ], { fee: 200, gasLimit: 500 }]);
    console.log(`   部署哈希: ${deployResult.txHash.slice(0, 30)}...`);

    const b3 = methods.hjm_mine([alice.address]);
    console.log(`   区块 #${b3.blockIndex} 已挖出`);

    const receipts = methods.hjm_getReceipts([b3.blockIndex]);
    const createReceipt = receipts.receipts.find((r) => r.contractAddress);
    if (createReceipt) {
      console.log(`   合约地址: ${createReceipt.contractAddress.slice(0, 24)}...`);

      console.log('\n6. 调用合约');
      methods.hjm_call([alice.address, createReceipt.contractAddress, 0, { fee: 500, gasLimit: 1000 }]);
      const b4 = methods.hjm_mine([alice.address]);
      const callReceipts = methods.hjm_getReceipts([b4.blockIndex]);
      const callR = callReceipts.receipts.find((r) => r.txType === '哈调约' || r.txType === 'CALL');
      if (callR) console.log(`   执行结果: success=${callR.success}  返回=${callR.returnData || ''}`);

      console.log('\n7. 查询合约存储');
      const sv = methods.hjm_getStorage([createReceipt.contractAddress, 'greeting']);
      console.log(`   greeting = ${JSON.stringify(sv.value)}`);
    }

    console.log('\n8. 验证链完整性');
    const info = methods.hjm_info();
    console.log(`   区块高度: ${info.blockHeight}  链有效: ${info.valid}`);
    console.log('\n=== 演示完成 ===');
  });

program.parse();
