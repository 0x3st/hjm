# HJM VM 指令集

| 指令 | 说明 |
|------|------|
| `NOOP` | 空操作 |
| `LOG <text>` | 输出日志 |
| `TRANSFER <addr> <amount>` | 内部转账 |
| `SLOAD <key>` | 读取合约存储 |
| `SSTORE <key> <value>` | 写入合约存储 |
| `RETURN <data>` | 返回数据并结束 |
| `REVERT <message>` | 回滚并返回错误信息 |
| `ASSERT_RECIPIENT <addr>` | 断言接收方地址 |
| `ASSERT_SENDER <addr>` | 断言发送方地址 |
| `ASSERT_CHAIN_ID <id>` | 断言链 ID |
| `ASSERT_CALLDATA_EQ <text>` | 断言 callData 完全匹配 |
| `ASSERT_CALLDATA_PREFIX <text>` | 断言 callData 前缀匹配 |
| `ASSERT_CALL_VALUE <amount>` | 断言调用附带金额 |
| `CALLDATA_LOAD <key>` | 加载 callData 字段 |
| `CALLDATA_SLICE <key> <offset> <len>` | 截取 callData 片段 |

## gas 规则

- 每条指令按字节码 trit 成本 + 指令固定成本累加
- 交易要求 `fee >= gasUsed` 且 `gasLimit >= gasUsed`
- `REVERT` 回滚 storage/value 变更，收据 `success=false`
