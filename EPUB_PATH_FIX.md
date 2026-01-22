# EPUB 路径分隔符问题修复

## 问题描述

在 Windows 11 上导入 EPUB 文件时，所有章节都显示"找不到 TOC 条目的资源"，导致没有内容。

### 根本原因

EPUB 文件内部的路径可能使用不同的分隔符：
- **反斜杠** `\`（Windows 风格）：`OPS\chapter001.html`
- **正斜杠** `/`（Unix 风格）：`OPS/chapter001.html`
- **相对路径前缀**：`./OPS/chapter001.html` 或 `OPS/chapter001.html`

在不同平台上，`epub` crate 返回的资源路径格式可能不一致，导致路径查找失败。

## 修复方案（已实施）

### 修改文件：`src-tauri/src/parser/epub_parser.rs`

#### 1. 增强资源路径映射（第 425-447 行）

在建立路径映射时，**存储多种路径变体**以提高匹配成功率：

```rust
// 建立 path -> resource_id 的映射
let mut path_to_id = std::collections::HashMap::new();
for (id, resource) in doc.resources.iter() {
    let path_str = resource.path.to_string_lossy().to_string();

    // 规范化路径：统一使用正斜杠，并去除前导斜杠
    let normalized_path = path_str.replace('\\', "/").trim_start_matches('/').to_string();

    // 存储多种路径变体以提高匹配成功率
    path_to_id.insert(path_str.clone(), id.clone());
    path_to_id.insert(normalized_path.clone(), id.clone());

    // 如果路径以 "./" 开头，也存储去掉前缀的版本
    if let Some(stripped) = normalized_path.strip_prefix("./") {
        path_to_id.insert(stripped.to_string(), id.clone());
    }
}
```

#### 2. 增强 TOC 路径查找（第 456-481 行）

在查找资源时，**尝试多种路径变体**：

```rust
// 规范化路径：统一使用正斜杠，并去除前导斜杠
let normalized_content_path = content_path.replace('\\', "/").trim_start_matches('/').to_string();

// 尝试多种路径变体进行查找
let resource_id = path_to_id.get(content_path)
    .or_else(|| path_to_id.get(normalized_content_path.as_str()))
    .or_else(|| {
        // 尝试去掉 "./" 前缀
        if let Some(stripped) = normalized_content_path.strip_prefix("./") {
            path_to_id.get(stripped)
        } else {
            None
        }
    })
    .or_else(|| {
        // 尝试添加 "./" 前缀
        let with_prefix = format!("./{}", normalized_content_path);
        path_to_id.get(&with_prefix)
    })
    .cloned();
```

#### 3. 改进错误日志（第 483-494 行）

当路径匹配失败时，输出更详细的诊断信息：

```rust
let resource_id = match resource_id {
    Some(id) => id,
    None => {
        eprintln!("[ERROR] 找不到 TOC 条目的资源:");
        eprintln!("  - 原始路径: '{}'", content_path);
        eprintln!("  - 规范化路径: '{}'", normalized_content_path);
        eprintln!("  - 可用的资源路径 (前10个):");
        for (i, key) in path_to_id.keys().take(10).enumerate() {
            eprintln!("    [{}] '{}'", i, key);
        }
        continue;
    }
};
```

## 测试验证

重新构建并测试：

```bash
# 运行单元测试
cd src-tauri
cargo test epub_parser --lib

# 构建 Windows 版本
pnpm tauri build
```

### 预期日志输出

修复后，应该看到：

```
[DEBUG] 开始建立资源路径映射，总资源数: 21
[DEBUG] 资源路径: 'OPS\frontcover.html' (id: ...)
[DEBUG] 添加路径映射: 原始='OPS\frontcover.html', 规范化='OPS/frontcover.html'
[DEBUG] 总共 63 个资源路径映射
EPUB 解析 - TOC 条目数: 21
[DEBUG] TOC[0] 原始路径: 'OPS\frontcover.html'
[DEBUG] TOC[0] 规范化路径: 'OPS/frontcover.html'
[DEBUG] TOC[0] 查找结果: Some("id-123")
EPUB 解析 - TOC[0]: 标题=封面, Spine[0], HTML长度=1234
```

而不是：

```
[ERROR] 找不到 TOC 条目的资源:
  - 原始路径: 'OPS\frontcover.html'
  - 规范化路径: 'OPS/frontcover.html'
```

## 修复的关键点

1. **路径规范化**：统一使用正斜杠 `/`，去除前导斜杠
2. **多变体存储**：同时存储原始路径、规范化路径、去除前缀的路径
3. **多变体查找**：按优先级尝试多种路径格式
4. **详细日志**：输出所有路径变体和可用资源，便于诊断

## 相关问题

这个问题主要影响：
- Windows 平台上创建的 EPUB 文件
- 使用 Windows 路径分隔符的 EPUB 文件
- 跨平台兼容性（WSL 开发环境 vs Windows 生产环境）

## 后续优化建议

如果问题仍然存在，可以考虑：

1. **URL 解码**：处理包含 URL 编码字符的路径（如 `%20` 表示空格）
2. **大小写不敏感匹配**：某些 EPUB 文件可能有大小写问题
3. **相对路径解析**：正确处理 `../` 等相对路径引用
4. **路径前缀处理**：处理 `OEBPS/`、`EPUB/` 等常见前缀

## 参考

- EPUB 规范：https://www.w3.org/publishing/epub3/
- Rust Path 处理：https://doc.rust-lang.org/std/path/
- epub crate 文档：https://docs.rs/epub/latest/epub/
