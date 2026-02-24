#!/usr/bin/env node
/**
 * HJM 区块链示例
 *
 * 演示如何使用哈基米区块链
 */

const { Wallet, Blockchain } = require('../hjm');

function main() {
  console.log('='.repeat(60));
  console.log('🎉 欢迎使用 HJM - 哈基米区块链');
  console.log('='.repeat(60));
  console.log();

  // 创建区块链
  console.log('📦 创建区块链...');
  const blockchain = new Blockchain(1);
  console.log(`✓ 创世区块已创建: ${blockchain.getLatestBlock().hash.slice(0, 30)}...`);
  console.log();

  // 创建钱包
  console.log('👛 创建钱包...');
  const wallet1 = new Wallet();
  const wallet2 = new Wallet();
  const wallet3 = new Wallet();

  console.log(`钱包1 地址: ${wallet1.address}`);
  console.log(`钱包2 地址: ${wallet2.address}`);
  console.log(`钱包3 地址: ${wallet3.address}`);
  console.log();

  // 挖第一个区块（给钱包1奖励）
  console.log('⛏️  挖矿区块 #1...');
  blockchain.minePendingTransactions(wallet1.address);
  console.log(`✓ 钱包1 余额: ${blockchain.getBalance(wallet1.address)}`);
  console.log();

  // 创建交易
  console.log('💸 创建交易...');
  const tx1 = wallet1.createTransaction(wallet2.address, 30);
  blockchain.addTransaction(tx1);
  console.log(`✓ 交易已创建: ${wallet1.address.slice(0, 15)}... → ${wallet2.address.slice(0, 15)}... (30)`);

  const tx2 = wallet1.createTransaction(wallet3.address, 20);
  blockchain.addTransaction(tx2);
  console.log(`✓ 交易已创建: ${wallet1.address.slice(0, 15)}... → ${wallet3.address.slice(0, 15)}... (20)`);
  console.log();

  // 挖第二个区块
  console.log('⛏️  挖矿区块 #2...');
  blockchain.minePendingTransactions(wallet2.address);
  console.log();

  // 显示余额
  console.log('💰 最终余额:');
  console.log(`  钱包1: ${blockchain.getBalance(wallet1.address)}`);
  console.log(`  钱包2: ${blockchain.getBalance(wallet2.address)}`);
  console.log(`  钱包3: ${blockchain.getBalance(wallet3.address)}`);
  console.log();

  // 验证区块链
  console.log('🔍 验证区块链...');
  const isValid = blockchain.isChainValid();
  console.log(`✓ 区块链有效性: ${isValid ? '有效 ✅' : '无效 ❌'}`);
  console.log();

  // 显示区块链信息
  console.log('📊 区块链信息:');
  console.log(`  区块数量: ${blockchain.chain.length}`);
  console.log(`  挖矿难度: ${blockchain.difficulty}`);
  console.log();

  console.log('🎊 示例完成!');
}

main();
