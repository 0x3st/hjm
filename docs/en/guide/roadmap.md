# HJM Roadmap

This roadmap explains how HJM can grow from an educational Hajimi/ternary blockchain into a deployable Ethereum-style learning network.

## Phase 0: Current Baseline

Done:

- Nodes can connect through P2P WebSocket.
- Handshakes check `chainId`, HaQi value, mining reward, and accepted signature schemes.
- Chain snapshots can be saved and restored with `--data-dir`.
- Users can sign locally and submit transactions with `hjm_sendRawTransaction`.
- Docker, Docker Compose, and deployment docs are available.

## Phase 1: Real Deployment

Goal: four VPS nodes can run together, and public RPC does not require users to send private keys to the server.

Tasks:

- Public RPC mode that only exposes read methods and `hjm_sendRawTransaction`.
- VPS deployment templates and a four-node walkthrough.
- systemd service examples for non-Docker deployment.
- Basic operational checks for logs, restart recovery, and peer status.

## Phase 2: Network Hardening

Goal: public nodes should survive basic abuse and noisy traffic.

Tasks:

- RPC rate limits and request body limits.
- P2P peer limits, message size limits, and duplicate message suppression.
- Peer cooldown or banning.
- Cloudflare Tunnel / Nginx examples.
- Private RPC examples that only allow selected IP addresses.

## Phase 3: Ethereum-Style Execution Layer

Goal: make the HJM VM closer to a clear execution-layer model.

Tasks:

- Define account types, nonce, balance, and storage.
- Define transaction types: transfer, deploy, and call.
- Improve receipts with status, gas used, logs, and contract address.
- Expand VM instructions and gas costs.

## Phase 4: Deeper Ternary Features

Goal: keep the ternary identity as more than a text encoding.

Tasks:

- Document ordinary ternary `0/1/2` versus balanced ternary `-1/0/1`.
- Design a trit layer for addresses, hashes, and VM data.
- Explore ternary VM instructions or three-valued logic opcodes.

## Phase 5: Consensus Experiments

Goal: move from educational PoW toward a clearer consensus experiment.

Options:

- Improve PoW with difficulty adjustment, block time, orphan handling, and longest-chain rules.
- Learn from Ethereum PoS with validators, staking, slots, and epochs.
- Design an HJM-specific consensus around HaQi or trit weights.

## Phase 6: Developer Experience

Goal: make HJM useful for people who want to write contracts, send transactions, and run nodes.

Tasks:

- SDK for local signing, RPC calls, deployment, and contract calls.
- Block explorer for blocks, transactions, accounts, receipts, and peers.
- Contract examples such as counter, guestbook, and simple token.
- Faucet for a public testnet.

## Current Priority

The next priority is Phase 1 plus the first part of Phase 2:

1. Enforce public RPC mode in code.
2. Document a four-VPS deployment.
3. Add basic RPC and P2P abuse protection.
4. Continue VM and consensus work after the network base is steadier.
