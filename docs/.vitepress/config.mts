import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'HJM',
  description: 'Hajimi Blockchain Documentation',
  base: '/hjm/',

  locales: {
    zh: {
      label: '中文',
      lang: 'zh-CN',
      link: '/zh/',
      themeConfig: {
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: '进阶', link: '/zh/advanced/vm' },
          { text: '参考', link: '/zh/reference/address' },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '指南',
              items: [
                { text: '快速开始', link: '/zh/guide/getting-started' },
                { text: 'CLI 命令行', link: '/zh/guide/cli' },
                { text: 'JSON-RPC API', link: '/zh/guide/rpc-api' },
                { text: '核心概念', link: '/zh/guide/concepts' },
              ],
            },
          ],
          '/zh/advanced/': [
            {
              text: '进阶',
              items: [
                { text: 'HJM VM', link: '/zh/advanced/vm' },
                { text: '合约', link: '/zh/advanced/contracts' },
                { text: '签名方案', link: '/zh/advanced/signatures' },
                { text: '哈气值系统', link: '/zh/advanced/haqi' },
              ],
            },
          ],
          '/zh/reference/': [
            {
              text: '参考',
              items: [
                { text: '地址体系', link: '/zh/reference/address' },
                { text: '项目架构', link: '/zh/reference/architecture' },
              ],
            },
          ],
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en-US',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/en/guide/getting-started' },
          { text: 'Advanced', link: '/en/advanced/vm' },
          { text: 'Reference', link: '/en/reference/address' },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Getting Started', link: '/en/guide/getting-started' },
                { text: 'CLI', link: '/en/guide/cli' },
                { text: 'JSON-RPC API', link: '/en/guide/rpc-api' },
                { text: 'Core Concepts', link: '/en/guide/concepts' },
              ],
            },
          ],
          '/en/advanced/': [
            {
              text: 'Advanced',
              items: [
                { text: 'HJM VM', link: '/en/advanced/vm' },
                { text: 'Contracts', link: '/en/advanced/contracts' },
                { text: 'Signatures', link: '/en/advanced/signatures' },
                { text: 'HaQi System', link: '/en/advanced/haqi' },
              ],
            },
          ],
          '/en/reference/': [
            {
              text: 'Reference',
              items: [
                { text: 'Address System', link: '/en/reference/address' },
                { text: 'Architecture', link: '/en/reference/architecture' },
              ],
            },
          ],
        },
      },
    },
  },

  themeConfig: {
    socialLinks: [
      { icon: 'github', link: 'https://github.com/0x3st/hjm' },
    ],
  },
})
