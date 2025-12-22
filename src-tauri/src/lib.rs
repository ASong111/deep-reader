use tauri::{AppHandle, Manager, Emitter}; // v2: use Emitter trait
use tauri_plugin_dialog::DialogExt; // v2 插件扩展
use std::fs;
use std::path::PathBuf;
use epub::doc::EpubDoc;
use base64::{Engine as _, engine::general_purpose};
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

#[derive(Serialize, Deserialize, Debug)]
struct GoogleRequest {
    contents: Vec<GoogleContent>,
    generation_config: GoogleGenerationConfig,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleContent {
    parts: Vec<GooglePart>,
}

#[derive(Serialize, Deserialize, Debug)]
struct GooglePart {
    text: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct GoogleGenerationConfig {
    temperature: f64,
    max_output_tokens: i32,
}

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

// 调用 AI API
#[tauri::command]
fn call_ai_assistant(app: AppHandle, request: AIRequest) -> Result<String, String> {
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
    
    let client = reqwest::blocking::Client::new();
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
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let openai_resp: OpenAIResponse = response.json()
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
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let anthropic_resp: AnthropicResponse = response.json()
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
                .map_err(|e| format!("请求失败: {}", e))?;
            
            if !response.status().is_success() {
                let error_text = response.text().unwrap_or_default();
                return Err(format!("API 错误: {}", error_text));
            }
            
            let google_resp: GoogleResponse = response.json()
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

mod db;

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

// 辅助函数：获取数据库路径
fn get_db_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().expect("failed to get app data dir").join("library.db")
}

// 1. 上传文件管道：打开对话框 -> 读取 -> 上传云端 -> 存入本地 DB
#[tauri::command]
async fn upload_epub_file(app: AppHandle) -> Result<String, String> {
    // 1. 使用 Tauri v2 Dialog 插件打开文件选择器
    let file_path = app.dialog().file().add_filter("EPUB", &["epub"]).blocking_pick_file();

    let path = match file_path {
        Some(p) => p.into_path().map_err(|e| e.to_string())?,
        None => return Err("用户取消操作".to_string()),
    };

    // 4. 解析 EPUB 元数据
    let mut doc = EpubDoc::new(&path).map_err(|e| format!("Epub 解析错误: {}", e))?;
    let title = doc.mdata("title")
        .map(|item| item.value.clone())
        .unwrap_or("Unknown Title".to_string());
    let author = doc.mdata("creator")
        .map(|item| item.value.clone())
        .unwrap_or("Unknown Author".to_string());
    
    // 处理封面
    let cover_base64 = doc.get_cover().map(|(data, _)| {
        format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&data))
    });

    // 5. 存入 SQLite
    // 确保目录存在
    let db_path = get_db_path(&app);
    if let Some(parent) = db_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let path_str = path.to_string_lossy().to_string();
    
    conn.execute(
        "INSERT INTO books (title, author, file_path, cover_image) VALUES (?1, ?2, ?3, ?4)",
        (&title, &author, &path_str, &cover_base64),
    ).map_err(|e| format!("数据库错误: {}", e))?;

    // 发送事件通知前端刷新 (v2 使用 .emit)
    app.emit("book-added", &title).map_err(|e| e.to_string())?;

    Ok("导入成功".to_string())
}

#[tauri::command]
fn get_books(app: AppHandle) -> Result<Vec<Book>, String> {
    println!("get_books--------------------------------------------");
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT id, title, author, cover_image FROM books ORDER BY id DESC")
        .map_err(|e| e.to_string())?;

    // println!("stmt: {:?}", &stmt);
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
    };
    for book in &books {
        println!("book: {:?} {:?} {:?}", &book.id, &book.title, &book.author);
    }
    // 显式序列化为 JSON 查看
    if let Ok(json_str) = serde_json::to_string(&books) {
        println!("Serialized JSON (first 500 chars): {}", 
            &json_str.chars().take(500).collect::<String>());
    }
    Ok(books)
}

#[tauri::command]
fn get_book_details(app: AppHandle, id: i32) -> Result<Vec<ChapterInfo>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let path: String = conn.query_row("SELECT file_path FROM books WHERE id = ?1", [id], |row| row.get(0))
        .map_err(|_| "找不到书籍".to_string())?;

    let mut doc = EpubDoc::new(&path).map_err(|e| e.to_string())?;
    
    let mut chapters = Vec::new();
    // 简单获取章节列表
    for i in 0..doc.get_num_chapters() {
        chapters.push(ChapterInfo {
            title: format!("章节 {}", i + 1), 
            id: i.to_string(), 
        });
    }
    Ok(chapters)
}

