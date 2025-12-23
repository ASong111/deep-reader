# 沉浸式阅读器笔记模块 - 开发文档

## 项目架构

### 技术栈
- **前端**：React + TypeScript + TailwindCSS
- **后端**：Rust + Tauri
- **数据库**：SQLite
- **加密**：AES-256-GCM

### 目录结构
```
src/
├── components/          # React组件
│   ├── notes/          # 笔记相关组件
│   ├── immersive-reader/  # 阅读器组件
│   └── ai/             # AI相关组件
├── types/              # TypeScript类型定义
├── hooks/              # React Hooks
└── utils/              # 工具函数

src-tauri/
├── src/
│   ├── lib.rs         # 主逻辑和Tauri命令
│   ├── db.rs          # 数据库初始化
│   └── encryption.rs  # 加密模块
└── Cargo.toml         # Rust依赖
```

## 数据库Schema

### notes表
- `id`: INTEGER PRIMARY KEY
- `title`: TEXT NOT NULL
- `content`: TEXT (加密存储)
- `category_id`: INTEGER
- `book_id`: INTEGER
- `chapter_index`: INTEGER
- `highlighted_text`: TEXT (加密存储)
- `annotation_type`: TEXT DEFAULT 'highlight'
- `created_at`: DATETIME
- `updated_at`: DATETIME
- `deleted_at`: DATETIME (软删除)

### note_statistics表
- `id`: INTEGER PRIMARY KEY
- `note_id`: INTEGER
- `action_type`: TEXT (CREATE/VIEW/EDIT/DELETE)
- `action_time`: DATETIME
- `duration_seconds`: INTEGER

## API文档

### 笔记操作

#### create_note
创建新笔记
```typescript
invoke("create_note", {
  request: {
    title: string;
    content?: string;
    category_id?: number;
    book_id?: number;
    chapter_index?: number;
    highlighted_text?: string;
    annotation_type?: 'highlight' | 'underline';
    tag_ids?: number[];
  }
})
```

#### get_notes
获取笔记列表
```typescript
invoke("get_notes", {
  categoryId?: number;
  tagId?: number;
})
```

#### update_note
更新笔记
```typescript
invoke("update_note", {
  request: {
    id: number;
    title?: string;
    content?: string;
    category_id?: number;
    tag_ids?: number[];
  }
})
```

#### delete_note
软删除笔记
```typescript
invoke("delete_note", { id: number })
```

### 回收站操作

#### get_trash_notes
获取回收站笔记
```typescript
invoke("get_trash_notes")
```

#### restore_note
恢复笔记
```typescript
invoke("restore_note", { id: number })
```

#### permanently_delete_note
永久删除笔记
```typescript
invoke("permanently_delete_note", { id: number })
```

### AI助手

#### summarize_note
总结笔记
```typescript
invoke("summarize_note", { noteId: number })
```

#### generate_questions
生成问题
```typescript
invoke("generate_questions", { noteId: number })
```

#### expand_note
扩展笔记
```typescript
invoke("expand_note", { noteId: number })
```

#### get_ai_suggestion
获取建议
```typescript
invoke("get_ai_suggestion", { noteId: number })
```

### 统计

#### get_note_statistics
获取笔记统计
```typescript
invoke("get_note_statistics", {
  startDate?: string;
  endDate?: string;
})
```

## 加密机制

### 密钥管理
- 密钥存储在应用数据目录的`encryption.key`文件
- 首次使用时自动生成256位密钥
- 密钥不会上传到服务器

### 加密流程
1. 创建/更新笔记时，对`content`和`highlighted_text`进行加密
2. 使用AES-256-GCM模式
3. 加密后的内容以Base64格式存储

### 解密流程
1. 读取笔记时自动解密
2. 如果解密失败（可能是未加密的旧数据），保留原值

## 开发指南

### 添加新功能
1. 在`src-tauri/src/lib.rs`中添加Rust函数
2. 使用`#[tauri::command]`宏标记
3. 在`invoke_handler`中注册
4. 在前端使用`invoke`调用

### 运行测试
```bash
cd src-tauri
cargo test
```

### 构建
```bash
pnpm tauri build
```

## 贡献指南

1. Fork项目
2. 创建功能分支
3. 提交更改
4. 创建Pull Request

