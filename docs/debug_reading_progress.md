# 阅读进度功能调试指南

## 问题排查步骤

### 1. 启动应用并打开开发者工具

```bash
pnpm tauri dev
```

启动后，按 `F12` 或 `Ctrl+Shift+I` 打开浏览器开发者工具的控制台。

### 2. 检查书籍加载日志

在图书馆页面，你应该看到以下日志：

```
📚 加载书籍列表: X 本书
📖 书籍 "书名" 章节数: Y
📍 书籍 "书名" 阅读进度: { chapter_index: Z, scroll_offset: W } 或 null
📊 书籍 "书名" 进度百分比: XX %
✅ 所有书籍进度加载完成: [...]
```

**如果没有看到这些日志**：
- 检查是否有错误信息
- 确认书籍是否已成功导入

### 3. 测试进度保存

1. 点击一本书进入阅读界面
2. 滚动页面
3. 等待 2 秒（防抖时间）
4. 查看控制台，应该看到：

```
💾 保存阅读进度: { bookId: X, chapterIndex: Y, scrollOffset: Z }
✅ 阅读进度保存成功
```

**如果看到错误**：
```
❌ 保存阅读进度失败: [错误信息]
```
- 检查后端 API 是否正常
- 检查数据库是否可写

### 4. 测试进度显示

1. 阅读几个章节后，点击"返回图书馆"
2. 观察书籍卡片：
   - 应该显示进度百分比（如 "30% Read"）
   - 进度条应该有相应的填充
3. 查看控制台，应该再次看到加载日志

### 5. 测试进度恢复

1. 在图书馆点击之前阅读过的书籍
2. 应该自动跳转到上次阅读的章节
3. 页面应该平滑滚动到上次的位置

## 常见问题

### 问题1：进度始终显示 0%

**可能原因**：
1. 没有保存过阅读进度
2. `get_reading_progress` 返回 null
3. 章节数为 0

**解决方法**：
- 确保滚动页面并等待 2 秒
- 检查控制台日志中的 `📍 阅读进度` 是否为 null
- 检查 `📖 章节数` 是否大于 0

### 问题2：保存进度失败

**可能原因**：
1. 数据库权限问题
2. API 未正确注册
3. 参数类型不匹配

**解决方法**：
- 检查控制台错误信息
- 确认 `save_reading_progress` 在 `invoke_handler` 中已注册
- 检查传递的参数类型是否正确

### 问题3：进度不更新

**可能原因**：
1. 返回图书馆时没有调用 `loadBooks()`
2. 缓存问题

**解决方法**：
- 确认 `handleBackToLibrary` 函数中有 `loadBooks()` 调用
- 刷新页面重新加载

## 数据库检查

如果需要直接检查数据库：

```bash
# macOS
sqlite3 ~/Library/Application\ Support/com.deep-reader.app/deep-reader.db

# Linux
sqlite3 ~/.local/share/com.deep-reader.app/deep-reader.db

# Windows
sqlite3 %APPDATA%\com.deep-reader.app\deep-reader.db
```

查询阅读进度：
```sql
SELECT * FROM reading_progress;
```

查看书籍和章节：
```sql
SELECT b.id, b.title, COUNT(c.id) as chapter_count
FROM books b
LEFT JOIN chapters c ON b.id = c.book_id
GROUP BY b.id;
```

## 代码检查清单

- [ ] `save_reading_progress` 已在 `lib.rs` 中注册
- [ ] `get_reading_progress` 已在 `lib.rs` 中注册
- [ ] `loadBooks` 函数使用 `get_book_details` API
- [ ] 进度计算使用 `(chapter_index + 1) / total_chapters`
- [ ] `handleBackToLibrary` 调用 `loadBooks()`
- [ ] `ReaderContent` 监听滚动事件
- [ ] 防抖时间设置为 2000ms

## 预期行为

### 正常流程

1. **首次打开书籍**：
   - 进度为 0%
   - 从第一章开始

2. **阅读并滚动**：
   - 2秒后自动保存进度
   - 控制台显示保存成功

3. **返回图书馆**：
   - 书籍卡片显示进度百分比
   - 进度条有相应填充

4. **再次打开书籍**：
   - 自动跳转到上次章节
   - 滚动到上次位置

### 进度计算示例

假设一本书有 10 章：

| 当前章节 | chapter_index | 计算公式 | 进度 |
|---------|--------------|---------|------|
| 第1章   | 0            | (0+1)/10 | 10%  |
| 第3章   | 2            | (2+1)/10 | 30%  |
| 第5章   | 4            | (4+1)/10 | 50%  |
| 第10章  | 9            | (9+1)/10 | 100% |
