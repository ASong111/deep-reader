# Deep Reader (深度阅读器)

<p align="center">
  <a href="README_EN.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <img src="src-tauri/icons/128x128.png" width="128" height="128" alt="Deep Reader Logo">
</p>

<p align="center">
  <strong>一款基于 Tauri + React + Rust 构建的本地优先、隐私安全的沉浸式阅读与知识管理工具。</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2-blue?logo=tauri" alt="Tauri Version">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust" alt="Rust Edition">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="License">
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome">
</p>

---

## 🌟 项目简介

Deep Reader 专为重度知识工作者、学生和隐私敏感用户设计。它不仅是一个阅读器，更是一个集成了 AI 助手的深度学习工作站。通过本地加密存储和强大的 AI 集成，Deep Reader 帮助你在享受沉浸式阅读体验的同时，高效地捕捉和管理知识。

> [!IMPORTANT]
> **本地优先**：你的数据永远属于你，除非你主动配置，否则数据不会离开你的设备。

## 📸 界面预览

| 沉浸式阅读 | 知识库管理 | AI 助手互动 |
| :---: | :---: | :---: |
| ![阅读界面](https://via.placeholder.com/300x200?text=Reading+UI) | ![知识库](https://via.placeholder.com/300x200?text=Knowledge+Base) | ![AI 助手](https://via.placeholder.com/300x200?text=AI+Assistant) |

## ✨ 核心功能

### 📖 沉浸式阅读器
- **多格式支持**: 深度优化 EPUB/PDF/TXT/Markdown/HTML 导入，完美解析元数据与目录。
- **智能章节合并**: 基于 AI 评分模型的章节合并系统，自动识别并合并版权页、目录、序言等元信息，避免章节过碎，提供符合人类阅读节奏的章节结构。
- **排版优化**: 精心设计的阅读界面，支持图片 Base64 本地化渲染，确保离线也能流畅阅读。
- **全屏沉浸**: 支持 `F11` 快捷键一键切换全屏模式，消除干扰，专注阅读。
- **交互标注**: 在阅读过程中无缝进行高亮和下划线标注。

### 📝 知识管理系统 (Zettelkasten 启发)
- **多维组织**: 支持自定义分类与多层级标签系统，灵活管理你的知识库。
- **智能搜索**: 基于全文检索技术，快速定位笔记标题、正文及高亮文本。
- **回收站机制**: 误删无忧，内置回收站及 30 天自动清理功能。

### 🛡️ 隐私与安全
- **AES-256 加密**: 笔记内容在本地使用 `aes-gcm` 进行高强度加密。
- **完全本地化**: 所有数据存储在本地 SQLite 数据库中，不强制上传云端。
- **无追踪**: 应用本身不收集任何用户行为数据。

### 🤖 深度 AI 集成
- **多模型支持**: 已集成 OpenAI (GPT-4), Anthropic (Claude 3), Google Gemini。
- **智能辅助**:
  - **总结摘要**: 一键提取长文核心要点。
  - **思考题生成**: 基于内容生成测试题，检测理解程度。
  - **内容扩展**: 利用 AI 深度挖掘背景知识或关联信息。

## 🛠️ 技术栈

### 后端 (Rust)
- **Tauri v2**: 跨平台桌面框架。
- **Rusqlite**: 本地 SQLite 数据库驱动。
- **Epub-rs**: 高效的 EPUB 解析引擎。
- **AES-GCM**: 工业级加密算法。
- **Reqwest**: 异步 HTTP 客户端。

### 前端 (TypeScript)
- **React 19**: 现代前端 UI 库。
- **TailwindCSS**: 原子级 CSS 框架。
- **Lucide React**: 简洁美观的图标库。
- **Vite**: 极速构建工具。

## 🚀 快速开始

### 前置要求

在开始之前，请确保你的系统已安装：
- **Rust**: [安装指南](https://www.rust-lang.org/tools/install)
- **Node.js**: v18+ 
- **pnpm**: `npm install -g pnpm`
- **系统依赖**: 请参考 [Tauri 依赖安装指南](https://v2.tauri.app/guides/getting-started/prerequisites/) (尤其是 Linux 用户需安装 `build-essential`, `webkit2gtk` 等)。

### 安装与运行

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/deep-reader.git
   cd deep-reader
   ```

2. **安装依赖**
   ```bash
   pnpm install
   ```

3. **启动开发环境**
   ```bash
   pnpm tauri dev
   ```

4. **AI 配置**
   在应用内的“设置”界面中填写您的 API Key。目前支持 OpenAI, Anthropic 和 Gemini。

## 📂 项目结构

```text
├── src/                # 前端 React 代码
│   ├── components/     # UI 组件
│   ├── hooks/          # 自定义 Hooks
│   ├── utils/          # 工具函数
│   └── types/          # 类型定义
├── src-tauri/          # Rust 后端
│   ├── src/
│   │   ├── lib.rs      # 指令处理
│   │   ├── db.rs       # 数据库层
│   │   ├── encryption.rs # 加密逻辑
│   │   ├── parser/     # 多格式解析器
│   │   └── reading_unit/ # 智能章节合并系统
│   └── Cargo.toml      # Rust 依赖
└── docs/               # 项目文档
```

## 🎯 核心技术亮点

### 智能章节合并系统 (Reading Unit Builder)

Deep Reader 实现了一套先进的章节合并评分系统，解决了传统电子书阅读器章节过碎的问题：

#### 🧠 工作原理

系统通过 **6 维度评分模型** 智能判断章节是否应该合并：

1. **TOC 语义分** (权重 1.5) - 基于目录结构的层级判断
2. **标题强度分** (权重 1.2) - 识别强章标题（第X章）vs 弱标题（1.1小节）
3. **长度合理性分** (权重 1.0) - 避免过短或过长的章节
4. **内容类型分** (权重 1.0) - 自动识别版权页、目录、序言等元信息
5. **位置惩罚分** (权重 0.8) - 考虑章节在书中的位置
6. **连续性分** (权重 0.8) - 判断章节编号是否连续

#### ✨ 核心特性

- **格式无关**: 支持 EPUB/PDF/TXT/Markdown/HTML 所有格式
- **智能识别**: 自动识别并合并版权页、目录、序言等前言内容
- **两层结构**: 支持章-节两层层级，完美适配技术书籍
- **可解释性**: 每个决策都有明确的评分明细和原因
- **降级策略**: 评分失败时自动使用简单规则，确保系统稳定性
- **完整测试**: 46 个单元测试和集成测试，确保代码质量

#### 📊 效果对比

| 传统解析 | 智能合并后 |
|---------|-----------|
| 版权页（独立章节） | ✅ 合并到第一章 |
| 目录（独立章节） | ✅ 合并到第一章 |
| 序言（独立章节） | ✅ 合并到第一章 |
| 第一章 | 第一章（包含前言内容） |
| 1.1 小节 | ├─ 1.1 小节 |
| 1.2 小节 | └─ 1.2 小节 |

#### 🔧 技术实现

```
Parser (格式相关)
 ↓
Segment Builder → 构建候选片段
 ↓
Feature Extractor → 提取 6 维特征
 ↓
Scoring Engine → 计算加权评分
 ↓
Decision Engine → 4 层优先级决策
 ↓
Reading Unit Builder → 构建最终结构
 ↓
持久化到数据库
```

详细设计文档请参考：[章节合并评分规则 PRD](docs/章节合并评分规则_prd.md)

---

## 🛣️ 路线图 (Roadmap)
- [x] 支持 PDF 格式导入
- [x] 支持 Markdown/TXT/HTML 格式导入
- [x] 智能章节合并系统
- [ ] Debug 面板可视化（评分明细展示）
- [ ] 用户设置：显示/隐藏前言内容
- [ ] AI 章节摘要生成
- [ ] 导出笔记为 Markdown/Notion
- [ ] 移动端适配 (Tauri Mobile)
- [ ] 自定义 AI Prompt 模板
- [ ] 多端数据同步 (加密同步)

## 🤝 贡献指南

我们非常欢迎任何形式的贡献！
1. Fork 本项目。
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4. 推送到分支 (`git push origin feature/AmazingFeature`)。
5. 开启一个 Pull Request。

请参考 [开发文档](docs/development.md) 了解更多细节。

## 📄 开源协议

本项目采用 [GPL v3](LICENSE) 许可协议。

---

<p align="center">
  如果这个项目对你有帮助，请给它一个 ⭐️！
</p>

<p align="center">
  Made with ❤️ by Deep Reader Team
</p>
