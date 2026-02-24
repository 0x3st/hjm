/**
 * HJM VM (Bytecode)
 *
 * 链上只执行字节码，交易 data 字段使用哈基米编码字节码。
 */

const { encodeBytes, decodeString, bytesToTrits } = require('./encoding');
const { encodeUint32, encodeUint64 } = require('./codec');

const OPCODES = Object.freeze({
  STOP: 0x00,
  NOOP: 0x01,
  LOG: 0x02,
  TRANSFER: 0x03,
  ASSERT_RECIPIENT: 0x04,
  ASSERT_SENDER: 0x05,
  ASSERT_CHAIN_ID: 0x06,
  SLOAD: 0x07,
  SSTORE: 0x08,
  RETURN: 0x09,
  REVERT: 0x0a,
  RETURN_LONG: 0x0b,
  REVERT_LONG: 0x0c,
  ASSERT_CALLDATA_EQ: 0x0d,
  ASSERT_CALLDATA_PREFIX: 0x0e,
  ASSERT_CALL_VALUE: 0x0f,
  CALLDATA_LOAD: 0x10,
  CALLDATA_SLICE: 0x11,
});

const OPCODE_NAME_BY_VALUE = Object.freeze(
  Object.fromEntries(Object.entries(OPCODES).map(([name, value]) => [value, name]))
);

const OPCODE_BASE_GAS = Object.freeze({
  [OPCODES.STOP]: 1,
  [OPCODES.NOOP]: 1,
  [OPCODES.LOG]: 6,
  [OPCODES.TRANSFER]: 12,
  [OPCODES.ASSERT_RECIPIENT]: 5,
  [OPCODES.ASSERT_SENDER]: 5,
  [OPCODES.ASSERT_CHAIN_ID]: 5,
  [OPCODES.SLOAD]: 18,
  [OPCODES.SSTORE]: 64,
  [OPCODES.RETURN]: 2,
  [OPCODES.REVERT]: 2,
  [OPCODES.RETURN_LONG]: 2,
  [OPCODES.REVERT_LONG]: 2,
  [OPCODES.ASSERT_CALLDATA_EQ]: 7,
  [OPCODES.ASSERT_CALLDATA_PREFIX]: 7,
  [OPCODES.ASSERT_CALL_VALUE]: 6,
  [OPCODES.CALLDATA_LOAD]: 12,
  [OPCODES.CALLDATA_SLICE]: 18,
});

const MAX_U64_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

class VMRevertError extends Error {
  constructor(message = '哈回滚', gasUsed = 0, returnData = null) {
    super(message);
    this.name = 'VMRevertError';
    this.vmRevert = true;
    this.vmGasUsed = gasUsed;
    this.returnData = returnData;
  }
}

function toProgramBytes(program) {
  if (!program) return Buffer.alloc(0);
  if (Buffer.isBuffer(program)) return program;
  if (program instanceof Uint8Array) return Buffer.from(program);
  if (typeof program === 'string') {
    return decodeString(program);
  }
    throw new Error('程序必须是字节数组或哈基米编码字符串');
}

function tritCost(bytes) {
  if (!bytes || bytes.length === 0) return 0;
  return bytesToTrits(bytes).length;
}

function readU8(bytes, pc, fieldName) {
  if (pc >= bytes.length) {
    throw new Error(`Unexpected EOF while reading ${fieldName}`);
  }
  return [bytes[pc], pc + 1];
}

function readBytes(bytes, pc, length, fieldName) {
  if (pc + length > bytes.length) {
    throw new Error(`Unexpected EOF while reading ${fieldName}`);
  }
  return [bytes.slice(pc, pc + length), pc + length];
}

function readU32(bytes, pc, fieldName) {
  const [raw, nextPc] = readBytes(bytes, pc, 4, fieldName);
  const value = raw.readUInt32BE(0);
  return [value, nextPc];
}

function readU16(bytes, pc, fieldName) {
  const [raw, nextPc] = readBytes(bytes, pc, 2, fieldName);
  const value = raw.readUInt16BE(0);
  return [value, nextPc];
}

