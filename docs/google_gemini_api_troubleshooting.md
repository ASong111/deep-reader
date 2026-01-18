# Google Gemini API 配置问题排查

## 问题分析

根据代码检查，发现以下可能的问题：

### 1. 消息格式问题

当前代码将所有消息合并为一个文本：
```rust
let mut combined_text = String::new();
for msg in messages {
    if let (Some(role), Some(content)) = (msg.get("role"), msg.get("content")) {
        combined_text.push_str(&format!("{}: {}\n", role, content));
    }
}
```

这会产生类似这样的文本：
```
system: 你是一个专业的阅读助手...
user: 请简洁地解释以下词汇...
```

**问题**：Google Gemini API 可能不接受这种格式的 system 消息。

### 2. API 版本问题

当前使用的是 `v1beta` 版本：
```
/v1beta/models/{model}:generateContent
```

某些功能可能在 beta 版本中不稳定。

### 3. Model 名称问题

常见的 Gemini model 名称：
- `gemini-pro` (推荐)
- `gemini-1.5-pro`
- `gemini-1.5-flash`
- `gemini-1.0-pro`

确保您在应用中配置的 model 名称正确。

## 解决方案

### 方案 1：修改消息格式（推荐）

Google Gemini API 不支持 system 角色，只支持 user 和 model 角色。需要修改代码：

```rust
"google" => {
    let base_url = config.base_url.as_deref().unwrap_or("https://generativelanguage.googleapis.com");

    // Google Gemini 不支持 system 消息，只提取 user 消息
    let mut user_content = String::new();
    for msg in messages {
        if let (Some(role), Some(content)) = (msg.get("role"), msg.get("content")) {
            if role == "user" {
                user_content.push_str(content);
                user_content.push_str("\n");
            }
        }
    }

    let google_req = serde_json::json!({
        "contents": [{
            "parts": [{
                "text": user_content.trim()
            }]
        }],
        "generationConfig": {
            "temperature": config.temperature,
            "maxOutputTokens": config.max_tokens,
        }
    });

    // ... rest of the code
}
```

### 方案 2：使用 v1 API（更稳定）

将 API 端点从 `v1beta` 改为 `v1`：
```rust
.post(&format!("{}/v1/models/{}:generateContent?key={}", base_url, config.model, api_key))
```

但需要注意，v1 API 可能不支持某些新功能。

### 方案 3：添加更详细的错误日志

在错误处理中添加响应体的完整输出：
```rust
if !response.status().is_success() {
    let status = response.status();
    let error_text = response.text().await.unwrap_or_default();
    eprintln!("Google API 错误详情: {}", error_text); // 添加日志
    return Err(format!("API 错误 ({}): {}。请检查 API Key 和配置是否正确", status, error_text));
}
```

## 配置建议

在应用中配置 Google Gemini 时：

1. **Platform**: 选择 `google`
2. **API Key**: `AIzaSyAKwixQB3_v8FrQ8RFNV7nbkqcLw4qCon8`
3. **Base URL**: `https://generativelanguage.googleapis.com` (默认)
4. **Model**: `gemini-pro` (推荐) 或 `gemini-1.5-flash`
5. **Temperature**: `0.7` (默认)
6. **Max Tokens**: `1000` (默认)

## 测试步骤

1. 在应用中打开全局设置 → AI 助手配置
2. 配置 Google Gemini API
3. 选中一段文本
4. 点击 AI 释义
5. 查看错误消息（如果有）

## 常见错误

### 错误 400: Bad Request
- Model 名称错误
- 请求格式不正确
- 消息格式不符合 API 要求

**解决方法**：
- 确认 model 名称为 `gemini-pro`
- 应用方案 1 的代码修改

### 错误 403: Forbidden
- API Key 无效
- API Key 没有权限访问该 API

**解决方法**：
- 检查 API Key 是否正确
- 在 Google Cloud Console 中确认 API 已启用
- 确认 API Key 有 Generative Language API 权限

### 错误 404: Not Found
- Model 不存在
- API 端点错误

**解决方法**：
- 使用 `gemini-pro` 而不是其他名称
- 确认 Base URL 正确

## 下一步

建议应用**方案 1**的代码修改，这是最可能解决问题的方案。修改后重新编译并测试。
