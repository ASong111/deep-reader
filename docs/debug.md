# Bug Report

## [FIXED] Text Selection Blue Background Issue

**Status**: ✅ Fixed

**Problem**: 
在阅读区，双击内容可以选中，但是单击鼠标移动在松开文本内容没有变成蓝色背景。
(In the reading area, double-clicking content selects it, but single-clicking and dragging the mouse to select text does not result in a blue background.)

**Root Cause**:
React state updates (`setSelectedText()` and `setSelectionPosition()`) triggered component re-renders, causing DOM nodes to be replaced. This invalidated all Range objects, making it impossible to maintain text selection programmatically.

**Solution**:
1. **Used React.memo to create MemoizedContent component** - Prevents content DOM from re-rendering when selection state changes
2. **Implemented dual RAF monitoring strategy**:
   - Initial RAF (0-500ms) maintains selection immediately after mouseup
   - Long-term RAF (after handleSelection) continues monitoring for 10 seconds
3. **Delayed handleSelection execution** (600ms) - Ensures initial RAF completes before state updates

**Key Changes**:
- Created `MemoizedContent` component with `React.memo` to stabilize DOM nodes
- Moved `savedRange` from local variable to `useRef` for persistence
- Removed useEffect cleanup that was prematurely canceling RAF monitoring
- Added CSS `::selection` styles injection on component mount

**Files Modified**:
- `src/components/immersive-reader/ReaderContent.tsx`

**Fixed Date**: 2024-12-23

## 阅读器目前只能导入epub格式的文档内容问题

**Status**: ✅ Fixed

**Problem**:
点击导入书籍，只能选择*.epub文件。

**Root Cause**:
在 `src-tauri/src/lib.rs:742` 中，`upload_epub_file` 函数的文件选择器只配置了 epub 格式过滤器：
```rust
let file_path = app.dialog().file().add_filter("EPUB", &["epub"]).blocking_pick_file();
```

虽然后端已经通过 `ParserRouter` 支持了多种格式（epub, txt, md, markdown, pdf），但前端的文件选择器没有开放这些格式。

**Solution**:
1. 修改文件选择器，添加所有支持的格式：
```rust
let file_path = app.dialog().file()
    .add_filter("电子书", &["epub", "txt", "md", "markdown", "pdf"])
    .blocking_pick_file();
```

2. 重构 `upload_epub_file` 函数，使用新的异步导入流程（`async_import::import_book_async`），该流程通过 `ParserRouter` 自动路由到对应的解析器。

**Key Changes**:
- 文件选择器现在支持：epub, txt, md, markdown, pdf
- 使用统一的异步导入队列处理所有格式
- 移除了旧的仅支持 epub 的硬编码逻辑

**Files Modified**:
- `src-tauri/src/lib.rs:738-759`

**Fixed Date**: 2026-01-08

## epub导入无效问题

**Status**: 需要进一步调试

**Problem**:
点击导入epub书籍，书籍成功出现在列表，点击书籍详情进入阅读区，无内容且提示此书籍没有可用章节。

**Analysis**:

1. **导入流程**:
   - 用户点击导入 → `upload_epub_file` → `async_import::import_book_async`
   - 创建书籍记录（状态为 `pending`）
   - 加入导入队列，后台异步处理
   - 解析完成后状态更新为 `completed`

2. **章节显示逻辑** (`src-tauri/src/lib.rs:809-829`):
   - `get_book_details` 检查 `parse_status` 字段
   - 如果状态不是 `completed`，返回空章节列表
   - 只有状态为 `completed` 时才从 IRP 的 `chapters` 表读取章节

3. **可能的原因**:
   - **异步处理延迟**: 导入是异步的，用户可能在解析完成前就打开了书籍
   - **解析失败**: epub 解析器可能遇到错误，但没有正确报告
   - **章节提取问题**: epub 文件可能没有标准的章节结构，导致 `get_num_chapters()` 返回 0
   - **数据库写入问题**: 章节数据可能没有正确写入 `chapters` 表

