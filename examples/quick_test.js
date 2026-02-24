#!/usr/bin/env node
/**
 * 快速区块链测试（无挖矿）
 */

const { Wallet, Transaction } = require('../hjm');
const { Block } = require('../hjm/block');

console.log('='.repeat(60));
console.log('🎉 HJM 区块链快速测试');
console.log('='.repeat(60));
console.log();

// 创建钱包
console.log('👛 创建钱包...');
const wallet1 = new Wallet();
const wallet2 = new Wallet();
console.log(`✓ 钱包1: ${wallet1.address.slice(0, 30)}...`);
console.log(`✓ 钱包2: ${wallet2.address.slice(0, 30)}...`);
console.log();

// 创建交易
console.log('💸 创建交易...');
const tx1 = wallet1.createTransaction(wallet2.address, 50);
const tx2 = wallet2.createTransaction(wallet1.address, 25);
console.log(`✓ 交易1: ${tx1.txHash.slice(0, 30)}...`);
console.log(`✓ 交易2: ${tx2.txHash.slice(0, 30)}...`);
console.log();

// 创建区块（不挖矿）
console.log('📦 创建区块...');
const block = new Block({
  index: 1,
  timestamp: Math.floor(Date.now() / 1000),
  transactions: [tx1, tx2],
  previousHash: '哈基米莫南北绿豆',
  difficulty: 1,
  chainId: 1,
  minerAddress: wallet1.address,
  stateRoot: 'quick-test-state',
  receiptsRoot: 'quick-test-receipts',
});
block.hash = block.calculateHash();
console.log(`✓ 区块哈希: ${block.hash.slice(0, 40)}...`);
console.log(`✓ 区块包含 ${block.transactions.length} 笔交易`);
console.log();

// 显示区块信息
console.log('📊 区块详情:');
console.log(`  索引: ${block.index}`);
console.log(`  时间戳: ${block.timestamp}`);
console.log(`  前一区块: ${block.previousHash}`);
console.log(`  Nonce: ${block.nonce}`);
console.log();

console.log('✅ 测试完成!');
console.log();
console.log('💡 提示: 这是一个简化测试，没有进行工作量证明挖矿');
