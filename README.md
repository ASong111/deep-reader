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

##功能
- 自动标注与笔记生成：
在阅读区选择文本后，点击工具栏的高亮或下划线按钮，系统会自动在数据库中创建一条关联该文本的笔记。
标注类型（高亮或下划线）会被持久化存储。
