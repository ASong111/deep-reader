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

    // 添加新字段到 books 表（用于多格式导入）
    let _ = conn.execute("ALTER TABLE books ADD COLUMN parse_status TEXT DEFAULT 'pending'", []);
    let _ = conn.execute("ALTER TABLE books ADD COLUMN parse_quality TEXT DEFAULT 'native'", []);
    let _ = conn.execute("ALTER TABLE books ADD COLUMN total_blocks INTEGER DEFAULT 0", []);

    // 章节表（IRP 架构）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            chapter_index INTEGER NOT NULL,
            confidence_level TEXT DEFAULT 'explicit',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 添加新字段到 chapters 表（用于混合渲染模式）
    let _ = conn.execute("ALTER TABLE chapters ADD COLUMN raw_html TEXT", []);
    let _ = conn.execute("ALTER TABLE chapters ADD COLUMN render_mode TEXT DEFAULT 'irp'", []);
    let _ = conn.execute("ALTER TABLE chapters ADD COLUMN heading_level INTEGER DEFAULT 1", []);

    // 内容块表（IRP 架构）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_id INTEGER NOT NULL,
            block_index INTEGER NOT NULL,
            block_type TEXT NOT NULL,
            runs_json TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 资产映射表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            original_path TEXT NOT NULL,
            local_path TEXT NOT NULL,
            asset_type TEXT DEFAULT 'image',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 阅读进度表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter_index INTEGER NOT NULL,
            scroll_offset INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            UNIQUE(book_id)
        )",
        [],
    )?;

    // 创建 IRP 相关索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chapters_index ON chapters(book_id, chapter_index)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_blocks_chapter_id ON blocks(chapter_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_blocks_index ON blocks(chapter_id, block_index)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_mappings_book_id ON asset_mappings(book_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id ON reading_progress(book_id)",
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
    
    // 尝试添加 deleted_at 字段（如果表已存在但没有该字段）
    let _ = conn.execute("ALTER TABLE notes ADD COLUMN deleted_at DATETIME", []);
    
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
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at)",
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
    
    // 笔记统计表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS note_statistics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL,
            action_type TEXT NOT NULL,
            action_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            duration_seconds INTEGER,
            FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
        )",
        [],
    )?;
    
    // 创建统计表索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_statistics_note_id ON note_statistics(note_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_statistics_action_time ON note_statistics(action_time)",
        [],
    )?;
    
    // 创建统计视图
    conn.execute(
        "CREATE VIEW IF NOT EXISTS note_analytics AS
         SELECT
             DATE(action_time) as date,
             action_type,
             COUNT(*) as action_count,
             AVG(duration_seconds) as avg_duration
         FROM note_statistics
         GROUP BY DATE(action_time), action_type",
        [],
    )?;

    // Reading Unit 表（章节合并评分系统）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reading_units (
            id TEXT PRIMARY KEY,
            book_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            level INTEGER NOT NULL CHECK(level IN (1, 2)),
            parent_id TEXT,
            segment_ids TEXT NOT NULL,
            start_block_id INTEGER NOT NULL,
            end_block_id INTEGER NOT NULL,
            source TEXT NOT NULL CHECK(source IN ('toc', 'heuristic')),
            content_type TEXT CHECK(content_type IN ('frontmatter', 'body', 'backmatter')),
            summary_text TEXT,
            summary_generated_at INTEGER,
            summary_model TEXT,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_id) REFERENCES reading_units(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // Debug 评分数据表（开发环境）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS debug_segment_scores (
            segment_id TEXT PRIMARY KEY,
            book_id INTEGER NOT NULL,
            scores TEXT NOT NULL,
            weights TEXT NOT NULL,
            total_score REAL NOT NULL,
            decision TEXT NOT NULL CHECK(decision IN ('merge', 'new')),
            decision_reason TEXT NOT NULL,
            fallback INTEGER NOT NULL DEFAULT 0 CHECK(fallback IN (0, 1)),
            fallback_reason TEXT,
            content_type TEXT CHECK(content_type IN ('frontmatter', 'body', 'backmatter')),
            level INTEGER CHECK(level IN (1, 2)),
            created_at INTEGER NOT NULL,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
        )",
        [],
    )?;

    // 添加 chapter_rule_version 字段到 books 表
    let _ = conn.execute("ALTER TABLE books ADD COLUMN chapter_rule_version TEXT DEFAULT 'v1.0'", []);

    // 创建 Reading Unit 相关索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_units_book_id ON reading_units(book_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_units_level ON reading_units(book_id, level)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_units_parent_id ON reading_units(parent_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_debug_scores_book_id ON debug_segment_scores(book_id)",
        [],
    )?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_db() -> (TempDir, std::path::PathBuf) {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        (temp_dir, db_path)
    }

    #[test]
    fn test_init_db() {
        let (_temp_dir, db_path) = create_test_db();
        let conn = init_db(&db_path).unwrap();
        
        // 检查表是否存在
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='notes'").unwrap();
        let table_exists: bool = stmt.query_row([], |row| {
            Ok(row.get::<_, Option<String>>(0)?.is_some())
        }).unwrap();
        
        assert!(table_exists);
    }

    #[test]
    fn test_deleted_at_field() {
        let (_temp_dir, db_path) = create_test_db();
        let conn = init_db(&db_path).unwrap();
        
        // 检查deleted_at字段是否存在
        let mut stmt = conn.prepare("PRAGMA table_info(notes)").unwrap();
        let has_deleted_at = stmt.query_map([], |row| {
            let name: String = row.get(1)?;
            Ok(name == "deleted_at")
        }).unwrap().any(|x| x.unwrap());
        
        assert!(has_deleted_at);
    }

    #[test]
    fn test_note_statistics_table() {
        let (_temp_dir, db_path) = create_test_db();
        let conn = init_db(&db_path).unwrap();
        
        // 检查note_statistics表是否存在
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='note_statistics'").unwrap();
        let table_exists: bool = stmt.query_row([], |row| {
            Ok(row.get::<_, Option<String>>(0)?.is_some())
        }).unwrap();
        
        assert!(table_exists);
    }
}