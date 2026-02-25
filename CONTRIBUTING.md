# 贡献指南

感谢你对 HJM 哈基米区块链的关注！欢迎提交 Issue 和 Pull Request。

## 开发环境

```bash
git clone https://github.com/0x3st/hjm.git
cd hjm
npm install
```

## 项目结构

```
hjm/
├── hjm/           # 核心模块（编码、哈希、交易、VM、区块链等）
├── cli.js         # 命令行工具
├── tests/         # Jest 测试
├── examples/      # 示例脚本
└── docs/          # VitePress 文档
```

## 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/your-feature`
3. 提交变更：`git commit -m 'feat: 添加某功能'`
4. 推送分支：`git push origin feat/your-feature`
5. 提交 Pull Request

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：

- `feat:` 新功能
- `fix:` 修复 Bug
- `docs:` 文档变更
- `test:` 测试相关
- `refactor:` 重构（不改变功能）
- `chore:` 构建/工具链变更

## 运行测试

```bash
npm test
```

提交 PR 前请确保所有测试通过。

## 代码风格

- 使用 2 空格缩进
- 变量/函数使用 camelCase
- 保持与现有代码风格一致

## 报告问题

在 [GitHub Issues](https://github.com/0x3st/hjm/issues) 提交，请包含：

- 问题描述
- 复现步骤
- 期望行为与实际行为
- Node.js 版本和操作系统

## License

贡献的代码将以 [MIT](./LICENSE) 协议发布。
