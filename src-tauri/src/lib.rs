use tauri::{AppHandle, Manager, Emitter}; // v2: use Emitter trait
use tauri_plugin_dialog::DialogExt; // v2 插件扩展
use std::path::PathBuf;
use epub::doc::EpubDoc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// AI 配置结构
#[derive(Serialize, Deserialize, Debug)]
pub struct AIConfig {
    pub id: i32,
    pub platform: String,
    pub api_key: Option<String>,
    pub base_url: Option<String>,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: i32,
    pub is_active: bool,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AIRequest {
    pub note_content: String,
    pub note_title: String,
    pub highlighted_text: Option<String>,
    pub action: String, // "summarize", "questions", "suggestions", "expand"
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIRequest {
    model: String,
    messages: Vec<HashMap<String, String>>,
    temperature: f64,
    max_tokens: i32,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIChoice {
    message: OpenAIMessage,
}

#[derive(Serialize, Deserialize, Debug)]
struct OpenAIMessage {
    content: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicRequest {
    model: String,
    max_tokens: i32,
    messages: Vec<AnthropicMessage>,
    temperature: f64,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
}

#[derive(Serialize, Deserialize, Debug)]
struct AnthropicContent {
    text: String,
}

// #[derive(Serialize, Deserialize, Debug)]
// struct GoogleRequest {
//     contents: Vec<GoogleContent>,
//     generation_config: GoogleGenerationConfig,
// }

#[derive(Serialize, Deserialize, Debug)]
struct GoogleContent {
    parts: Vec<GooglePart>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GooglePart {
    text: String,
}

// #[derive(Serialize, Deserialize, Debug)]
// struct GoogleGenerationConfig {
//     temperature: f64,
//     max_output_tokens: i32,
// }

#[derive(Serialize, Deserialize, Debug)]
struct GoogleResponse {
    candidates: Vec<GoogleCandidate>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleCandidate {
    content: GoogleContent,
}

// 获取 AI 配置
#[tauri::command]
fn get_ai_configs(app: AppHandle) -> Result<Vec<AIConfig>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT id, platform, api_key, base_url, model, temperature, max_tokens, is_active 
         FROM ai_config ORDER BY platform"
    ).map_err(|e| e.to_string())?;
    
    let configs = stmt.query_map([], |row| {
        Ok(AIConfig {
            id: row.get(0)?,
            platform: row.get(1)?,
            api_key: row.get(2)?,
            base_url: row.get(3)?,
            model: row.get(4)?,
            temperature: row.get(5)?,
            max_tokens: row.get(6)?,
            is_active: row.get::<_, i32>(7)? == 1,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    Ok(configs)
}

// 更新 AI 配置
#[tauri::command]
fn update_ai_config(app: AppHandle, config: AIConfig) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE ai_config SET api_key = ?1, base_url = ?2, model = ?3, 
         temperature = ?4, max_tokens = ?5, is_active = ?6, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?7",
        rusqlite::params![
            config.api_key,
            config.base_url,
            config.model,
            config.temperature,
            config.max_tokens,
            if config.is_active { 1 } else { 0 },
            config.id
        ],
    ).map_err(|e| format!("更新 AI 配置失败: {}", e))?;
    
    // 如果设置为激活，取消其他配置的激活状态
    if config.is_active {
        conn.execute(
            "UPDATE ai_config SET is_active = 0 WHERE id != ?1",
            rusqlite::params![config.id],
        ).map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

// 获取激活的 AI 配置
fn get_active_ai_config(conn: &rusqlite::Connection) -> Result<AIConfig, String> {
    let config = conn.query_row(
        "SELECT id, platform, api_key, base_url, model, temperature, max_tokens, is_active 
         FROM ai_config WHERE is_active = 1 LIMIT 1",
        [],
        |row| {
            Ok(AIConfig {
                id: row.get(0)?,
                platform: row.get(1)?,
                api_key: row.get(2)?,
                base_url: row.get(3)?,
                model: row.get(4)?,
                temperature: row.get(5)?,
                max_tokens: row.get(6)?,
                is_active: row.get::<_, i32>(7)? == 1,
            })
        },
    ).map_err(|_| "未找到激活的 AI 配置".to_string())?;
    
    if config.api_key.is_none() || config.api_key.as_ref().unwrap().is_empty() {
        return Err("API key 未配置".to_string());
    }
    
    Ok(config)
}

// 构建提示词
fn build_prompt(action: &str, note_title: &str, note_content: &str, highlighted_text: Option<&str>) -> String {
    match action {
        "summarize" => {
            format!(
                "请总结以下笔记的要点：\n\n标题：{}\n\n内容：{}\n\n{}",
                note_title,
                note_content,
                if let Some(highlighted) = highlighted_text {
                    format!("高亮文本：{}", highlighted)
                } else {
                    String::new()
                }
            )
        },
        "questions" => {
            format!(
                "基于以下笔记内容，生成 3-5 个深入思考的问题：\n\n标题：{}\n\n内容：{}\n\n{}",
                note_title,
                note_content,
                if let Some(highlighted) = highlighted_text {
                    format!("高亮文本：{}", highlighted)
                } else {
                    String::new()
                }
            )
        },
        "suggestions" => {
            format!(
                "针对以下笔记，提供相关的学习建议或行动建议：\n\n标题：{}\n\n内容：{}\n\n{}",
                note_title,
                note_content,
                if let Some(highlighted) = highlighted_text {
                    format!("高亮文本：{}", highlighted)
                } else {
                    String::new()
                }
            )
        },
        "expand" => {
            format!(
                "请扩展以下笔记内容，提供更详细的解释或相关背景：\n\n标题：{}\n\n内容：{}\n\n{}",
                note_title,
                note_content,
                if let Some(highlighted) = highlighted_text {
                    format!("高亮文本：{}", highlighted)
                } else {
                    String::new()
                }
            )
        },
        _ => format!("请分析以下笔记：\n\n标题：{}\n\n内容：{}", note_title, note_content),
    }
}

// 调用 LLM API 的通用函数（支持消息列表）
async fn call_llm_api(
    config: &AIConfig,
    messages: Vec<HashMap<String, String>>,
) -> Result<String, String> {
    let api_key = config.api_key.as_ref().ok_or("API key 未配置")?;
    let client = reqwest::Client::new();
    
    match config.platform.as_str() {
        "openai" | "openai-cn" => {
            let base_url = config.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
            
            let openai_req = OpenAIRequest {
                model: config.model.clone(),
                messages,
                temperature: config.temperature,
                max_tokens: config.max_tokens,
            };
            
            let response = client
                .post(&format!("{}/chat/completions", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&openai_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let openai_resp: OpenAIResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            openai_resp.choices.first()
                .and_then(|c| Some(c.message.content.clone()))
                .ok_or("未获取到响应内容".to_string())
        },
        "anthropic" => {
            let base_url = config.base_url.as_deref().unwrap_or("https://api.anthropic.com");
            
            // 转换消息格式
            let mut anthropic_messages = Vec::new();
            for msg in messages {
                if let (Some(role), Some(content)) = (msg.get("role"), msg.get("content")) {
                    anthropic_messages.push(AnthropicMessage {
                        role: role.clone(),
                        content: content.clone(),
                    });
                }
            }
            
            let anthropic_req = AnthropicRequest {
                model: config.model.clone(),
                max_tokens: config.max_tokens,
                temperature: config.temperature,
                messages: anthropic_messages,
            };
            
            let response = client
                .post(&format!("{}/v1/messages", base_url))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&anthropic_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let anthropic_resp: AnthropicResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            anthropic_resp.content.first()
                .and_then(|c| Some(c.text.clone()))
                .ok_or("未获取到响应内容".to_string())
        },
        "google" => {
            let base_url = config.base_url.as_deref().unwrap_or("https://generativelanguage.googleapis.com");
            
            // 合并所有消息内容
            let mut combined_text = String::new();
            for msg in messages {
                if let (Some(role), Some(content)) = (msg.get("role"), msg.get("content")) {
                    combined_text.push_str(&format!("{}: {}\n", role, content));
                }
            }
            
            let google_req = serde_json::json!({
                "contents": [{
                    "parts": [{
                        "text": combined_text
                    }]
                }],
                "generationConfig": {
                    "temperature": config.temperature,
                    "maxOutputTokens": config.max_tokens,
                }
            });
            
            let response = client
                .post(&format!("{}/v1beta/models/{}:generateContent?key={}", base_url, config.model, api_key))
                .header("Content-Type", "application/json")
                .json(&google_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let google_resp: GoogleResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            google_resp.candidates.first()
                .and_then(|c| c.content.parts.first())
                .and_then(|p| Some(p.text.clone()))
                .ok_or("未获取到响应内容".to_string())
        },
        _ => Err(format!("不支持的平台: {}", config.platform)),
    }
}

// 即时理解：简洁释义/翻译 (F1.0)
#[tauri::command]
async fn explain_text(
    app: AppHandle,
    selected_text: String,
    _book_id: i32,
    _chapter_index: usize,
) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let config = get_active_ai_config(&conn)?;
    
    // 构建提示词：简洁释义，针对名词/短语，不再获取章节上下文
    let prompt = format!("请简洁地解释以下词汇或短语的含义（2-3行以内）：\n\n{}", selected_text);
    
    // 构建消息
    let mut messages = Vec::new();
    let mut system_msg = HashMap::new();
    system_msg.insert("role".to_string(), "system".to_string());
    system_msg.insert("content".to_string(), "你是一个专业的阅读助手，能够简洁准确地解释文字含义。请用2-3行文字回答。".to_string());
    messages.push(system_msg);
    
    let mut user_msg = HashMap::new();
    user_msg.insert("role".to_string(), "user".to_string());
    user_msg.insert("content".to_string(), prompt);
    messages.push(user_msg);
    
    call_llm_api(&config, messages).await
}

// 互动讨论：基于本章上下文的对话 (F3.0)
#[derive(Deserialize, Debug)]
struct ChatMessage {
    role: String,
    content: String,
}

#[tauri::command]
async fn chat_with_ai(
    app: AppHandle,
    user_message: String,
    book_id: i32,
    chapter_index: usize,
    chat_history: Option<Vec<ChatMessage>>,
) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let config = get_active_ai_config(&conn)?;
    
    // 获取章节上下文（纯文本）
    let chapter_context = get_chapter_plain_text(&app, book_id, chapter_index)
        .map_err(|e| format!("获取章节上下文失败: {}", e))?;
    
    // 限制章节上下文长度
    let context_limit = 3000;
    let truncated_context = if chapter_context.len() > context_limit {
        format!("{}...", &chapter_context[..context_limit])
    } else {
        chapter_context
    };
    
    // 构建消息列表
    let mut messages = Vec::new();
    
    // 系统消息：明确指示仅基于当前章节回答
    let mut system_msg = HashMap::new();
    system_msg.insert("role".to_string(), "system".to_string());
    system_msg.insert("content".to_string(), format!(
        "你是一个专业的阅读助手。用户正在阅读一本书的某个章节。\n\n当前章节内容：\n{}\n\n请严格基于以上章节内容回答用户的问题。如果问题超出章节内容范围，请礼貌地说明。",
        truncated_context
    ));
    messages.push(system_msg);
    
    // 添加历史对话（如果有）
    if let Some(history) = chat_history {
        for msg in history {
            let mut history_msg = HashMap::new();
            history_msg.insert("role".to_string(), msg.role);
            history_msg.insert("content".to_string(), msg.content);
            messages.push(history_msg);
        }
    }
    
    // 添加当前用户消息
    let mut user_msg = HashMap::new();
    user_msg.insert("role".to_string(), "user".to_string());
    user_msg.insert("content".to_string(), user_message);
    messages.push(user_msg);
    
    call_llm_api(&config, messages).await
}

// 调用 AI API
#[tauri::command]
async fn call_ai_assistant(app: AppHandle, request: AIRequest) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let config = get_active_ai_config(&conn)?;
    let api_key = config.api_key.as_ref().ok_or("API key 未配置")?;
    
    let prompt = build_prompt(
        &request.action,
        &request.note_title,
        &request.note_content,
        request.highlighted_text.as_deref(),
    );
    
    let client = reqwest::Client::new();
    let response_text = match config.platform.as_str() {
        "openai" | "openai-cn" => {
            let base_url = config.base_url.as_deref().unwrap_or(
                if config.platform == "openai-cn" {
                    "https://api.openai.com/v1"
                } else {
                    "https://api.openai.com/v1"
                }
            );
            
            let mut messages = Vec::new();
            let mut system_msg = HashMap::new();
            system_msg.insert("role".to_string(), "system".to_string());
            system_msg.insert("content".to_string(), "你是一个专业的笔记分析助手，能够帮助用户理解和扩展笔记内容。".to_string());
            messages.push(system_msg);
            
            let mut user_msg = HashMap::new();
            user_msg.insert("role".to_string(), "user".to_string());
            user_msg.insert("content".to_string(), prompt);
            messages.push(user_msg);
            
            let openai_req = OpenAIRequest {
                model: config.model,
                messages,
                temperature: config.temperature,
                max_tokens: config.max_tokens,
            };
            
            let response = client
                .post(&format!("{}/chat/completions", base_url))
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&openai_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let openai_resp: OpenAIResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            openai_resp.choices.first()
                .and_then(|c| Some(c.message.content.clone()))
                .ok_or("未获取到响应内容".to_string())?
        },
        "anthropic" => {
            let base_url = config.base_url.as_deref().unwrap_or("https://api.anthropic.com");
            
            let anthropic_req = AnthropicRequest {
                model: config.model,
                max_tokens: config.max_tokens,
                temperature: config.temperature,
                messages: vec![
                    AnthropicMessage {
                        role: "user".to_string(),
                        content: prompt,
                    }
                ],
            };
            
            let response = client
                .post(&format!("{}/v1/messages", base_url))
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("Content-Type", "application/json")
                .json(&anthropic_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let anthropic_resp: AnthropicResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            anthropic_resp.content.first()
                .and_then(|c| Some(c.text.clone()))
                .ok_or("未获取到响应内容".to_string())?
        },
        "google" => {
            let base_url = config.base_url.as_deref().unwrap_or("https://generativelanguage.googleapis.com");
            
            // Google Gemini API 需要不同的格式
            let google_req = serde_json::json!({
                "contents": [{
                    "parts": [{
                        "text": prompt
                    }]
                }],
                "generationConfig": {
                    "temperature": config.temperature,
                    "maxOutputTokens": config.max_tokens,
                }
            });
            
            let response = client
                .post(&format!("{}/v1beta/models/{}:generateContent?key={}", base_url, config.model, api_key))
                .header("Content-Type", "application/json")
                .json(&google_req)
                .send()
                .await
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().await.unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let google_resp: GoogleResponse = response.json()
                .await
                .map_err(|e| format!("解析响应失败: {}", e))?;
            
            google_resp.candidates.first()
                .and_then(|c| c.content.parts.first())
                .and_then(|p| Some(p.text.clone()))
                .ok_or("未获取到响应内容".to_string())?
        },
        _ => return Err(format!("不支持的平台: {}", config.platform)),
    };
    
    Ok(response_text)
}

// AI助手：总结笔记
#[tauri::command]
async fn summarize_note(app: AppHandle, note_id: i32) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let key = get_encryption_key(&app)?;
    let note = get_note_by_id_with_decrypt(&conn, note_id, &key)?;
    
    let request = AIRequest {
        note_content: note.content.unwrap_or_default(),
        note_title: note.title,
        highlighted_text: note.highlighted_text,
        action: "summarize".to_string(),
    };
    
    call_ai_assistant(app, request).await
}

// AI助手：生成问题
#[tauri::command]
async fn generate_questions(app: AppHandle, note_id: i32) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let key = get_encryption_key(&app)?;
    let note = get_note_by_id_with_decrypt(&conn, note_id, &key)?;
    
    let request = AIRequest {
        note_content: note.content.unwrap_or_default(),
        note_title: note.title,
        highlighted_text: note.highlighted_text,
        action: "questions".to_string(),
    };
    
    call_ai_assistant(app, request).await
}

// AI助手：扩展笔记
#[tauri::command]
async fn expand_note(app: AppHandle, note_id: i32) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let key = get_encryption_key(&app)?;
    let note = get_note_by_id_with_decrypt(&conn, note_id, &key)?;
    
    let request = AIRequest {
        note_content: note.content.unwrap_or_default(),
        note_title: note.title,
        highlighted_text: note.highlighted_text,
        action: "expand".to_string(),
    };
    
    call_ai_assistant(app, request).await
}

// AI助手：获取建议
#[tauri::command]
async fn get_ai_suggestion(app: AppHandle, note_id: i32) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let key = get_encryption_key(&app)?;
    let note = get_note_by_id_with_decrypt(&conn, note_id, &key)?;
    
    let request = AIRequest {
        note_content: note.content.unwrap_or_default(),
        note_title: note.title,
        highlighted_text: note.highlighted_text,
        action: "suggestions".to_string(),
    };
    
    call_ai_assistant(app, request).await
}

mod db;
mod encryption;
mod irp;
mod asset_manager;
mod parser;
mod import_queue;
mod async_import;
mod reading_unit;

#[derive(Serialize, Debug)]
struct Book {
    id: i32,
    title: String,
    author: String,
    cover_image: Option<String>,
}

#[derive(Serialize)]
struct ChapterInfo {
    title: String,
    id: String,
}

#[derive(Serialize)]
struct ChapterContentResponse {
    content: String,
    render_mode: String,
}

// 辅助函数：获取数据库路径
fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");

    // 确保目录存在
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
    }

    app_data_dir.join("library.db")
}

// 辅助函数：获取加密密钥路径
fn get_key_path(app: &AppHandle) -> PathBuf {
    let app_data_dir = app.path().app_data_dir().expect("failed to get app data dir");

    // 确保目录存在
    if !app_data_dir.exists() {
        std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
    }

    app_data_dir.join("encryption.key")
}

// 辅助函数：获取或创建加密密钥
fn get_encryption_key(app: &AppHandle) -> Result<Vec<u8>, String> {
    let key_path = get_key_path(app);
    encryption::get_or_create_key(&key_path)
        .map_err(|e| format!("获取加密密钥失败: {}", e))
}

// 1. 上传文件管道：打开对话框 -> 使用异步导入流程
#[tauri::command]
async fn upload_epub_file(app: AppHandle) -> Result<String, String> {
    // 1. 使用 Tauri v2 Dialog 插件打开文件选择器，支持多种格式
    let file_path = app.dialog().file()
        .add_filter("电子书", &["epub", "txt", "md", "markdown", "pdf"])
        .blocking_pick_file();

    let path = match file_path {
        Some(p) => p.into_path().map_err(|e| e.to_string())?,
        None => return Err("用户取消操作".to_string()),
    };

    // 使用新的异步导入流程
    let path_str = path.to_string_lossy().to_string();
    let book_id = async_import::import_book_async(app.clone(), path_str).await?;

    // 发送事件通知前端刷新
    app.emit("book-added", book_id).map_err(|e| e.to_string())?;

    Ok("导入成功，正在后台处理...".to_string())
}

/// 异步导入书籍（支持多种格式）
///
/// 创建书籍记录并加入导入队列，立即返回 book_id
#[tauri::command]
async fn import_book(app: AppHandle, file_path: String) -> Result<i32, String> {
    async_import::import_book_async(app, file_path).await
}

#[tauri::command]
fn get_books(app: AppHandle) -> Result<Vec<Book>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, title, author, cover_image FROM books ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    let book_iter = stmt.query_map([], |row| {
        let title: String = row.get(1)?;
        let author: String = row.get(2)?;

        // 确保字符串是有效的 UTF-8（虽然 String 本身应该是）
        // 如果数据库存储有问题，这里可以尝试修复
        let title = String::from_utf8_lossy(title.as_bytes()).to_string();
        let author = String::from_utf8_lossy(author.as_bytes()).to_string();
        Ok(Book {
            id: row.get(0)?,
            title,
            author,
            cover_image: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut books = Vec::new();
    for book in book_iter {
        books.push(book.map_err(|e| e.to_string())?);
    }

    Ok(books)
}

#[tauri::command]
fn get_book_details(app: AppHandle, id: i32) -> Result<Vec<ChapterInfo>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 检查书籍解析状态
    let status: String = conn.query_row(
        "SELECT parse_status FROM books WHERE id = ?1",
        [id],
        |row| row.get(0)
    ).map_err(|_| "找不到书籍".to_string())?;

    // 如果书籍还未完成解析，返回空列表或错误
    if status != "completed" {
        // 可以选择返回错误或空列表
        // 这里返回空列表，前端可以显示"正在解析中"的提示
        return Ok(vec![]);
    }

    // 从 IRP 的 chapters 表读取章节信息
    let chapters = irp::get_chapters_by_book(&conn, id)
        .map_err(|e| e.to_string())?;

    // 转换为前端需要的格式
    let chapter_infos: Vec<ChapterInfo> = chapters
        .into_iter()
        .map(|c| ChapterInfo {
            title: c.title,
            id: c.id.to_string(),
        })
        .collect();

    Ok(chapter_infos)
}

// 从 HTML 内容中提取纯文本（去除标签）
fn extract_plain_text(html: &str) -> String {
    let tag_regex = regex::Regex::new(r"<[^>]+>").unwrap();
    let text = tag_regex.replace_all(html, " ");
    // 解码 HTML 实体
    let text = text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    // 清理多余的空白字符
    let whitespace_regex = regex::Regex::new(r"\s+").unwrap();
    whitespace_regex.replace_all(&text, " ").trim().to_string()
}

/// 从章节提取纯文本（用于 AI 和搜索）
///
/// 根据 render_mode 选择不同的提取方式：
/// - html: 从 HTML 中提取纯文本
/// - markdown: 从 Markdown 中提取纯文本
/// - irp: 从 blocks 中提取纯文本
fn extract_chapter_plain_text(app: &AppHandle, chapter_id: i32) -> Result<String, String> {
    let db_path = get_db_path(app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 获取章节信息
    let chapter = irp::get_chapter_by_id(&conn, chapter_id)
        .map_err(|e| e.to_string())?;

    match chapter.render_mode.as_str() {
        "html" => {
            // 从 HTML 提取纯文本
            if let Some(html) = chapter.raw_html {
                Ok(extract_plain_text(&html))
            } else {
                Err("HTML 内容为空".to_string())
            }
        }
        "markdown" => {
            // 从 Markdown 提取纯文本（简单去除 Markdown 语法）
            if let Some(md) = chapter.raw_html {
                // 简单的 Markdown 清理
                let text = md
                    .lines()
                    .map(|line| {
                        // 去除标题标记
                        let line = line.trim_start_matches('#').trim();
                        // 去除代码块标记
                        if line.starts_with("```") {
                            ""
                        } else {
                            line
                        }
                    })
                    .filter(|line| !line.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                Ok(text)
            } else {
                Err("Markdown 内容为空".to_string())
            }
        }
        _ => {
            // 从 IRP blocks 提取纯文本
            let blocks = irp::get_blocks_by_chapter(&conn, chapter_id)
                .map_err(|e| e.to_string())?;
            let text = blocks
                .iter()
                .map(|block| irp::extract_plain_text_from_runs(&block.runs))
                .collect::<Vec<_>>()
                .join(" ");
            Ok(text)
        }
    }
}

// 获取章节的纯文本内容（用于 AI 上下文）
fn get_chapter_plain_text(app: &AppHandle, book_id: i32, chapter_index: usize) -> Result<String, String> {
    let db_path = get_db_path(app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let path: String = conn.query_row("SELECT file_path FROM books WHERE id = ?1", [book_id], |row| row.get(0))
        .map_err(|_| "找不到书籍".to_string())?;

    let mut doc = EpubDoc::new(&path).map_err(|e| e.to_string())?;
    if !doc.set_current_chapter(chapter_index) {
        return Err(format!("无法设置章节 {}", chapter_index));
    }
    
    let (content, _) = doc.get_current_str()
        .ok_or_else(|| "无法获取章节内容".to_string())?;
    
    Ok(extract_plain_text(&content))
}

#[tauri::command]
fn get_chapter_content(app: AppHandle, _book_id: i32, chapter_id: i32) -> Result<ChapterContentResponse, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 获取章节信息
    let chapter = irp::get_chapter_by_id(&conn, chapter_id)
        .map_err(|e| e.to_string())?;

    // 根据 render_mode 决定返回内容
    let content = match chapter.render_mode.as_str() {
        "html" => {
            // 返回原始 HTML（用于 EPUB）
            chapter.raw_html.unwrap_or_default()
        }
        "markdown" => {
            // 返回原始 Markdown（用于 MD）
            chapter.raw_html.unwrap_or_default()
        }
        _ => {
            // 从 blocks 生成 HTML（用于 TXT、PDF）
            let blocks = irp::get_blocks_by_chapter(&conn, chapter_id)
                .map_err(|e| e.to_string())?;
            render_blocks_to_html(&blocks, &app)?
        }
    };

    Ok(ChapterContentResponse {
        content,
        render_mode: chapter.render_mode,
    })
}

/// 将 IRP blocks 渲染为 HTML
fn render_blocks_to_html(blocks: &[irp::Block], _app: &AppHandle) -> Result<String, String> {
    let mut html = String::new();

    for block in blocks {
        match block.block_type.as_str() {
            "paragraph" => {
                html.push_str("<p>");
                html.push_str(&render_runs_to_html(&block.runs));
                html.push_str("</p>");
            }
            "heading" => {
                html.push_str("<h2>");
                html.push_str(&render_runs_to_html(&block.runs));
                html.push_str("</h2>");
            }
            "image" => {
                // 从 runs 中提取图片路径
                if let Some(run) = block.runs.first() {
                    let image_path = &run.text;
                    // 这里可以添加图片路径解析逻辑
                    // 暂时直接使用路径
                    html.push_str(&format!("<img src='{}' alt='image' />", html_escape::encode_text(image_path)));
                }
            }
            "code" => {
                html.push_str("<pre><code>");
                html.push_str(&render_runs_to_html(&block.runs));
                html.push_str("</code></pre>");
            }
            _ => {
                // 未知类型，作为段落处理
                html.push_str("<p>");
                html.push_str(&render_runs_to_html(&block.runs));
                html.push_str("</p>");
            }
        }
    }

    Ok(html)
}

/// 将 TextRun 数组渲染为 HTML
fn render_runs_to_html(runs: &[irp::TextRun]) -> String {
    let mut html = String::new();

    for run in runs {
        let mut text = html_escape::encode_text(&run.text).to_string();

        // 应用样式标记（从内到外）
        for mark in &run.marks {
            match mark.mark_type {
                irp::MarkType::Bold => {
                    text = format!("<strong>{}</strong>", text);
                }
                irp::MarkType::Italic => {
                    text = format!("<em>{}</em>", text);
                }
                irp::MarkType::Link => {
                    if let Some(attrs) = &mark.attributes {
                        if let Some(href) = attrs.get("href") {
                            text = format!("<a href='{}'>{}</a>", html_escape::encode_text(href), text);
                        }
                    }
                }
                irp::MarkType::Code => {
                    text = format!("<code>{}</code>", text);
                }
                irp::MarkType::Underline => {
                    text = format!("<u>{}</u>", text);
                }
                irp::MarkType::Strikethrough => {
                    text = format!("<s>{}</s>", text);
                }
            }
        }

        html.push_str(&text);
    }

    html
}

#[tauri::command]
fn remove_book(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 先清理资产文件
    let asset_manager = asset_manager::AssetManager::new(app.clone());
    asset_manager.cleanup_book_assets(id)?;

    // 再删除数据库记录（外键约束会自动删除相关的 chapters, blocks, asset_mappings 等）
    conn.execute("DELETE FROM books WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 清理孤立的资产文件
///
/// 扫描 assets 目录，删除没有对应书籍的资产文件夹
///
/// # 返回
/// 返回清理的资产文件夹数量
#[tauri::command]
fn cleanup_orphaned_assets(app: AppHandle) -> Result<u32, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    let asset_manager = asset_manager::AssetManager::new(app.clone());
    let cleaned_count = asset_manager.cleanup_orphaned_assets(&conn)?;

    Ok(cleaned_count)
}

// 笔记相关的数据结构
#[derive(Serialize, Debug)]
pub struct Note {
    pub id: i32,
    pub title: String,
    pub content: Option<String>,
    pub category_id: Option<i32>,
    pub category_name: Option<String>,
    pub book_id: Option<i32>,
    pub chapter_index: Option<i32>,
    pub highlighted_text: Option<String>,
    pub annotation_type: Option<String>,
    pub tags: Vec<Tag>,
    pub created_at: String,
    pub updated_at: String,
    pub deleted_at: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct Category {
    pub id: i32,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct Tag {
    pub id: i32,
    pub name: String,
    pub color: Option<String>,
}

#[derive(serde::Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub content: Option<String>,
    pub category_id: Option<i32>,
    pub book_id: Option<i32>,
    pub chapter_index: Option<i32>,
    pub highlighted_text: Option<String>,
    pub annotation_type: Option<String>,
    pub position_start: Option<i32>,
    pub position_end: Option<i32>,
    pub tag_ids: Option<Vec<i32>>,
}

#[derive(serde::Deserialize)]
pub struct UpdateNoteRequest {
    pub id: i32,
    pub title: Option<String>,
    pub content: Option<String>,
    pub category_id: Option<i32>,
    pub tag_ids: Option<Vec<i32>>,
}

#[derive(serde::Deserialize)]
pub struct SearchNotesRequest {
    pub query: String,
    pub category_id: Option<i32>,
    pub tag_id: Option<i32>,
    pub tag_ids: Option<Vec<i32>>, // 多标签筛选
    pub start_date: Option<String>, // 开始日期 (YYYY-MM-DD)
    pub end_date: Option<String>, // 结束日期 (YYYY-MM-DD)
    pub sort_by: Option<String>, // "created_at", "updated_at", "title"
    pub sort_order: Option<String>, // "ASC", "DESC"
    pub limit: Option<i32>, // 分页限制
    pub offset: Option<i32>, // 分页偏移
}

// 创建笔记
#[tauri::command]
fn create_note(app: AppHandle, request: CreateNoteRequest) -> Result<Note, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    // 获取加密密钥
    let key = get_encryption_key(&app)?;
    
    // 加密内容
    let encrypted_content = if let Some(ref content) = request.content {
        if !content.is_empty() {
            Some(encryption::encrypt_content(content, &key)
                .map_err(|e| format!("加密内容失败: {}", e))?)
        } else {
            None
        }
    } else {
        None
    };
    
    let encrypted_highlighted = if let Some(ref highlighted) = request.highlighted_text {
        if !highlighted.is_empty() {
            Some(encryption::encrypt_content(highlighted, &key)
                .map_err(|e| format!("加密高亮文本失败: {}", e))?)
        } else {
            None
        }
    } else {
        None
    };
    
    conn.execute(
        "INSERT INTO notes (title, content, category_id, book_id, chapter_index, highlighted_text, annotation_type, position_start, position_end) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            request.title,
            encrypted_content,
            request.category_id,
            request.book_id,
            request.chapter_index,
            encrypted_highlighted,
            request.annotation_type,
            request.position_start,
            request.position_end
        ],
    ).map_err(|e| format!("创建笔记失败: {}", e))?;
    
    let note_id = conn.last_insert_rowid() as i32;
    
    // 关联标签
    if let Some(tag_ids) = request.tag_ids {
        for tag_id in tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![note_id, tag_id],
            ).map_err(|e| format!("关联标签失败: {}", e))?;
        }
    }
    
    let key = get_encryption_key(&app)?;
    get_note_by_id_with_decrypt(&conn, note_id, &key)
}

// 辅助函数：解密笔记内容
fn decrypt_note_content(note: &mut Note, key: &[u8]) -> Result<(), String> {
    // 解密content
    if let Some(ref encrypted_content) = note.content {
        if !encrypted_content.is_empty() {
            match encryption::decrypt_content(encrypted_content, key) {
                Ok(decrypted) => note.content = Some(decrypted),
                Err(e) => {
                    // 如果解密失败，可能是未加密的内容，保留原值
                    // 或者返回错误，这里我们选择保留原值以支持向后兼容
                    eprintln!("解密内容失败: {}, 可能未加密", e);
                }
            }
        }
    }
    
    // 解密highlighted_text
    if let Some(ref encrypted_highlighted) = note.highlighted_text {
        if !encrypted_highlighted.is_empty() {
            match encryption::decrypt_content(encrypted_highlighted, key) {
                Ok(decrypted) => note.highlighted_text = Some(decrypted),
                Err(e) => {
                    eprintln!("解密高亮文本失败: {}, 可能未加密", e);
                }
            }
        }
    }
    
    Ok(())
}

// 获取单个笔记
fn get_note_by_id(conn: &rusqlite::Connection, id: i32) -> Result<Note, String> {
    let mut note = conn.query_row(
        "SELECT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, n.deleted_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE n.id = ?1",
        rusqlite::params![id],
        |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                category_id: row.get(3)?,
                book_id: row.get(4)?,
                chapter_index: row.get(5)?,
                highlighted_text: row.get(6)?,
                annotation_type: row.get(7)?,
                category_name: row.get(11)?,
                tags: vec![],
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
                deleted_at: row.get(10)?,
            })
        },
    ).map_err(|e| format!("获取笔记失败: {}", e))?;
    
    // 获取标签
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color FROM tags t
         INNER JOIN note_tags nt ON t.id = nt.tag_id
         WHERE nt.note_id = ?1"
    ).map_err(|e| e.to_string())?;
    
    let tags = stmt.query_map(rusqlite::params![id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    note.tags = tags;
    Ok(note)
}

// 获取单个笔记（带解密）
fn get_note_by_id_with_decrypt(conn: &rusqlite::Connection, id: i32, key: &[u8]) -> Result<Note, String> {
    let mut note = get_note_by_id(conn, id)?;
    decrypt_note_content(&mut note, key)?;
    Ok(note)
}

// 获取所有笔记
#[tauri::command]
fn get_notes(app: AppHandle, category_id: Option<i32>, tag_id: Option<i32>) -> Result<Vec<Note>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut query = String::from(
        "SELECT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, n.deleted_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE n.deleted_at IS NULL"
    );
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![];
    
    // 将值提取到 if let 块外部，确保生命周期足够长
    let cid_value;
    if let Some(cid) = category_id {
        cid_value = cid;
        query.push_str(" AND n.category_id = ?");
        params_vec.push(&cid_value as &dyn rusqlite::ToSql);
    }
    
    let tid_value;
    if let Some(tid) = tag_id {
        tid_value = tid;
        query.push_str(" AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)");
        params_vec.push(&tid_value as &dyn rusqlite::ToSql);
    }
    
    query.push_str(" ORDER BY n.created_at DESC");
    
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let note_iter = stmt.query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            category_id: row.get(3)?,
            book_id: row.get(4)?,
            chapter_index: row.get(5)?,
            highlighted_text: row.get(6)?,
            annotation_type: row.get(7)?,
            category_name: row.get(11)?,
            tags: vec![],
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            deleted_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    
    // 获取加密密钥
    let key = get_encryption_key(&app)?;
    
    let mut notes = Vec::new();
    for note_result in note_iter {
        let mut note = note_result.map_err(|e| e.to_string())?;
        
        // 解密笔记内容
        decrypt_note_content(&mut note, &key)?;
        
        // 获取每个笔记的标签
        let mut tag_stmt = conn.prepare(
            "SELECT t.id, t.name, t.color FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             WHERE nt.note_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let tags = tag_stmt.query_map(rusqlite::params![note.id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        
        note.tags = tags;
        notes.push(note);
    }
    
    Ok(notes)
}

// 更新笔记
#[tauri::command]
fn update_note(app: AppHandle, request: UpdateNoteRequest) -> Result<Note, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    // 获取加密密钥
    let key = get_encryption_key(&app)?;
    
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql + Send + Sync>> = vec![];
    
    if let Some(title) = &request.title {
        updates.push("title = ?");
        params.push(Box::new(title.clone()));
    }
    if let Some(content) = &request.content {
        // 加密内容
        let encrypted_content = if !content.is_empty() {
            Some(encryption::encrypt_content(content, &key)
                .map_err(|e| format!("加密内容失败: {}", e))?)
        } else {
            None
        };
        updates.push("content = ?");
        params.push(Box::new(encrypted_content));
    }
    if let Some(category_id) = &request.category_id {
        updates.push("category_id = ?");
        params.push(Box::new(*category_id));
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(Box::new(request.id));
    
    let update_str = updates.join(", ");
    let query = format!("UPDATE notes SET {} WHERE id = ?", update_str);
    
    // 转换为引用数组
    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref() as &dyn rusqlite::ToSql).collect();
    
    conn.execute(&query, rusqlite::params_from_iter(params_refs.iter()))
        .map_err(|e| format!("更新笔记失败: {}", e))?;
    
    // 更新标签关联
    if let Some(tag_ids) = &request.tag_ids {
        // 删除旧标签
        conn.execute("DELETE FROM note_tags WHERE note_id = ?1", rusqlite::params![request.id])
            .map_err(|e| e.to_string())?;
        
        // 添加新标签
        for tag_id in tag_ids {
            conn.execute(
                "INSERT INTO note_tags (note_id, tag_id) VALUES (?1, ?2)",
                rusqlite::params![request.id, tag_id],
            ).map_err(|e| format!("更新标签失败: {}", e))?;
        }
    }
    
    get_note_by_id_with_decrypt(&conn, request.id, &key)
}

// 删除笔记（软删除）
#[tauri::command]
fn delete_note(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?1",
        rusqlite::params![id]
    ).map_err(|e| format!("删除笔记失败: {}", e))?;
    
    Ok(())
}

// 获取回收站中的笔记
#[tauri::command]
fn get_trash_notes(app: AppHandle) -> Result<Vec<Note>, String> {   
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, n.deleted_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE n.deleted_at IS NOT NULL
         ORDER BY n.deleted_at DESC"
    ).map_err(|e| e.to_string())?;
    
