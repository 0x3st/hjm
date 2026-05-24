# 完整走一遍

这篇不是给专家看的。你只要会复制命令、粘贴命令、按回车，就可以把 HJM 从安装到转账、合约、P2P 全部跑一遍。

如果某一步看不懂，先照着做。跑完一遍以后，再回来看解释，会容易很多。

## 先知道三件事

HJM 可以想成一个迷你版区块链：

1. 钱包：像银行卡账号，有地址，也有私钥。
2. 节点：像一个小银行柜台，负责记账、挖矿、查余额。
3. 区块：像账本的一页，挖矿就是把新交易写进这一页。

请记住：

- 地址可以给别人看。
- 私钥不要发给别人。这里是本地学习项目，可以放心实验，但真实区块链里私钥泄露就等于钱没了。
- 命令里的 `<地址>`、`<私钥>`、`<区块号>` 都要换成你自己屏幕上看到的内容。

## 第 0 步：准备环境

先确认电脑里有 Node.js：

```bash
node -v
npm -v
```

能看到版本号就继续。比如 `v20.11.0`、`10.2.4` 这种。

如果你是从源码运行：

```bash
npm install
```

以后命令可以用两种写法：

```bash
node cli.js info
```

或者全局安装后用短命令：

```bash
npm install -g .
hjm info
```

下面统一用 `node cli.js`，这样不需要全局安装。

## 第 1 步：先跑一键演示

```bash
node cli.js demo
```

它会自动做完这些事：

```text
创建钱包 -> 挖矿 -> 转账 -> 再挖矿确认 -> 部署合约 -> 调用合约 -> 查询存储 -> 验证链
```

看到最后的 `演示完成`，说明项目能跑。

## 第 2 步：打开一个节点

开一个终端，运行：

```bash
node cli.js node --haqi 1 --reward 1000
```

你会看到类似：

```text
HJM 节点已启动
RPC: http://127.0.0.1:8546
链ID: 1  哈气值: 1  奖励: 1000
```

这个终端不要关。它就是你的本地区块链节点。

后面的命令请在第二个终端里运行。

## 第 3 步：看看链现在是什么样

在第二个终端运行：

```bash
node cli.js info
```

你会看到区块高度、待处理交易、哈气值、最新哈希等信息。

刚启动时，链里通常只有创世块。创世块就是账本第一页，表示“系统开始了”。

## 第 4 步：创建两个钱包

创建 Alice：

```bash
node cli.js new --show-private-key
```

你会看到：

```text
地址: 哈原生哈...
私钥: 哈...
```

把 Alice 的地址和私钥先记下来。

再创建 Bob：

```bash
node cli.js new --show-private-key
```

也把 Bob 的地址记下来。Bob 的私钥这次可以先不用。

为了后面好读，你可以在脑子里这样对应：

```text
Alice 地址 = 第一个钱包地址
Alice 私钥 = 第一个钱包私钥
Bob 地址   = 第二个钱包地址
```

## 第 5 步：给 Alice 挖第一笔钱

现在 Alice 没钱。我们让矿工奖励发给 Alice：

```bash
node cli.js mine <Alice地址>
```

比如：

```bash
node cli.js mine 哈原生哈......
```

挖完后查 Alice 余额：

```bash
node cli.js balance <Alice地址>
```

应该能看到余额。默认奖励是 `1000`。

## 第 6 步：Alice 给 Bob 转账

转账要用 Alice 的私钥签名：

```bash
node cli.js transfer <Alice私钥> <Bob地址> 100
```

这一步只是把交易放进待处理池，还没有真正写进区块。

你可以看一下待处理交易数量：

```bash
node cli.js info
```

如果看到 `待处理交易: 1`，说明交易已经等着被打包。

## 第 7 步：挖矿确认转账

现在再挖一个块，把刚才的转账写到账本里：

```bash
node cli.js mine <Alice地址>
```

再查两个人余额：

```bash
node cli.js balance <Alice地址>
node cli.js balance <Bob地址>
```

你会看到 Bob 多了 `100`。Alice 会少掉转账金额和手续费，同时又收到这次挖矿奖励。

这就是区块链的基本流程：

```text
创建交易 -> 放进待处理池 -> 挖矿 -> 交易进入新区块 -> 状态改变
```

## 第 8 步：编码和解码

HJM 的地址、哈希和很多数据都用哈基米字符显示。

把普通 hex 编成哈基米：

```bash
node cli.js encode 0xdeadbeef
```

再把输出复制回来解码：