#[tauri::command]
fn get_chapter_content(app: AppHandle, book_id: i32, chapter_index: usize) -> Result<String, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    let path: String = conn.query_row("SELECT file_path FROM books WHERE id = ?1", [book_id], |row| row.get(0))
        .map_err(|_| "找不到书籍".to_string())?;

    let mut doc = EpubDoc::new(&path).map_err(|e| e.to_string())?;
    // 检查 set_current_chapter 是否成功
    if !doc.set_current_chapter(chapter_index) {
        return Err(format!("无法设置章节 {}", chapter_index));
    }
    
    let (mut content, _) = doc.get_current_str()
        .ok_or_else(|| "无法获取章节内容".to_string())?;
    
    // 处理图片资源：将 EPUB 内部图片转换为 base64
    let img_regex = regex::Regex::new(r#"<img[^>]*src="([^"]+)"[^>]*>"#).unwrap();
    for cap in img_regex.captures_iter(&content.clone()) {
        if let Some(src) = cap.get(1) {
            let src_str = src.as_str();
            // 尝试从 EPUB 中获取资源
            if let Some(data) = doc.get_resource_by_path(src_str) {
                // 根据扩展名推断 MIME 类型
                let mime = match src_str.rsplit('.').next().unwrap_or("").to_lowercase().as_str() {
                    "png" => "image/png",
                    "jpg" | "jpeg" => "image/jpeg",
                    "gif" => "image/gif",
                    "webp" => "image/webp",
                    "svg" => "image/svg+xml",
                    _ => "application/octet-stream",
                };
                let base64_data = general_purpose::STANDARD.encode(&data);
                let data_uri = format!("data:{};base64,{}", mime, base64_data);
                content = content.replace(src_str, &data_uri);
            }
        }
    }
    
    Ok(content)
}

#[tauri::command]
fn remove_book(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM books WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
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
}

// 创建笔记
#[tauri::command]
fn create_note(app: AppHandle, request: CreateNoteRequest) -> Result<Note, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO notes (title, content, category_id, book_id, chapter_index, highlighted_text, annotation_type, position_start, position_end) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            request.title,
            request.content,
            request.category_id,
            request.book_id,
            request.chapter_index,
            request.highlighted_text,
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
    
    get_note_by_id(&conn, note_id)
}

// 获取单个笔记
fn get_note_by_id(conn: &rusqlite::Connection, id: i32) -> Result<Note, String> {
    let mut note = conn.query_row(
        "SELECT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, c.name as category_name
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
                category_name: row.get(10)?,
                tags: vec![],
                created_at: row.get(8)?,
                updated_at: row.get(9)?,
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

// 获取所有笔记
#[tauri::command]
fn get_notes(app: AppHandle, category_id: Option<i32>, tag_id: Option<i32>) -> Result<Vec<Note>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut query = String::from(
        "SELECT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE 1=1"
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
            category_name: row.get(10)?,
            tags: vec![],
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
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
    
    Ok(notes)
}

// 更新笔记
#[tauri::command]
fn update_note(app: AppHandle, request: UpdateNoteRequest) -> Result<Note, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let mut updates = Vec::new();
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![];
    
    if let Some(title) = &request.title {
        updates.push("title = ?");
        params_vec.push(title);
    }
    if let Some(content) = &request.content {
        updates.push("content = ?");
        params_vec.push(content);
    }
    if let Some(category_id) = &request.category_id {
        updates.push("category_id = ?");
        params_vec.push(category_id);
    }
    
    updates.push("updated_at = CURRENT_TIMESTAMP");
    params_vec.push(&request.id);
    
    let update_str = updates.join(", ");
    let query = format!("UPDATE notes SET {} WHERE id = ?", update_str);
    
    conn.execute(&query, rusqlite::params_from_iter(params_vec.iter()))
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
    
    get_note_by_id(&conn, request.id)
}

// 删除笔记
#[tauri::command]
fn delete_note(app: AppHandle, id: i32) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| format!("删除笔记失败: {}", e))?;
    
    Ok(())
}

// 搜索笔记
#[tauri::command]
fn search_notes(app: AppHandle, request: SearchNotesRequest) -> Result<Vec<Note>, String> {
    let db_path = get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;
    
    let query_pattern = format!("%{}%", request.query);
    
    let mut sql = String::from(
        "SELECT DISTINCT n.id, n.title, n.content, n.category_id, n.book_id, n.chapter_index, 
                n.highlighted_text, n.annotation_type, n.created_at, n.updated_at, c.name as category_name
         FROM notes n
         LEFT JOIN categories c ON n.category_id = c.id
         WHERE (n.title LIKE ?1 OR n.content LIKE ?1 OR n.highlighted_text LIKE ?1)"
    );
    
    // 将值提取到函数作用域，确保生命周期足够长
    let category_id = request.category_id;
    let tag_id = request.tag_id;
    
    let mut params_vec: Vec<&dyn rusqlite::ToSql> = vec![&query_pattern];
    
    // 将值提取到 if let 块外部，确保生命周期足够长
    let cid_value;
    if let Some(cid) = category_id {
        cid_value = cid;
        sql.push_str(" AND n.category_id = ?");
        params_vec.push(&cid_value as &dyn rusqlite::ToSql);
    }
    
    let tid_value;
    if let Some(tid) = tag_id {
        tid_value = tid;
        sql.push_str(" AND n.id IN (SELECT note_id FROM note_tags WHERE tag_id = ?)");
        params_vec.push(&tid_value as &dyn rusqlite::ToSql);
    }
    
    sql.push_str(" ORDER BY n.created_at DESC");
    
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
            category_name: row.get(10)?,
            tags: vec![],
            created_at: row.get(8)?,
            updated_at: row.get(9)?,
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
    get_note_by_id(&conn, id)
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
        .invoke_handler(tauri::generate_handler![
            upload_epub_file,
            get_books,
            get_book_details,
            get_chapter_content,
            remove_book,
            create_note,
            get_notes,
            update_note,
            delete_note,
            search_notes,
            get_categories,
            get_tags,
            create_tag,
            get_note,
            get_ai_configs,
            update_ai_config,
            call_ai_assistant,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}