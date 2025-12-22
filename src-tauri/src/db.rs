use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_db<P: AsRef<Path>>(path: P) -> Result<Connection> {
    let conn = Connection::open(path)?;

    conn.execute("PRAGMA encoding = 'UTF-8'", [])?;
    
    // 书籍表（已存在）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            file_path TEXT NOT NULL UNIQUE,
            cover_image TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 分类表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 标签表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            color TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 笔记表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT,
            category_id INTEGER,
            book_id INTEGER,
            chapter_index INTEGER,
            highlighted_text TEXT,
            annotation_type TEXT DEFAULT 'highlight',
            position_start INTEGER,
            position_end INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (category_id) REFERENCES categories(id),
            FOREIGN KEY (book_id) REFERENCES books(id)
        )",
        [],
    )?;
    
    // 尝试添加 annotation_type 字段（如果表已存在但没有该字段）
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN annotation_type TEXT DEFAULT 'highlight'", []);
    
    // 笔记-标签关联表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, tag_id),
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // 创建索引以提高查询性能
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_book_id ON notes(book_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_category_id ON notes(category_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)",
        [],
    )?;
    
    // 插入默认分类
    conn.execute(
        "INSERT OR IGNORE INTO categories (name, color) VALUES 
         ('概念', '#3B82F6'),
         ('观点', '#10B981'),
         ('疑问', '#F59E0B'),
         ('行动', '#EF4444')",
        [],
    )?;

    // AI 配置表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ai_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            platform TEXT NOT NULL UNIQUE,
            api_key TEXT,
            base_url TEXT,
            model TEXT,
            temperature REAL DEFAULT 0.7,
            max_tokens INTEGER DEFAULT 2000,
            is_active INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 插入默认平台配置（不包含 API key）
    conn.execute(
        "INSERT OR IGNORE INTO ai_config (platform, model, is_active) VALUES 
         ('openai', 'gpt-3.5-turbo', 0),
         ('anthropic', 'claude-3-sonnet-20240229', 0),
         ('google', 'gemini-pro', 0),
         ('openai-cn', 'gpt-3.5-turbo', 0)",
        [],
    )?;
    
    Ok(conn)
}