4. **调试建议**:
   - 检查前端是否监听了 `import-progress` 和 `import-error` 事件
   - 添加日志查看 epub 解析过程中的章节数量
   - 验证特定 epub 文件（如"一只特立独行的猪.epub"）的章节结构
   - 检查数据库中的 `parse_status` 和 `chapters` 表内容

5. **前端改进建议**:
   - 在书籍卡片上显示解析状态（pending/parsing/completed/failed）
   - 监听 `import-progress` 事件，实时更新解析进度
   - 如果状态为 `pending` 或 `parsing`，显示"正在处理中..."而不是"没有可用章节"

**Next Steps**:
1. 添加更详细的日志输出到 epub 解析器
2. 测试实际的 epub 文件导入流程
3. 检查前端事件监听是否正确配置 ✅ (已完成)
4. 验证数据库中的数据完整性

**Frontend Improvements** (2026-01-08):
- ✅ 添加了 `import-progress` 事件监听，实时显示导入进度
- ✅ 添加了 `import-error` 事件监听，及时报告导入错误
- ✅ 导入完成后显示成功提示
- ✅ 改进了用户反馈，显示"书籍已加入导入队列，正在后台处理..."

**Files Modified**:
- `src/components/immersive-reader/ImmersiveReader.tsx:106-155`

## 终端不停打印 get_books 日志问题

**Status**: ✅ Fixed

**Problem**:
启动开发模式后，终端不停地打印 `get_books--------------------------------------------` 和书籍信息。

**Root Cause**:
在 `src-tauri/src/lib.rs:768-804` 的 `get_books` 函数中，存在多个调试日志：
- `println!("get_books--------------------------------------------");`
- 遍历打印每本书的信息
- 打印序列化后的 JSON

由于前端会频繁调用 `get_books`（比如监听事件后刷新书籍列表），导致这些日志不停输出。

**Solution**:
移除所有调试日志，保持函数简洁：
- 删除入口日志
- 删除书籍信息遍历打印
- 删除 JSON 序列化打印

**Files Modified**:
- `src-tauri/src/lib.rs:768-797`

**Fixed Date**: 2026-01-08

## 前端不停轮询 get_books 的问题

**Status**: ✅ Fixed

**Problem**:
启动开发模式后，前端不停地调用 `get_books` 接口，导致无限循环。

**Root Cause**:
在 `ImmersiveReader.tsx:139` 中，`useEffect` 的依赖数组包含了 `loadBooks` 和 `showSuccess`：
```typescript
}, [loadBooks, showSuccess]);
```

这导致了无限循环：
1. `showSuccess` 来自 `useToastManager()` hook
2. 如果 `useToastManager` 每次渲染返回新的函数引用
3. `useEffect` 检测到依赖变化，重新执行
4. 重新执行导致组件重新渲染
5. 循环往复，导致无限调用

**Solution**:
将 `useEffect` 的依赖数组改为空数组 `[]`，因为：
- 事件监听器只需要在组件挂载时设置一次
- `loadBooks` 和 `showSuccess` 在闭包中使用，不需要作为依赖
- 添加 `eslint-disable-next-line` 注释来抑制 lint 警告

```typescript
}, []);
// eslint-disable-next-line react-hooks/exhaustive-deps
```

**Files Modified**:
- `src/components/immersive-reader/ImmersiveReader.tsx:140`

**Fixed Date**: 2026-01-08

## 调试导入无内容问题 - 添加详细日志

**Status**: 🔍 调试中

**Problem**:
导入 epub 和 txt 格式的书籍后，书籍列表中显示书籍，但点击进入阅读区显示"没有可用章节"。

**Debugging Steps** (2026-01-08):

为了追踪问题，我添加了详细的日志输出到整个导入流程：

1. **异步导入流程** (`src-tauri/src/async_import.rs`):
   - 📚 开始处理导入任务
   - 🔍 路由解析器
   - 📖 开始解析文件
   - ✅ 解析完成（显示章节数和块数）
   - 💾 保存章节到数据库（每个章节的详细信息）
   - ✅ 章节保存完成
   - ✅ 书籍状态更新为 completed

