# CLI 命令行

HJM CLI 分两类：离线命令（不需要节点）和链交互命令（需要先 `hjm node`）。

## 离线命令

```bash
hjm new [--show-private-key]    # 创建新钱包
hjm import <私钥>               # 导入钱包
hjm encode 0xdeadbeef           # hex → 哈基米
hjm decode <哈基米编码>          # 哈基米 → hex
hjm demo                        # 一键演示完整流程
```

## 节点 + 链交互

```bash
# 启动节点（默认 127.0.0.1:8546）
hjm node [--port 8546] [--haqi 1] [--reward 1000] [--chain-id 1]

# 以下命令连接运行中的节点（可加 --rpc <url> 指定地址）
hjm info                                    # 链信息
hjm balance <地址>                           # 查余额
hjm mine <地址>                              # 挖矿
hjm transfer <私钥> <目标地址> <金额>         # 转账
hjm deploy <私钥> '<指令JSON>'               # 部署合约
hjm call <私钥> <合约地址> [金额]             # 调用合约
hjm storage <合约地址> [key]                  # 查合约存储
hjm receipts <区块号>                         # 查区块收据
hjm wallets                                  # 列出节点内钱包
```

## 示例——部署一个存储合约

```bash
hjm deploy <私钥> '[{"op":"SSTORE","key":"hello","value":"hakimi"},{"op":"RETURN","data":"ok"}]'
hjm mine <地址>
hjm receipts 2          # 查看收据，获取合约地址
hjm storage <合约地址> hello
```