    let note_iter = stmt.query_map([], |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            category_id: row.get(3)?,
            book_id: row.get(4)?,
            chapter_index: row.get(5)?,
            highlighted_text: row.get(6)?,
            annotation_type: row.get(7)?,
            category_name: row.get(11)?,
            tags: vec![],
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            deleted_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut notes = Vec::new();
    for note_result in note_iter {
        let mut note = note_result.map_err(|e| e.to_string())?;
        
        // 获取每个笔记的标签
        let mut tag_stmt = conn.prepare(
            "SELECT t.id, t.name, t.color FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             WHERE nt.note_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let tags = tag_stmt.query_map(rusqlite::params![note.id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        
        note.tags = tags;
        notes.push(note);
    }
    
    // 解密所有笔记
    let key = get_encryption_key(&app)?;
    for note in &mut notes {
        decrypt_note_content(note, &key)?;
    }
    
    Ok(notes)
}

// 恢复笔记
#[tauri::command]
fn restore_note(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE notes SET deleted_at = NULL WHERE id = ?1",
        rusqlite::params![id]
    ).map_err(|e| format!("恢复笔记失败: {}", e))?;
    
    Ok(())
}

// 永久删除笔记
#[tauri::command]
fn permanently_delete_note(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("永久删除笔记失败: {}", e))?;
    