2. **EPUB 解析器** (`src-tauri/src/parser/epub_parser.rs`):
   - 📕 开始解析
   - 📕 检测到的章节数量
   - 📕 每个章节的内容长度和解析出的块数
   - ⚠️  警告信息（如果章节无法设置或内容为空）
   - ✅ 解析完成总结

3. **TXT 解析器** (`src-tauri/src/parser/txt_parser.rs`):
   - 📄 开始解析
   - 📄 文件大小
   - 📄 检测到的编码
   - 📄 解码后内容长度
   - 📄 分割的段落数
   - 📄 创建的块数
   - ✅ 解析完成总结

**测试步骤**:

1. 重新启动开发模式：`pnpm tauri dev`
2. 导入一个 epub 文件
3. 导入一个 txt 文件
4. 查看终端输出的详细日志
5. 检查是否有错误或警告
6. 查看解析出的章节数和块数是否为 0

**预期日志输出示例**:
```
📚 开始处理导入任务: book_id=1, file_path="test.epub"
🔍 路由解析器...
📕 EPUB 解析器: 开始解析 "test.epub"
📕 EPUB: 检测到 10 个章节
📕 EPUB: 章节 0 内容长度: 5234 字符
📕 EPUB: 章节 0 解析出 15 个块
...
✅ EPUB 解析完成: 10 个章节, 150 个块
💾 开始保存章节到数据库...
  章节 0: Chapter 1 (15 个块)
  章节 1: Chapter 2 (20 个块)
...
✅ 章节保存完成
✅ 书籍状态更新为 completed
```

**Files Modified**:
- `src-tauri/src/async_import.rs:140-210`
- `src-tauri/src/parser/epub_parser.rs:297-357`
- `src-tauri/src/parser/txt_parser.rs:136-178`

**Next Steps**:
1. 运行应用并导入测试文件
2. 根据日志输出定位具体问题
3. 修复发现的问题

## 章节有了但内容没有展示的问题

**Status**: ✅ Fixed

**Problem**:
导入书籍后，章节列表显示正常，但点击章节后内容区域为空，没有显示任何内容。

**Root Cause**:
前端和后端的参数不匹配：
- **后端** (`get_chapter_content`): 期望接收 `book_id` 和 `chapter_id`（章节的数据库 ID）
- **前端** (`loadChapterContent`): 传递的是 `bookId` 和 `chapterIndex`（章节索引 0, 1, 2...）

这导致后端使用错误的 ID 查询数据库，无法找到对应的章节内容。

**Solution**:

1. **修改前端函数签名**：
   ```typescript
   // 修改前
   const loadChapterContent = useCallback(async (bookId: number, chapterIndex: number) => {
     const content = await invoke<string>("get_chapter_content", {
       bookId,
       chapterIndex
     });

   // 修改后
   const loadChapterContent = useCallback(async (bookId: number, chapterId: string) => {
     const content = await invoke<string>("get_chapter_content", {
       book_id: bookId,
       chapter_id: parseInt(chapterId)
     });
   ```

2. **修改调用处传递正确的 chapter.id**：
   ```typescript
   // 打开书籍时
   const firstChapterContent = await loadChapterContent(book.id, chapters[0].id);

   // 切换章节时
   const content = await loadChapterContent(activeBook.id, activeBook.chapters[index].id);
   ```

3. **添加后端日志**：
   ```rust
   eprintln!("📖 获取章节内容: chapter_id={}", chapter_id);
   eprintln!("📖 从数据库获取到 {} 个块", blocks.len());
   eprintln!("📖 渲染后的 HTML 长度: {} 字符", html.len());
   ```

**Key Points**:
- 前端的 `chapters` 数组中每个章节都有 `id` 字段（来自 `get_book_details`）
- 这个 `id` 是数据库中的主键，不是数组索引
- 必须使用这个 `id` 来查询章节内容

