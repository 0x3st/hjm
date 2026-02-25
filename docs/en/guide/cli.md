# CLI

HJM CLI has two categories: offline commands (no node needed) and chain commands (require `hjm node`).

## Offline Commands

```bash
hjm new [--show-private-key]    # create new wallet
hjm import <private_key>        # import wallet
hjm encode 0xdeadbeef           # hex → Hajimi
hjm decode <hajimi_string>      # Hajimi → hex
hjm demo                        # one-click full demo
```

## Node + Chain Interaction

```bash
# Start node (default 127.0.0.1:8546)
hjm node [--port 8546] [--haqi 1] [--reward 1000] [--chain-id 1]

# Commands below connect to a running node (use --rpc <url> to override)
hjm info                                    # chain info
hjm balance <address>                       # check balance
hjm mine <address>                          # mine a block
hjm transfer <privkey> <to> <amount>        # transfer
hjm deploy <privkey> '<instructions_json>'  # deploy contract
hjm call <privkey> <contract> [amount]      # call contract
hjm storage <contract> [key]                # query contract storage
hjm receipts <block_index>                  # query block receipts
hjm wallets                                 # list node wallets
```

## Example — Deploy a Storage Contract

```bash
hjm deploy <privkey> '[{"op":"SSTORE","key":"hello","value":"hakimi"},{"op":"RETURN","data":"ok"}]'
hjm mine <address>
hjm receipts 2
hjm storage <contract_address> hello
```