    Ok(())
}

// 清理30天前的回收站笔记
#[tauri::command]
fn cleanup_trash(app: AppHandle) -> Result<u32, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let deleted_count = conn.execute(
        "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')",
        []
    ).map_err(|e| format!("清理回收站失败: {}", e))?;
    
    Ok(deleted_count as u32)
}

// 搜索笔记
#[tauri::command]
fn search_notes(app: AppHandle, request: SearchNotesRequest) -> Result<Vec<Note>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let query_pattern = format!("%{}%", request.query);
    
    let mut sql = String::from(
        "SELECT DISTINCT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, n.deleted_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE (n.title LIKE ?1 OR n.content LIKE ?1 OR n.highlighted_text LIKE ?1) AND n.deleted_at IS NULL"
    );
    
    // 将值提取到函数作用域，确保生命周期足够长
    let category_id = request.category_id;
    let tag_id = request.tag_id;
    let tag_ids = request.tag_ids;
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&query_pattern];
    
    // 分类筛选
    let cid_value;
    if let Some(cid) = category_id {
        cid_value = cid;
        sql.push_str(" AND n.category_id = ?");
        params_vec.push(&cid_value as &dyn rusqlite::ToSql);
    }
    
    // 单标签筛选（向后兼容）
    let tid_value;
    if let Some(tid) = tag_id {
        tid_value = tid;
        sql.push_str(" AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)");
        params_vec.push(&tid_value as &dyn rusqlite::ToSql);
    }
    
    // 多标签筛选
    let tid_count_value;
    if let Some(ref tids) = tag_ids {
        if !tids.is_empty() {
            let placeholders: Vec<String> = (0..tids.len()).map(|_| "?".to_string()).collect();
            sql.push_str(&format!(" AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id IN ({}) GROUP BY note_id HAVING COUNT(DISTINCT tag_id) = ?)", placeholders.join(", ")));
            for tid in tids {
                params_vec.push(tid as &dyn rusqlite::ToSql);
            }
            tid_count_value = tids.len() as i32;
            params_vec.push(&tid_count_value as &dyn rusqlite::ToSql);
        }
    }
    
    // 时间范围筛选
    let start_date_ref = request.start_date.as_ref();
    let end_date_ref = request.end_date.as_ref();
    if let Some(start) = start_date_ref {
        sql.push_str(" AND DATE(n.created_at) >= ?");
        params_vec.push(start as &dyn rusqlite::ToSql);
    }
    if let Some(end) = end_date_ref {
        sql.push_str(" AND DATE(n.created_at) <= ?");
        params_vec.push(end as &dyn rusqlite::ToSql);
    }
    
    // 排序
    let sort_by = request.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = request.sort_order.as_deref().unwrap_or("DESC");
    let valid_sort_by = match sort_by {
        "created_at" => "n.created_at",
        "updated_at" => "n.updated_at",
        "title" => "n.title",
        _ => "n.created_at",
    };
    let valid_sort_order = if sort_order == "ASC" { "ASC" } else { "DESC" };
    sql.push_str(&format!(" ORDER BY {} {}", valid_sort_by, valid_sort_order));
    
    // 分页
    if let Some(limit) = request.limit {
        sql.push_str(&format!(" LIMIT {}", limit));
        if let Some(offset) = request.offset {
            sql.push_str(&format!(" OFFSET {}", offset));
        }
    }
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let note_iter = stmt.query_map(rusqlite::params_from_iter(params_vec.iter()), |row| {
        Ok(Note {
            id: row.get(0)?,
            title: row.get(1)?,
            content: row.get(2)?,
            category_id: row.get(3)?,
            book_id: row.get(4)?,
            chapter_index: row.get(5)?,
            highlighted_text: row.get(6)?,
            annotation_type: row.get(7)?,
            category_name: row.get(11)?,
            tags: vec![],
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
            deleted_at: row.get(10)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut notes = Vec::new();
    for note_result in note_iter {
        let mut note = note_result.map_err(|e| e.to_string())?;
        
        let mut tag_stmt = conn.prepare(
            "SELECT t.id, t.name, t.color FROM tags t
             INNER JOIN note_tags nt ON t.id = nt.tag_id
             WHERE nt.note_id = ?1"
        ).map_err(|e| e.to_string())?;
        
        let tags = tag_stmt.query_map(rusqlite::params![note.id], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        }).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        
        note.tags = tags;
        notes.push(note);
    }
    
    // 解密所有笔记
    let key = get_encryption_key(&app)?;
    for note in &mut notes {
        decrypt_note_content(note, &key)?;
    }
    
    Ok(notes)
}

// 获取所有分类
#[tauri::command]
fn get_categories(app: AppHandle) -> Result<Vec<Category>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, color FROM categories ORDER BY id")
        .map_err(|e| e.to_string())?;
    
    let category_iter = stmt.query_map([], |row| {
        Ok(Category {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut categories = Vec::new();
    for category in category_iter {
        categories.push(category.map_err(|e| e.to_string())?);
    }
    
    Ok(categories)
}

// 获取所有标签
#[tauri::command]
fn get_tags(app: AppHandle) -> Result<Vec<Tag>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")
        .map_err(|e| e.to_string())?;
    
    let tag_iter = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            color: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;
    
    let mut tags = Vec::new();
    for tag in tag_iter {
        tags.push(tag.map_err(|e| e.to_string())?);
    }
    
    Ok(tags)
}

// 创建标签
#[tauri::command]
fn create_tag(app: AppHandle, name: String, color: Option<String>) -> Result<Tag, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO tags (name, color) VALUES (?1, ?2)",
        rusqlite::params![name, color],
    ).map_err(|e| format!("创建标签失败: {}", e))?;
    
    let tag_id = conn.last_insert_rowid() as i32;
    
    let tag = conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        rusqlite::params![tag_id],
        |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
            })
        },
    ).map_err(|e| e.to_string())?;
    
    Ok(tag)
}