```bash
node cli.js decode <刚才输出的哈基米字符串>
```

你应该能得到：

```text
0xdeadbeef
```

这里背后的想法是：

```text
byte 数据 -> base-27 / tryte 风格编码 -> 中文字符
```

## 第 9 步：部署一个最简单的合约

这个合约只做两件事：

1. 在自己的存储里写入 `greeting = hakimi`
2. 返回 `deployed`

运行：

```bash
node cli.js deploy <Alice私钥> '[{"op":"SSTORE","key":"greeting","value":"hakimi"},{"op":"RETURN","data":"deployed"}]'
```

部署交易也只是进入待处理池。继续挖矿确认：

```bash
node cli.js mine <Alice地址>
```

挖矿输出里会显示区块号，比如：

```text
区块 #4 已挖出
```

记住这个数字。

## 第 10 步：从收据里找到合约地址

查刚才那个区块的收据：

```bash
node cli.js receipts <区块号>
```

比如：

```bash
node cli.js receipts 4
```

你会看到类似：

```text
合约地址: 哈合约哈...
返回: deployed
```

把合约地址记下来。

## 第 11 步：查询合约存储

刚才合约写入了 `greeting`，现在查它：

```bash
node cli.js storage <合约地址> greeting
```

如果看到：

```text
greeting: "hakimi"
```

说明合约部署和存储写入成功。

## 第 12 步：调用合约

调用刚才的合约：

```bash
node cli.js call <Alice私钥> <合约地址>
```

再挖矿确认：

```bash
node cli.js mine <Alice地址>
```

然后查新挖出的区块收据：

```bash
node cli.js receipts <新区块号>
```

如果 `success=true`，说明调用成功。

## 第 13 步：看看节点里的钱包

```bash
node cli.js wallets
```

这个命令会列出当前节点内存里见过的钱包和余额。

注意：节点重启后，内存钱包会消失。但链上的区块数据在这个教学实现里也没有持久化数据库，所以重启就是重新开始一条本地临时链。

## 第 14 步：跑两个节点体验 P2P

先把前面运行的节点停掉，按 `Ctrl+C`。

开第一个终端，启动 A 节点：

```bash
node cli.js node --port 8546 --p2p-port 6001
```

开第二个终端，启动 B 节点，并连接 A：

```bash
node cli.js node --port 8547 --p2p-port 6002 --seeds ws://127.0.0.1:6001
```

开第三个终端，查 A 的 peer：

```bash
node cli.js peers --rpc http://127.0.0.1:8546
```

再查 B 的 peer：

```bash
node cli.js peers --rpc http://127.0.0.1:8547
```

如果看到已连接节点数量大于 `0`，说明两个节点已经连上。

你也可以在 A 上挖矿：

```bash
node cli.js new --show-private-key
node cli.js mine <新地址> --rpc http://127.0.0.1:8546
```

然后在 B 上查看信息：

```bash
node cli.js info --rpc http://127.0.0.1:8547
```

如果 B 同步到了更高的区块高度，说明链同步生效。

## 第 15 步：这套系统到底走了什么流程

从头到尾，你刚才完整体验了：

```text
钱包生成
  -> 地址和私钥
  -> 挖矿获得余额
  -> 创建并签名交易
  -> 交易进入待处理池
  -> 挖矿生成新区块
  -> 状态余额更新
  -> 部署合约
  -> 合约 VM 执行指令
  -> 写入合约存储
  -> 查询收据和 storage
  -> 多节点 P2P 连接和同步
```

## 常见问题

### 提示无法连接节点

先确认第一个终端还在运行：

```bash
node cli.js node
```

如果节点不在，所有 `balance`、`mine`、`transfer`、`deploy` 命令都会连不上。

### 转账被拒绝

常见原因是 Alice 没钱。先挖矿：

```bash
node cli.js mine <Alice地址>
```

再转账。

### 合约地址在哪里

部署后一定要先挖矿，再查收据：

```bash
node cli.js mine <Alice地址>
node cli.js receipts <刚挖出的区块号>
```

### 为什么有些命令要私钥，有些只要地址

- 查余额只需要地址。
- 挖矿奖励发给谁，只需要地址。
- 转账、部署合约、调用合约需要证明“我是这个钱包主人”，所以要私钥签名。

## 结束时怎么停

在运行节点的终端里按：

```text
Ctrl+C
```

本地节点就停了。

恭喜，你已经完整走完了一条迷你 Ethereum-style 链的主要流程。
