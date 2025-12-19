use tauri::{AppHandle, Manager, Emitter}; // v2: use Emitter trait
use tauri_plugin_dialog::DialogExt; // v2 插件扩展
use std::fs;
use std::path::PathBuf;
use epub::doc::EpubDoc;
use base64::{Engine as _, engine::general_purpose};
use reqwest::blocking::Client;
use serde::{Serialize};
use tauri::Builder;
use regex::Regex;

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
    for i in 0..doc.get_num_pages() {
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
            remove_book
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}