// 在现有的命令列表中添加
#[tauri::command]
fn get_note(app: AppHandle, id: i32) -> Result<Note, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let key = get_encryption_key(&app)?;
    get_note_by_id_with_decrypt(&conn, id, &key)
}

// 记录笔记操作
#[tauri::command]
fn record_note_action(app: AppHandle, note_id: i32, action_type: String, duration_seconds: Option<i32>) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO note_statistics (note_id, action_type, duration_seconds) VALUES (?1, ?2, ?3)",
        rusqlite::params![note_id, action_type, duration_seconds],
    ).map_err(|e| format!("记录笔记操作失败: {}", e))?;
    
    Ok(())
}

// 统计信息结构
#[derive(Serialize, Debug)]
pub struct NoteStatistics {
    pub total_notes: i32,
    pub today_created: i32,
    pub week_created: i32,
    pub avg_daily_created: f64,
    pub total_duration_seconds: i64,
    pub avg_session_duration_seconds: f64,
}

// 获取笔记统计信息
#[tauri::command]
fn get_note_statistics(app: AppHandle, start_date: Option<String>, end_date: Option<String>) -> Result<NoteStatistics, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut query = String::from(
        "SELECT 
            COUNT(*) as total_notes,
            SUM(CASE WHEN DATE(created_at) = DATE('now') THEN 1 ELSE 0 END) as today_created,
            SUM(CASE WHEN DATE(created_at) >= DATE('now', '-7 days') THEN 1 ELSE 0 END) as week_created
         FROM notes WHERE deleted_at IS NULL"
    );
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![];
    
    if let Some(ref start) = start_date {
        query.push_str(" AND DATE(created_at) >= ?");
        params_vec.push(start as &dyn rusqlite::ToSql);
    }
    if let Some(ref end) = end_date {
        query.push_str(" AND DATE(created_at) <= ?");
        params_vec.push(end as &dyn rusqlite::ToSql);
    }
    
    let stats = conn.query_row(
        &query,
        rusqlite::params_from_iter(params_vec.iter()),
        |row| {
            Ok(NoteStatistics {
                total_notes: row.get(0)?,
                today_created: row.get(1)?,
                week_created: row.get(2)?,
                avg_daily_created: 0.0, // 将在下面计算
                total_duration_seconds: 0, // 将在下面计算
                avg_session_duration_seconds: 0.0, // 将在下面计算
            })
        },
    ).map_err(|e| format!("获取统计信息失败: {}", e))?;
    
    // 计算平均每日创建数
    let days = if let (Some(start), Some(end)) = (&start_date, &end_date) {
        // 使用SQLite计算日期差
        let days_diff: f64 = conn.query_row(
            "SELECT CAST((julianday(?) - julianday(?)) AS REAL)",
            rusqlite::params![end, start],
            |row| row.get(0),
        ).unwrap_or(30.0);
        if days_diff > 0.0 { days_diff } else { 1.0 }
    } else {
        // 默认使用30天
        30.0
    };
    
    let avg_daily = stats.total_notes as f64 / days;
    
    // 获取使用时长统计
    let mut duration_query = String::from(
        "SELECT 
            SUM(duration_seconds) as total_duration,
            AVG(duration_seconds) as avg_duration
         FROM note_statistics WHERE 1=1"
    );
    
    let mut duration_params: Vec<&dyn rusqlite::ToSql> = vec![];
    if let Some(start) = &start_date {
        duration_query.push_str(" AND DATE(action_time) >= ?");
        duration_params.push(start as &dyn rusqlite::ToSql);
    }
    if let Some(end) = &end_date {
        duration_query.push_str(" AND DATE(action_time) <= ?");
        duration_params.push(end as &dyn rusqlite::ToSql);
    }
    
    let (total_duration, avg_duration) = conn.query_row(
        &duration_query,
        rusqlite::params_from_iter(duration_params.iter()),
        |row| {
            Ok((
                row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                row.get::<_, Option<f64>>(1)?.unwrap_or(0.0),
            ))
        },
    ).unwrap_or((0, 0.0));
    
    Ok(NoteStatistics {
        total_notes: stats.total_notes,
        today_created: stats.today_created,
        week_created: stats.week_created,
        avg_daily_created: avg_daily,
        total_duration_seconds: total_duration,
        avg_session_duration_seconds: avg_duration,
    })
}