function readU64(bytes, pc, fieldName) {
  const [raw, nextPc] = readBytes(bytes, pc, 8, fieldName);

  let value = 0n;
  for (const byte of raw) {
    value = (value << 8n) | BigInt(byte);
  }

  if (value > MAX_U64_SAFE) {
    throw new Error(`${fieldName} exceeds Number.MAX_SAFE_INTEGER`);
  }

  return [Number(value), nextPc];
}

function readUtf8StringWithU8Len(bytes, pc, fieldName) {
  const [len, nextPc] = readU8(bytes, pc, `${fieldName}.length`);
  const [raw, finalPc] = readBytes(bytes, nextPc, len, `${fieldName}.bytes`);
  return [raw.toString('utf-8'), finalPc, raw];
}

function readUtf8StringWithU16Len(bytes, pc, fieldName) {
  const [len, nextPc] = readU16(bytes, pc, `${fieldName}.length`);
  const [raw, finalPc] = readBytes(bytes, nextPc, len, `${fieldName}.bytes`);
  return [raw.toString('utf-8'), finalPc, raw];
}

function encodeUtf8StringWithU8Len(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const bytes = Buffer.from(value, 'utf-8');
  if (bytes.length > 255) {
    throw new Error(`${fieldName} length must be <= 255 bytes`);
  }

  return Buffer.concat([Buffer.from([bytes.length]), bytes]);
}

function encodeUtf8StringWithU16Len(value, fieldName) {
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  const bytes = Buffer.from(value, 'utf-8');
  if (bytes.length > 65535) {
    throw new Error(`${fieldName} length must be <= 65535 bytes`);
  }

  const len = Buffer.alloc(2);
  len.writeUInt16BE(bytes.length, 0);
  return Buffer.concat([len, bytes]);
}