**Files Modified**:
- `src/components/immersive-reader/ImmersiveReader.tsx:178-189, 204, 240`
- `src-tauri/src/lib.rs:869-887`

**Fixed Date**: 2026-01-08

## 清理测试数据

如果需要清理所有测试数据，可以删除数据库文件：

**数据库位置**：
- Linux: `~/.local/share/com.root.deep-reader/library.db`
- macOS: `~/Library/Application Support/com.root.deep-reader/library.db`
- Windows: `%APPDATA%\com.root.deep-reader\library.db`

**清理命令**（Linux）：
```bash
# 备份并删除数据库
cd ~/.local/share/com.root.deep-reader
cp library.db library.db.backup
rm library.db
```

重新启动应用后，会自动创建新的空数据库。




## 书籍封面和阅读进度问题

**Status**: 🔧 修复中

### 问题1: 书籍封面不显示

**Status**: ✅ Fixed

**Root Cause**:
新的异步导入流程（`async_import.rs`）没有提取 EPUB 封面。

**Solution**:
在 `process_single_import` 函数中添加封面提取逻辑：
1. 解析完成后，对 EPUB 格式的书籍提取封面
2. 使用 `EpubDoc::get_cover()` 获取封面数据
3. 转换为 base64 格式
4. 更新数据库的 `cover_image` 字段

**Files Modified**:
- `src-tauri/src/async_import.rs:5-13, 202-290`

**Fixed Date**: 2026-01-08

### 问题1.5: 作者显示为"未知作者"

**Status**: ✅ Fixed

**Root Cause**:
在创建书籍记录时，作者字段硬编码为"未知作者"，没有从 EPUB 元数据中提取。

**Solution**:
在解析完成后，从 EPUB 元数据中提取标题和作者信息：
1. 使用 `doc.mdata("title")` 提取标题
2. 使用 `doc.mdata("creator")` 提取作者
3. 更新数据库的 `title` 和 `author` 字段

**Files Modified**:
- `src-tauri/src/async_import.rs:202-290`

**Fixed Date**: 2026-01-08

### 问题2: 阅读进度始终是0%

**Status**: 待实现

**Root Cause**:
前端在创建书籍对象时，`progress` 字段硬编码为 0。没有实现阅读进度的计算和持久化逻辑。

**Solution** (建议):
1. 在切换章节时，计算并保存阅读进度
2. 进度计算公式：`(当前章节索引 + 1) / 总章节数 * 100`
3. 将进度保存到本地存储（localStorage）
4. 加载书籍时从存储中读取进度


---

## Windows 数据库路径问题

**Status**: ✅ Fixed

**Problem**:
Windows 版本导入书籍时提示：`unable to open database file: C:\Users\...\AppData\Roaming\com.root.deep-reader\library.db`

**Root Cause**:
应用数据目录不存在，导致无法创建数据库文件。

**Solution**:
在 `get_db_path()` 和 `get_key_path()` 函数中添加目录检查和自动创建逻辑。

**Files Modified**:
- `src-tauri/src/lib.rs:720-741`

**Fixed Date**: 2026-01-08

---

## 统一错误提示 UI

**Status**: ✅ Fixed

**Problem**:
错误提示使用原生 `alert()` 弹窗，样式与应用不统一。

**Solution**:
使用 Toast 组件替代所有 `alert()` 调用。

**Files Modified**:
- `src/components/immersive-reader/ImmersiveReader.tsx:35, 115, 136, 140`

**Fixed Date**: 2026-01-08

---

## 扫描版 PDF 无法导入问题

**Status**: ✅ Fixed (添加友好提示)

**Problem**:
导入扫描版 PDF 后无内容显示。

**Root Cause**:
扫描版 PDF 是图片格式，`pdf_extract` 库无法提取文本。需要 OCR 技术。

**Solution**:
添加扫描版 PDF 检测，返回友好的错误提示，说明原因和建议。

**Files Modified**:
- `src-tauri/src/parser/pdf_parser.rs:56-83`

**Fixed Date**: 2026-01-08

