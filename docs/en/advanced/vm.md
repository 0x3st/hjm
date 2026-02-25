# HJM VM Instructions

| Instruction | Description |
|-------------|-------------|
| `NOOP` | No operation |
| `LOG <text>` | Output log |
| `TRANSFER <addr> <amount>` | Internal transfer |
| `SLOAD <key>` | Read contract storage |
| `SSTORE <key> <value>` | Write contract storage |
| `RETURN <data>` | Return data and halt |
| `REVERT <message>` | Rollback and return error |
| `ASSERT_RECIPIENT <addr>` | Assert recipient address |
| `ASSERT_SENDER <addr>` | Assert sender address |
| `ASSERT_CHAIN_ID <id>` | Assert chain ID |
| `ASSERT_CALLDATA_EQ <text>` | Assert callData exact match |
| `ASSERT_CALLDATA_PREFIX <text>` | Assert callData prefix match |
| `ASSERT_CALL_VALUE <amount>` | Assert attached call value |
| `CALLDATA_LOAD <key>` | Load callData field |
| `CALLDATA_SLICE <key> <offset> <len>` | Slice callData segment |

## Gas Rules

- Each instruction costs bytecode trit cost + fixed instruction cost
- Transaction requires `fee >= gasUsed` and `gasLimit >= gasUsed`
- `REVERT` rolls back storage/value changes, receipt has `success=false`