function encodeU64(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative safe integer`);
  }
  return encodeUint64(value, fieldName);
}

function encodeU16(value, fieldName) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65535) {
    throw new Error(`${fieldName} must be between 0 and 65535`);
  }
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value, 0);
  return out;
}

function attachVmGas(err, gasUsed) {
  if (err && typeof err === 'object' && err.vmGasUsed === undefined) {
    err.vmGasUsed = gasUsed;
  }
  return err;
}

function executeBytecode(program, context = {}) {
  const bytes = toProgramBytes(program);

  const logs = [];
  const transfers = [];
  const storageWrites = {};
  const storageView = { ...(context.storage || {}) };
  const gasLimit = Number.isSafeInteger(context.gasLimit) && context.gasLimit > 0
    ? context.gasLimit
    : Number.MAX_SAFE_INTEGER;

  let gasUsed = tritCost(bytes);
  if (gasUsed > gasLimit) {
    throw attachVmGas(new Error(`Out of gas: ${gasUsed} > ${gasLimit}`), gasUsed);
  }
  let pc = 0;
  let halted = false;
  let returnData = null;

  const fail = (message) => {
    throw attachVmGas(new Error(message), gasUsed);
  };

  const consumeGas = (delta) => {
    gasUsed += delta;
    if (gasUsed > gasLimit) {
      throw attachVmGas(new Error(`Out of gas: ${gasUsed} > ${gasLimit}`), gasUsed);
    }
  };

  try {
    while (pc < bytes.length) {
      const [opcode, nextPc] = readU8(bytes, pc, 'opcode');
      pc = nextPc;

      const baseGas = OPCODE_BASE_GAS[opcode];
      if (baseGas === undefined) {
        fail(`未知虚拟机指令码: ${opcode}`);
      }
      consumeGas(baseGas);

      if (opcode === OPCODES.STOP) {
        halted = true;
        break;
      }

      if (opcode === OPCODES.NOOP) {
        continue;
      }

      if (opcode === OPCODES.LOG) {
        const [message, finalPc, messageBytes] = readUtf8StringWithU8Len(bytes, pc, 'LOG.message');
        pc = finalPc;
        consumeGas(tritCost(messageBytes));
        logs.push(message);
        continue;
      }

      if (opcode === OPCODES.TRANSFER) {
        const [to, afterTo, toBytes] = readUtf8StringWithU8Len(bytes, pc, 'TRANSFER.to');
        const [amount, finalPc] = readU64(bytes, afterTo, 'TRANSFER.amount');
        pc = finalPc;

        if (amount <= 0) {
          fail('转账金额必须大于零');
        }

        consumeGas(tritCost(toBytes) + 24);
        transfers.push({ to, amount });
        continue;
      }

      if (opcode === OPCODES.ASSERT_RECIPIENT) {
        const [expectedRecipient, finalPc, raw] = readUtf8StringWithU8Len(
          bytes,
          pc,
          'ASSERT_RECIPIENT.expected'
        );
        pc = finalPc;
        consumeGas(tritCost(raw));

        if (context.recipient !== expectedRecipient) {
          fail('接收方断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.ASSERT_SENDER) {
        const [expectedSender, finalPc, raw] = readUtf8StringWithU8Len(
          bytes,
          pc,
          'ASSERT_SENDER.expected'
        );
        pc = finalPc;
        consumeGas(tritCost(raw));

        if (context.sender !== expectedSender) {
          fail('发送方断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.ASSERT_CHAIN_ID) {
        const [expectedChainId, finalPc] = readU32(bytes, pc, 'ASSERT_CHAIN_ID.expected');
        pc = finalPc;
        consumeGas(8);

        if (context.chainId !== expectedChainId) {
          fail('链标识断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.SLOAD) {
        const [key, finalPc, keyBytes] = readUtf8StringWithU8Len(bytes, pc, 'SLOAD.key');
        pc = finalPc;
        const value = Object.prototype.hasOwnProperty.call(storageView, key) ? String(storageView[key]) : '';
        const valueBytes = Buffer.from(value, 'utf-8');
        consumeGas(tritCost(keyBytes) + tritCost(valueBytes));
        logs.push(`哈读槽:${key}=${value}`);
        continue;
      }

      if (opcode === OPCODES.SSTORE) {
        const [key, afterKey, keyBytes] = readUtf8StringWithU8Len(bytes, pc, 'SSTORE.key');
        const [value, finalPc, valueBytes] = readUtf8StringWithU8Len(bytes, afterKey, 'SSTORE.value');
        pc = finalPc;
        consumeGas(tritCost(keyBytes) + tritCost(valueBytes) + 12);
        storageView[key] = value;
        storageWrites[key] = value;
        logs.push(`哈写槽:${key}`);
        continue;
      }

      if (opcode === OPCODES.RETURN) {
        const [result, finalPc, raw] = readUtf8StringWithU8Len(bytes, pc, 'RETURN.data');
        pc = finalPc;
        consumeGas(tritCost(raw));
        returnData = result;
        logs.push('哈返回');
        halted = true;
        break;
      }

      if (opcode === OPCODES.REVERT) {
        const [reason, finalPc, raw] = readUtf8StringWithU8Len(bytes, pc, 'REVERT.reason');
        pc = finalPc;
        consumeGas(tritCost(raw));
        throw new VMRevertError(reason || '哈回滚', gasUsed, reason || null);
      }

      if (opcode === OPCODES.RETURN_LONG) {
        const [result, finalPc, raw] = readUtf8StringWithU16Len(bytes, pc, 'RETURN_LONG.data');
        pc = finalPc;
        consumeGas(tritCost(raw));
        returnData = result;
        logs.push('哈返回');
        halted = true;
        break;
      }

      if (opcode === OPCODES.REVERT_LONG) {
        const [reason, finalPc, raw] = readUtf8StringWithU16Len(bytes, pc, 'REVERT_LONG.reason');
        pc = finalPc;
        consumeGas(tritCost(raw));
        throw new VMRevertError(reason || '哈回滚', gasUsed, reason || null);
      }

      if (opcode === OPCODES.ASSERT_CALLDATA_EQ) {
        const [expectedData, finalPc, raw] = readUtf8StringWithU16Len(bytes, pc, 'ASSERT_CALLDATA_EQ.expected');
        pc = finalPc;
        consumeGas(tritCost(raw));
        const actualData = String(context.callData ?? '');
        if (actualData !== expectedData) {
          fail('调用数据全等断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.ASSERT_CALLDATA_PREFIX) {
        const [prefix, finalPc, raw] = readUtf8StringWithU16Len(
          bytes,
          pc,
          'ASSERT_CALLDATA_PREFIX.prefix'
        );
        pc = finalPc;
        consumeGas(tritCost(raw));
        const actualData = String(context.callData ?? '');
        if (!actualData.startsWith(prefix)) {
          fail('调用数据前缀断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.ASSERT_CALL_VALUE) {
        const [expectedValue, finalPc] = readU64(bytes, pc, 'ASSERT_CALL_VALUE.expected');
        pc = finalPc;
        consumeGas(24);
        const actualValue = Number(context.callValue ?? 0);
        if (actualValue !== expectedValue) {
          fail('调用金额断言失败');
        }
        continue;
      }

      if (opcode === OPCODES.CALLDATA_LOAD) {
        const [key, finalPc, keyBytes] = readUtf8StringWithU8Len(bytes, pc, 'CALLDATA_LOAD.key');
        pc = finalPc;
        const callData = String(context.callData ?? '');
        const callDataBytes = Buffer.from(callData, 'utf-8');
        consumeGas(tritCost(keyBytes) + tritCost(callDataBytes));
        storageView[key] = callData;
        storageWrites[key] = callData;
        logs.push(`哈读参全量:${key}`);
        continue;
      }

      if (opcode === OPCODES.CALLDATA_SLICE) {
        const [key, afterKey, keyBytes] = readUtf8StringWithU8Len(bytes, pc, 'CALLDATA_SLICE.key');
        const [offset, afterOffset] = readU16(bytes, afterKey, 'CALLDATA_SLICE.offset');
        const [length, finalPc] = readU16(bytes, afterOffset, 'CALLDATA_SLICE.length');
        pc = finalPc;

        const callDataBytes = Buffer.from(String(context.callData ?? ''), 'utf-8');
        if (offset + length > callDataBytes.length) {
          fail('调用数据切片越界');
        }

        const sliceBytes = callDataBytes.slice(offset, offset + length);
        const sliceData = sliceBytes.toString('utf-8');
        consumeGas(tritCost(keyBytes) + tritCost(sliceBytes) + 8);
        storageView[key] = sliceData;
        storageWrites[key] = sliceData;
        logs.push(`哈读参切片:${key}`);
        continue;
      }
    }
  } catch (err) {
    throw attachVmGas(err, gasUsed);
  }

  return {
    gasUsed,
    logs,
    transfers,
    storageWrites,
    halted,
    returnData,
  };
}

function buildProgram(instructions) {
  if (!Array.isArray(instructions)) {
    throw new Error('instructions must be an array');
  }

  const parts = [];

  for (const instr of instructions) {
    const op = typeof instr === 'string' ? instr.toUpperCase() : String(instr.op || '').toUpperCase();

    if (!Object.prototype.hasOwnProperty.call(OPCODES, op)) {
      throw new Error(`Unknown instruction: ${op}`);
    }

    let opcode = OPCODES[op];
    const returnData = instr?.data ?? '';
    const revertData = instr?.message ?? '';

    if (op === 'RETURN') {
      const returnBytesLen = Buffer.byteLength(String(returnData), 'utf-8');
      opcode = returnBytesLen > 255 ? OPCODES.RETURN_LONG : OPCODES.RETURN;
    }

    if (op === 'REVERT') {
      const revertBytesLen = Buffer.byteLength(String(revertData), 'utf-8');
      opcode = revertBytesLen > 255 ? OPCODES.REVERT_LONG : OPCODES.REVERT;
    }

    parts.push(Buffer.from([opcode]));

    if (op === 'STOP' || op === 'NOOP') {
      continue;
    }

    if (op === 'LOG') {
      parts.push(encodeUtf8StringWithU8Len(instr.message || '', 'LOG.message'));
      continue;
    }

    if (op === 'TRANSFER') {
      parts.push(encodeUtf8StringWithU8Len(instr.to || '', 'TRANSFER.to'));
      parts.push(encodeU64(instr.amount, 'TRANSFER.amount'));
      continue;
    }

    if (op === 'ASSERT_RECIPIENT') {
      parts.push(encodeUtf8StringWithU8Len(instr.recipient || '', 'ASSERT_RECIPIENT.recipient'));
      continue;
    }

    if (op === 'ASSERT_SENDER') {
      parts.push(encodeUtf8StringWithU8Len(instr.sender || '', 'ASSERT_SENDER.sender'));
      continue;
    }

    if (op === 'ASSERT_CHAIN_ID') {
      if (!Number.isSafeInteger(instr.chainId) || instr.chainId < 0) {
        throw new Error('ASSERT_CHAIN_ID.chainId must be a non-negative safe integer');
      }
      parts.push(encodeUint32(instr.chainId, 'ASSERT_CHAIN_ID.chainId'));
      continue;
    }

    if (op === 'SLOAD') {
      parts.push(encodeUtf8StringWithU8Len(instr.key ?? '', 'SLOAD.key'));
      continue;
    }

    if (op === 'SSTORE') {
      parts.push(encodeUtf8StringWithU8Len(instr.key ?? '', 'SSTORE.key'));
      parts.push(encodeUtf8StringWithU8Len(instr.value ?? '', 'SSTORE.value'));
      continue;
    }

    if (op === 'RETURN') {
      if (opcode === OPCODES.RETURN_LONG) {
        parts.push(encodeUtf8StringWithU16Len(instr.data ?? '', 'RETURN_LONG.data'));
      } else {
        parts.push(encodeUtf8StringWithU8Len(instr.data ?? '', 'RETURN.data'));
      }
      continue;
    }

    if (op === 'REVERT') {
      if (opcode === OPCODES.REVERT_LONG) {
        parts.push(encodeUtf8StringWithU16Len(instr.message ?? '', 'REVERT_LONG.message'));
      } else {
        parts.push(encodeUtf8StringWithU8Len(instr.message ?? '', 'REVERT.message'));
      }
      continue;
    }

    if (op === 'RETURN_LONG') {
      parts.push(encodeUtf8StringWithU16Len(instr.data ?? '', 'RETURN_LONG.data'));
      continue;
    }

    if (op === 'REVERT_LONG') {
      parts.push(encodeUtf8StringWithU16Len(instr.message ?? '', 'REVERT_LONG.message'));
      continue;
    }

    if (op === 'ASSERT_CALLDATA_EQ') {
      parts.push(encodeUtf8StringWithU16Len(instr.data ?? '', 'ASSERT_CALLDATA_EQ.data'));
      continue;
    }

    if (op === 'ASSERT_CALLDATA_PREFIX') {
      parts.push(encodeUtf8StringWithU16Len(instr.prefix ?? '', 'ASSERT_CALLDATA_PREFIX.prefix'));
      continue;
    }

    if (op === 'ASSERT_CALL_VALUE') {
      parts.push(encodeU64(instr.value ?? 0, 'ASSERT_CALL_VALUE.value'));
      continue;
    }

    if (op === 'CALLDATA_LOAD') {
      parts.push(encodeUtf8StringWithU8Len(instr.key ?? '', 'CALLDATA_LOAD.key'));
      continue;
    }

    if (op === 'CALLDATA_SLICE') {
      parts.push(encodeUtf8StringWithU8Len(instr.key ?? '', 'CALLDATA_SLICE.key'));
      parts.push(encodeU16(instr.offset ?? 0, 'CALLDATA_SLICE.offset'));
      parts.push(encodeU16(instr.length ?? 0, 'CALLDATA_SLICE.length'));
      continue;
    }
  }

  return Buffer.concat(parts);
}

function encodeProgram(instructions) {
  return encodeBytes(buildProgram(instructions));
}

function disassembleProgram(program) {
  const bytes = toProgramBytes(program);
  const out = [];
  let pc = 0;

  while (pc < bytes.length) {
    const [opcode, nextPc] = readU8(bytes, pc, 'opcode');
    pc = nextPc;

    const opName = OPCODE_NAME_BY_VALUE[opcode];
    if (!opName) {
      throw new Error(`Unknown opcode while disassembling: ${opcode}`);
    }

    if (opName === 'STOP' || opName === 'NOOP') {
      out.push({ op: opName });
      continue;
    }

    if (opName === 'LOG') {
      const [message, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'LOG.message');
      pc = finalPc;
      out.push({ op: opName, message });
      continue;
    }

    if (opName === 'TRANSFER') {
      const [to, afterTo] = readUtf8StringWithU8Len(bytes, pc, 'TRANSFER.to');
      const [amount, finalPc] = readU64(bytes, afterTo, 'TRANSFER.amount');
      pc = finalPc;
      out.push({ op: opName, to, amount });
      continue;
    }

    if (opName === 'ASSERT_RECIPIENT') {
      const [recipient, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'ASSERT_RECIPIENT.recipient');
      pc = finalPc;
      out.push({ op: opName, recipient });
      continue;
    }

    if (opName === 'ASSERT_SENDER') {
      const [sender, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'ASSERT_SENDER.sender');
      pc = finalPc;
      out.push({ op: opName, sender });
      continue;
    }

    if (opName === 'ASSERT_CHAIN_ID') {
      const [chainId, finalPc] = readU32(bytes, pc, 'ASSERT_CHAIN_ID.chainId');
      pc = finalPc;
      out.push({ op: opName, chainId });
      continue;
    }

    if (opName === 'SLOAD') {
      const [key, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'SLOAD.key');
      pc = finalPc;
      out.push({ op: opName, key });
      continue;
    }

    if (opName === 'SSTORE') {
      const [key, afterKey] = readUtf8StringWithU8Len(bytes, pc, 'SSTORE.key');
      const [value, finalPc] = readUtf8StringWithU8Len(bytes, afterKey, 'SSTORE.value');
      pc = finalPc;
      out.push({ op: opName, key, value });
      continue;
    }

    if (opName === 'RETURN') {
      const [data, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'RETURN.data');
      pc = finalPc;
      out.push({ op: opName, data });
      continue;
    }

    if (opName === 'REVERT') {
      const [message, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'REVERT.message');
      pc = finalPc;
      out.push({ op: opName, message });
      continue;
    }

    if (opName === 'RETURN_LONG') {
      const [data, finalPc] = readUtf8StringWithU16Len(bytes, pc, 'RETURN_LONG.data');
      pc = finalPc;
      out.push({ op: 'RETURN', data });
      continue;
    }

    if (opName === 'REVERT_LONG') {
      const [message, finalPc] = readUtf8StringWithU16Len(bytes, pc, 'REVERT_LONG.message');
      pc = finalPc;
      out.push({ op: 'REVERT', message });
      continue;
    }

    if (opName === 'ASSERT_CALLDATA_EQ') {
      const [data, finalPc] = readUtf8StringWithU16Len(bytes, pc, 'ASSERT_CALLDATA_EQ.data');
      pc = finalPc;
      out.push({ op: opName, data });
      continue;
    }

    if (opName === 'ASSERT_CALLDATA_PREFIX') {
      const [prefix, finalPc] = readUtf8StringWithU16Len(bytes, pc, 'ASSERT_CALLDATA_PREFIX.prefix');
      pc = finalPc;
      out.push({ op: opName, prefix });
      continue;
    }

    if (opName === 'ASSERT_CALL_VALUE') {
      const [value, finalPc] = readU64(bytes, pc, 'ASSERT_CALL_VALUE.value');
      pc = finalPc;
      out.push({ op: opName, value });
      continue;
    }

    if (opName === 'CALLDATA_LOAD') {
      const [key, finalPc] = readUtf8StringWithU8Len(bytes, pc, 'CALLDATA_LOAD.key');
      pc = finalPc;
      out.push({ op: opName, key });
      continue;
    }

    if (opName === 'CALLDATA_SLICE') {
      const [key, afterKey] = readUtf8StringWithU8Len(bytes, pc, 'CALLDATA_SLICE.key');
      const [offset, afterOffset] = readU16(bytes, afterKey, 'CALLDATA_SLICE.offset');
      const [length, finalPc] = readU16(bytes, afterOffset, 'CALLDATA_SLICE.length');
      pc = finalPc;
      out.push({ op: opName, key, offset, length });
      continue;
    }
  }

  return out;
}

module.exports = {
  OPCODES,
  VMRevertError,
  executeBytecode,
  buildProgram,
  encodeProgram,
  disassembleProgram,
};