// 分类统计
#[derive(Serialize, Debug)]
pub struct CategoryStatistics {
    pub category_id: Option<i32>,
    pub category_name: Option<String>,
    pub note_count: i32,
}

// 获取分类统计
#[tauri::command]
fn get_category_statistics(app: AppHandle) -> Result<Vec<CategoryStatistics>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, COUNT(n.id) as note_count
         FROM categories c
         LEFT JOIN notes n ON c.id = n.category_id AND n.deleted_at IS NULL
         GROUP BY c.id, c.name
         ORDER BY note_count DESC"
    ).map_err(|e| e.to_string())?;
    
    let stats = stmt.query_map([], |row| {
        Ok(CategoryStatistics {
            category_id: row.get(0)?,
            category_name: row.get(1)?,
            note_count: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    Ok(stats)
}

// 标签统计
#[derive(Serialize, Debug)]
pub struct TagStatistics {
    pub tag_id: i32,
    pub tag_name: String,
    pub note_count: i32,
}

// 获取标签统计
#[tauri::command]
fn get_tag_statistics(app: AppHandle) -> Result<Vec<TagStatistics>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, COUNT(DISTINCT nt.note_id) as note_count
         FROM tags t
         LEFT JOIN note_tags nt ON t.id = nt.tag_id
         LEFT JOIN notes n ON nt.note_id = n.id AND n.deleted_at IS NULL
         GROUP BY t.id, t.name
         ORDER BY note_count DESC"
    ).map_err(|e| e.to_string())?;
    
    let stats = stmt.query_map([], |row| {
        Ok(TagStatistics {
            tag_id: row.get(0)?,
            tag_name: row.get(1)?,
            note_count: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    
    Ok(stats)
}

// 启动自动清理任务
fn start_cleanup_task(app: AppHandle) {
    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(86400)); // 24小时
            interval.tick().await; // 跳过第一次立即执行
            
            loop {
                interval.tick().await;
                let db_path = get_db_path(&app);
                if let Ok(conn) = db::init_db(&db_path) {
                    let _ = conn.execute(
                        "DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-30 days')",
                        []
                    );
                    println!("自动清理回收站完成");
                }
            }
        });
    });
}

