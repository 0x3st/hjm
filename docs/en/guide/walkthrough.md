# Full Walkthrough

This page is deliberately slow and practical. If you can copy a command, paste it, and press Enter, you can run the whole HJM system from wallet creation to transfers, contracts, receipts, and P2P.

## What You Are Running

Think of HJM as a tiny blockchain:

1. Wallets hold addresses and private keys.
2. A node keeps the chain, accepts transactions, mines blocks, and answers RPC queries.
3. A block is one page of the ledger. Mining writes pending transactions onto that page.

Rules of thumb:

- An address can be shared.
- A private key should not be shared. This is a local learning project, but on a real blockchain leaking a private key means losing control of the funds.
- Replace placeholders such as `<address>`, `<privateKey>`, and `<blockIndex>` with values printed by your own terminal.

## Step 0: Prepare

Check that Node.js is installed:

```bash
node -v
npm -v
```

If you are running from source:

```bash
npm install
```

This guide uses:

```bash
node cli.js
```

If you install the package globally with `npm install -g .`, you can use `hjm` instead.

## Step 1: Run the One-Command Demo

```bash
node cli.js demo
```

It automatically runs:

```text
create wallets -> mine -> transfer -> mine again -> deploy contract -> call contract -> query storage -> validate chain
```

If you see the demo finish, the project is working.

## Step 2: Understand the Demo Output

The demo prints a sequence of actions. Your addresses, hashes, and contract address will be different from the examples below. Focus on what each section means.

### 1. Create Wallets

```text
1. Create wallets
   Alice: 哈原生哈...
   Bob:   哈原生哈...
```

The demo creates two accounts: Alice and Bob.

An address is like an account number. It can be shared. A private key is like the password proving ownership. The demo only prints shortened addresses to keep the output readable.

### 2. Mine for Alice

```text
2. Mine for Alice
Mining block #1... HaQi value(H): 1
Block mined! Hash: 蛤嗨赫几... HaQi pressure: 3
   Block #1  Alice balance: 1000
```

Alice starts with no funds, so the system mines a block and sends the mining reward to Alice.

- `Block #1` is the first normal block after the genesis block `#0`.
- `HaQi value H = 1` is the PoW difficulty. HJM requires the block hash, when converted to trits, to start with `H` zero trits.
- `HaQi pressure = 3` is `3^H`, a rough expected work factor. With `H = 1`, the average search space is about `3`.
- `Alice balance: 1000` means Alice received the default mining reward.

### 3. Alice Transfers to Bob

```text
3. Alice -> Bob transfer 100
   Tx hash: 哈觅合咪...
```

Alice creates a transaction sending `100` to Bob.

The transaction hash is the transaction's identifier, like a tracking number. In HJM it is displayed as Hajimi characters instead of `0x...`.

At this moment, the transaction is only pending. It is confirmed only after mining puts it into a block.

### 4. Mine to Confirm

```text
4. Mine to confirm
   Block #2
   Alice balance: 700
   Bob balance:   1300
```

The demo mines block `#2`, which confirms the transfer.

The balance change is:

```text
Alice: 1000 - 100 - 200 = 700
Bob:      0 + 100 + 1000 + 200 = 1300
```

Alice sent `100` and paid a `200` fee. Bob received the transfer, the mining reward, and the fee because Bob was the miner reward recipient for that block.

This is the core blockchain flow:

```text
transaction enters pending pool -> mining -> transaction enters block -> state changes
```

### 5. Deploy Contract

```text
5. Deploy contract
   Deploy tx hash: 赫蜜呵蜜...
   Contract address: 哈合约哈...
```

A smart contract is a small program stored on-chain.

The demo deploys a tiny contract that stores:

```text
greeting = hakimi
```

The deploy hash identifies the deployment transaction. The contract address identifies the deployed contract, similar to an Ethereum contract address.

### 6. Call Contract

```text
6. Call contract
Mining block #5...
```

Deploying a contract is like installing the program on-chain. Calling it is like running that program. HJM VM executes the contract instructions, charges gas, handles storage, and records receipts.

### 7. Query Contract Storage

```text
7. Query contract storage
   greeting = "hakimi"
```

This proves that the contract wrote data into chain storage.

Think of the contract as a little cabinet: `greeting` is the drawer name, and `hakimi` is the content inside.

### 8. Validate the Chain

```text
8. Validate chain
   Block height: 6  Valid: true
```

The chain has 6 blocks including genesis:

```text
#0 genesis
#1 mine reward for Alice
#2 confirm Alice -> Bob transfer
#3 add more funds for Alice
#4 deploy contract
#5 call contract
```

`Valid: true` means the system checked the chain and found it consistent:

- Each block links to the previous block.
- Block hashes can be recalculated.
- PoW hashes satisfy the HaQi difficulty.
- Transactions and state transitions are valid.

