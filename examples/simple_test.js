#!/usr/bin/env node
/**
 * 简单测试
 */

const { Wallet, encodeHex } = require('../hjm');

console.log('='.repeat(50));
console.log('🎉 HJM - 哈基米区块链测试');
console.log('='.repeat(50));
console.log();

// 测试编码
console.log('1️⃣ 测试编码系统');
const hexVal = '0x1234abcd';
const hajimi = encodeHex(hexVal);
console.log(`  十六进制: ${hexVal}`);
console.log(`  哈基米: ${hajimi}`);
console.log();

// 测试钱包
console.log('2️⃣ 测试钱包系统');
const wallet1 = new Wallet();
const wallet2 = new Wallet();
console.log(`  钱包1: ${wallet1.address}`);
console.log(`  钱包2: ${wallet2.address}`);
console.log();

// 测试交易
console.log('3️⃣ 测试交易系统');
const tx = wallet1.createTransaction(wallet2.address, 100);
console.log(`  发送者: ${tx.sender.slice(0, 20)}...`);
console.log(`  接收者: ${tx.recipient.slice(0, 20)}...`);
console.log(`  金额: ${tx.amount}`);
console.log(`  交易哈希: ${tx.txHash.slice(0, 30)}...`);
console.log(`  签名: ${tx.signature.slice(0, 30)}...`);
console.log();

console.log('✅ 所有测试通过!');
