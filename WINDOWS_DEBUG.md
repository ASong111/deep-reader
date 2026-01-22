# Windows 调试指南

## EPUB 导入没有内容的问题诊断

如果在 Windows 11 上安装后导入 EPUB 文件没有内容，请按照以下步骤诊断：

### 1. 查看调试日志

当前版本已启用控制台窗口，运行应用时会显示一个黑色的控制台窗口，其中会输出调试信息。

**关键日志标识**：
- `[DEBUG] EPUB Chapter HTML length:` - 显示每个章节的 HTML 内容长度
- `[DEBUG] Saving chapter` - 显示保存章节时的信息
- `[DEBUG] get_chapter_content` - 显示读取章节内容时的信息
- `[WARNING] Empty HTML content` - 警告：HTML 内容为空

### 2. 检查数据库位置

Windows 上的数据库文件位置：
```
C:\Users\<用户名>\AppData\Local\com.deepreader.app\deep-reader.db
```

你可以使用 SQLite 工具（如 DB Browser for SQLite）打开这个数据库文件，检查：
- `chapters` 表中的 `raw_html` 字段是否有内容
- `render_mode` 字段是否为 `"html"`

### 3. 常见问题

#### 问题 1: HTML 内容为空
**症状**：日志显示 `HTML length: 0` 或 `[WARNING] Empty HTML content`

**可能原因**：
- EPUB 文件损坏或格式不标准
- EPUB 解析器无法读取章节内容
- 文件路径包含特殊字符（Windows 路径问题）

**解决方案**：
1. 尝试导入其他 EPUB 文件
2. 确保文件路径不包含中文或特殊字符
3. 检查 EPUB 文件是否能在其他阅读器中正常打开

#### 问题 2: 数据库保存失败
**症状**：日志显示保存成功但数据库中没有数据

**可能原因**：
- 数据库文件权限问题
- 磁盘空间不足
- 杀毒软件阻止写入

**解决方案**：
1. 以管理员身份运行应用
2. 检查磁盘空间
3. 临时禁用杀毒软件测试

#### 问题 3: 前端渲染问题
**症状**：日志显示 HTML 内容长度正常，但前端不显示

**可能原因**：
- HTML 内容被 DOMPurify 过滤
- CSS 样式问题导致内容不可见
- JavaScript 错误

**解决方案**：
1. 按 F12 打开开发者工具查看控制台错误
2. 检查网络请求是否成功
3. 查看 Elements 面板确认 HTML 是否被渲染

### 4. 收集诊断信息

如果问题仍然存在，请收集以下信息：

1. **控制台日志**：复制所有以 `[DEBUG]` 和 `[WARNING]` 开头的日志
2. **数据库查询结果**：
   ```sql
   SELECT id, title, render_mode, length(raw_html) as html_length
   FROM chapters
   WHERE book_id = <你的书籍ID>;
   ```
3. **浏览器控制台错误**：按 F12 查看 Console 面板的错误信息
4. **EPUB 文件信息**：文件名、大小、来源

### 5. 临时解决方案

如果需要立即使用，可以尝试：
1. 使用 Calibre 等工具重新导出 EPUB 文件
2. 尝试导入 TXT 或 PDF 格式
3. 使用开发模式运行应用（`pnpm tauri dev`）查看更详细的日志

### 6. 恢复生产模式

调试完成后，如果要隐藏控制台窗口，需要：

1. 编辑 `src-tauri/src/main.rs`
2. 取消注释第 2 行：
   ```rust
   #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
   ```
3. 重新构建：`pnpm tauri build`

## 联系支持

如果以上步骤无法解决问题，请在 GitHub Issues 中提交问题，并附上收集的诊断信息。