In one sentence:

```text
The demo runs a tiny chain and shows wallets, mining, transfers, confirmation, contract deployment, contract calls, storage, and chain validation.
```

Now we will reproduce those steps manually.

## Step 3: Start a Node

Open one terminal:

```bash
node cli.js node --haqi 1 --reward 1000
```

Keep this terminal open. It is your local blockchain node.

Run the rest of the commands in a second terminal.

## Step 4: Inspect the Chain

```bash
node cli.js info
```

You should see block height, pending transaction count, HaQi value, and the latest hash.

## Step 5: Create Two Wallets

Create Alice:

```bash
node cli.js new --show-private-key
```

Save Alice's address and private key.

Create Bob:

```bash
node cli.js new --show-private-key
```

Save Bob's address.

## Step 6: Mine Funds for Alice

```bash
node cli.js mine <AliceAddress>
```

Check Alice's balance:

```bash
node cli.js balance <AliceAddress>
```

The default mining reward is `1000`.

## Step 7: Transfer from Alice to Bob

```bash
node cli.js transfer <AlicePrivateKey> <BobAddress> 100
```

This submits a pending transaction. It is not confirmed yet.

Check the pending transaction count:

```bash
node cli.js info
```

## Step 8: Mine the Transfer

```bash
node cli.js mine <AliceAddress>
```

Now check both balances:

```bash
node cli.js balance <AliceAddress>
node cli.js balance <BobAddress>
```

The core flow is:

```text
create transaction -> pending pool -> mine block -> transaction enters chain -> state changes
```

## Step 9: Encode and Decode

Encode hex into Hajimi characters:

```bash
node cli.js encode 0xdeadbeef
```

Decode the output:

```bash
node cli.js decode <encodedHajimiString>
```

You should get:

```text
0xdeadbeef
```

## Step 10: Deploy a Simple Contract

This contract stores `greeting = hakimi` and returns `deployed`.

```bash
node cli.js deploy <AlicePrivateKey> '[{"op":"SSTORE","key":"greeting","value":"hakimi"},{"op":"RETURN","data":"deployed"}]'
```

Mine the deploy transaction:

```bash
node cli.js mine <AliceAddress>
```

Remember the printed block index.

## Step 11: Find the Contract Address

```bash
node cli.js receipts <blockIndex>
```

The receipt should include a contract address and `deployed` as return data. Save the contract address.

## Step 12: Query Contract Storage

```bash
node cli.js storage <contractAddress> greeting
```

You should see:

```text
greeting: "hakimi"
```

## Step 13: Call the Contract

```bash
node cli.js call <AlicePrivateKey> <contractAddress>
```

Mine the call:

```bash
node cli.js mine <AliceAddress>
```

Then inspect the new block's receipts:

```bash
node cli.js receipts <newBlockIndex>
```

`success=true` means the call executed successfully.

## Step 14: List Node Wallets

```bash
node cli.js wallets
```

This lists wallets known to the current node process.

This teaching implementation does not use a persistent database. Restarting the node starts a fresh local chain.

## Step 15: Try Two P2P Nodes

Stop the previous node with `Ctrl+C`.

Terminal A:

```bash
node cli.js node --port 8546 --p2p-port 6001
```

Terminal B:

```bash
node cli.js node --port 8547 --p2p-port 6002 --seeds ws://127.0.0.1:6001
```

Terminal C:

```bash
node cli.js peers --rpc http://127.0.0.1:8546
node cli.js peers --rpc http://127.0.0.1:8547
```

If the connected peer count is greater than `0`, P2P is working.

You can mine on node A:

```bash
node cli.js new --show-private-key
node cli.js mine <newAddress> --rpc http://127.0.0.1:8546
```

Then inspect node B:

```bash
node cli.js info --rpc http://127.0.0.1:8547
```

If node B sees the higher block height, chain synchronization worked.

## What You Just Completed

```text
wallet generation
  -> address and private key
  -> mining reward
  -> signed transaction
  -> pending pool
  -> mined block
  -> balance state update
  -> contract deployment
  -> VM execution
  -> contract storage
  -> receipts
  -> P2P connection and synchronization
```

## Common Problems

### Cannot connect to node

Make sure the node terminal is still running:

```bash
node cli.js node
```

### Transfer rejected

Alice probably has no funds. Mine first:

```bash
node cli.js mine <AliceAddress>
```

### Where is the contract address?

Mine after deploy, then inspect the receipt:

```bash
node cli.js mine <AliceAddress>
node cli.js receipts <blockIndex>
```

### Why do some commands need a private key?

Balance queries only need an address. Transfers, contract deployment, and contract calls need a signature, so they need the private key.

## Stop the Node

Press `Ctrl+C` in the node terminal.

You have now completed the main workflow of a tiny Ethereum-style blockchain.