// 获取书籍的 Debug 数据
#[tauri::command]
fn get_debug_data(app: AppHandle, book_id: i32) -> Result<Vec<reading_unit::DebugSegmentScore>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT segment_id, scores, weights, total_score, decision, decision_reason,
                fallback, fallback_reason, content_type, level
         FROM debug_segment_scores
         WHERE book_id = ?1
         ORDER BY segment_id"
    ).map_err(|e| e.to_string())?;

    let debug_data = stmt.query_map([book_id], |row| {
        let scores_json: String = row.get(1)?;
        let weights_json: String = row.get(2)?;
        let decision_str: String = row.get(4)?;
        let content_type_str: Option<String> = row.get(8)?;

        let scores: HashMap<String, f64> = serde_json::from_str(&scores_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let weights: HashMap<String, f64> = serde_json::from_str(&weights_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let decision = match decision_str.as_str() {
            "merge" => reading_unit::MergeDecision::Merge,
            "createnew" => reading_unit::MergeDecision::CreateNew,
            _ => reading_unit::MergeDecision::Merge,
        };

        let content_type = content_type_str.and_then(|s| match s.as_str() {
            "frontmatter" => Some(reading_unit::ContentType::Frontmatter),
            "body" => Some(reading_unit::ContentType::Body),
            "backmatter" => Some(reading_unit::ContentType::Backmatter),
            _ => None,
        });

        Ok(reading_unit::DebugSegmentScore {
            segment_id: row.get(0)?,
            scores,
            weights,
            total_score: row.get(3)?,
            decision,
            decision_reason: row.get(5)?,
            fallback: row.get::<_, i32>(6)? == 1,
            fallback_reason: row.get(7)?,
            content_type,
            level: row.get(9)?,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(debug_data)
}

// 获取书籍的 Reading Units
#[tauri::command]
fn get_reading_units(app: AppHandle, book_id: i32) -> Result<Vec<reading_unit::ReadingUnit>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, book_id, title, level, parent_id, segment_ids,
                start_block_id, end_block_id, source, content_type
         FROM reading_units
         WHERE book_id = ?1
         ORDER BY start_block_id"
    ).map_err(|e| e.to_string())?;

    let reading_units = stmt.query_map([book_id], |row| {
        let segment_ids_json: String = row.get(5)?;
        let content_type_str: Option<String> = row.get(9)?;

        let segment_ids: Vec<String> = serde_json::from_str(&segment_ids_json)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

        let content_type = content_type_str.and_then(|s| match s.as_str() {
            "frontmatter" => Some(reading_unit::ContentType::Frontmatter),
            "body" => Some(reading_unit::ContentType::Body),
            "backmatter" => Some(reading_unit::ContentType::Backmatter),
            _ => None,
        });

        Ok(reading_unit::ReadingUnit {
            id: row.get(0)?,
            book_id: row.get(1)?,
            title: row.get(2)?,
            level: row.get(3)?,
            parent_id: row.get(4)?,
            segment_ids,
            start_block_id: row.get(6)?,
            end_block_id: row.get(7)?,
            source: row.get(8)?,
            content_type,
            summary: None,
        })
    }).map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    Ok(reading_units)
}

// 核心入口配置
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 注册 v2 插件
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 注册导入队列（最多 3 个并发任务）
            app.manage(import_queue::ImportQueue::new(3));

            // 启动自动清理任务
            start_cleanup_task(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            upload_epub_file,
            import_book,
            get_books,
            get_book_details,
            get_chapter_content,
            remove_book,
            cleanup_orphaned_assets,
            create_note,
            get_notes,
            update_note,
            delete_note,
            get_trash_notes,
            restore_note,
            permanently_delete_note,
            cleanup_trash,
            search_notes,
            get_categories,
            get_tags,
            create_tag,
            get_note,
            record_note_action,
            get_note_statistics,
            get_category_statistics,
            get_tag_statistics,
            summarize_note,
            generate_questions,
            expand_note,
            get_ai_suggestion,
            get_ai_configs,
            update_ai_config,
            call_ai_assistant,
            explain_text,
            chat_with_ai,
            get_debug_data,
            get_reading_units,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}