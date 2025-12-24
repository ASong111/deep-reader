# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

##快速开始
```
pnpm install
pnpm add -D tailwindcss@3 postcss autoprefixer @types/node
npx tailwindcss init -p
# 更新前端 API 库到 v2 版本
pnpm add @tauri-apps/api @tauri-apps/plugin-dialog @tauri-apps/plugin-http
pnpm add dompurify @types/dompurify
# 启动项目
pnpm tauri dev
# 构建项目
npm run build:prod
npm run build:win
```

## 技术栈
- **后端**: Rust + Tauri v2 + SQLite
- **前端**: React + TypeScript + TailwindCSS
- **安全**: 本地内容加密存储

## 当前核心功能
- **📖 沉浸式阅读器**
  - 支持 EPUB 导入及元数据解析
  - 自动提取目录，支持图片 Base64 本地化渲染
  - 沉浸式阅读 UI，优化阅读排版

- **📝 知识管理系统**
  - **标注功能**：支持高亮、下划线等多种标注类型
  - **组织架构**：支持自定义分类与多标签管理系统
  - **高级搜索**：支持对笔记标题、正文及高亮文本的全文检索
  - **数据安全**：笔记内容本地加密，内置回收站及 30 天自动清理机制

- **🤖 AI 助手集成**
  - 集成 OpenAI, Anthropic (Claude), Google Gemini
  - 提供：总结摘要、生成思考题、内容扩展、行动建议
  - 支持自定义 API 配置与模型参数微调

- **📊 阅读统计分析**
  - 笔记创建趋势可视化
  - 阅读时长与操作频率统计
  - 分类/标签知识分布占比
