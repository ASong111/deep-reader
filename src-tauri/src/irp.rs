use rusqlite::{Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// IRP (Intermediate Reading Representation) 数据模型
/// 用于统一存储不同格式的文档内容

/// 文本样式标记类型
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum MarkType {
    Bold,           // 加粗
    Italic,         // 斜体
    Link,           // 链接
    Code,           // 代码
    Underline,      // 下划线
    Strikethrough,  // 删除线
}

/// 文本样式标记
/// 表示文本的样式标记（加粗、斜体、链接等）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TextMark {
    pub mark_type: MarkType,
    pub start: usize,
    pub end: usize,
    pub attributes: Option<HashMap<String, String>>, // 额外属性，如链接的 href
}

/// 文本运行单元
/// 表示一段连续的文本及其样式标记
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TextRun {
    pub text: String,
    pub marks: Vec<TextMark>,
}

/// 章节信息
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Chapter {
    pub id: i32,
    pub book_id: i32,
    pub title: String,
    pub chapter_index: i32,
    pub confidence_level: String, // "explicit", "inferred", "linear"
    pub raw_html: Option<String>, // 原始 HTML（用于 EPUB 等格式）
    pub render_mode: String,       // "html" 或 "irp"
    pub heading_level: Option<i32>, // 标题层级（1-6），用于 Markdown 等格式
}

/// 内容块
/// 表示文档的基本单元（段落、标题、图片等）
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Block {
    pub id: i32,
    pub chapter_id: i32,
    pub block_index: i32,
    pub block_type: String, // "paragraph", "heading", "image", "code"
    pub runs: Vec<TextRun>,
}

// ==================== Chapter CRUD 操作 ====================

/// 创建章节
pub fn create_chapter(
    conn: &Connection,
    book_id: i32,
    title: &str,
    index: i32,
    confidence: &str,
) -> Result<i64> {
    create_chapter_with_html(conn, book_id, title, index, confidence, None, "irp")
}

/// 创建章节（支持原始 HTML）
pub fn create_chapter_with_html(
    conn: &Connection,
    book_id: i32,
    title: &str,
    index: i32,
    confidence: &str,
    raw_html: Option<&str>,
    render_mode: &str,
) -> Result<i64> {
    create_chapter_with_html_and_level(conn, book_id, title, index, confidence, raw_html, render_mode, None)
}

/// 创建章节（支持原始 HTML 和标题层级）
pub fn create_chapter_with_html_and_level(
    conn: &Connection,
    book_id: i32,
    title: &str,
    index: i32,
    confidence: &str,
    raw_html: Option<&str>,
    render_mode: &str,
    heading_level: Option<u32>,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO chapters (book_id, title, chapter_index, confidence_level, raw_html, render_mode, heading_level)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![book_id, title, index, confidence, raw_html, render_mode, heading_level.map(|l| l as i32)],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 获取书籍的所有章节
pub fn get_chapters_by_book(conn: &Connection, book_id: i32) -> Result<Vec<Chapter>> {
    let mut stmt = conn.prepare(
        "SELECT id, book_id, title, chapter_index, confidence_level, raw_html, render_mode, heading_level
         FROM chapters WHERE book_id = ?1 ORDER BY chapter_index",
    )?;

    let chapters = stmt
        .query_map([book_id], |row| {
            Ok(Chapter {
                id: row.get(0)?,
                book_id: row.get(1)?,
                title: row.get(2)?,
                chapter_index: row.get(3)?,
                confidence_level: row.get(4)?,
                raw_html: row.get(5)?,
                render_mode: row.get(6).unwrap_or_else(|_| "irp".to_string()),
                heading_level: row.get(7).ok(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(chapters)
}

/// 获取单个章节
pub fn get_chapter_by_id(conn: &Connection, chapter_id: i32) -> Result<Chapter> {
    conn.query_row(
        "SELECT id, book_id, title, chapter_index, confidence_level, raw_html, render_mode, heading_level
         FROM chapters WHERE id = ?1",
        [chapter_id],
        |row| {
            Ok(Chapter {
                id: row.get(0)?,
                book_id: row.get(1)?,
                title: row.get(2)?,
                chapter_index: row.get(3)?,
                confidence_level: row.get(4)?,
                raw_html: row.get(5)?,
                render_mode: row.get(6).unwrap_or_else(|_| "irp".to_string()),
                heading_level: row.get(7).ok(),
            })
        },
    )
}

// ==================== Block CRUD 操作 ====================

/// 创建内容块
pub fn create_block(
    conn: &Connection,
    chapter_id: i32,
    block_index: i32,
    block_type: &str,
    runs: &[TextRun],
) -> Result<i64> {
    let runs_json = serde_json::to_string(runs)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    conn.execute(
        "INSERT INTO blocks (chapter_id, block_index, block_type, runs_json)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![chapter_id, block_index, block_type, runs_json],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 获取章节的所有内容块
pub fn get_blocks_by_chapter(conn: &Connection, chapter_id: i32) -> Result<Vec<Block>> {
    let mut stmt = conn.prepare(
        "SELECT id, chapter_id, block_index, block_type, runs_json
         FROM blocks WHERE chapter_id = ?1 ORDER BY block_index",
    )?;

    let blocks = stmt
        .query_map([chapter_id], |row| {
            let runs_json: String = row.get(4)?;
            let runs: Vec<TextRun> = serde_json::from_str(&runs_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;

            Ok(Block {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                block_index: row.get(2)?,
                block_type: row.get(3)?,
                runs,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(blocks)
}

/// 获取单个内容块
pub fn get_block_by_id(conn: &Connection, block_id: i32) -> Result<Block> {
    conn.query_row(
        "SELECT id, chapter_id, block_index, block_type, runs_json
         FROM blocks WHERE id = ?1",
        [block_id],
        |row| {
            let runs_json: String = row.get(4)?;
            let runs: Vec<TextRun> = serde_json::from_str(&runs_json).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(e),
                )
            })?;

            Ok(Block {
                id: row.get(0)?,
                chapter_id: row.get(1)?,
                block_index: row.get(2)?,
                block_type: row.get(3)?,
                runs,
            })
        },
    )
}

// ==================== 辅助函数 ====================

/// 从 TextRun 数组中提取纯文本
pub fn extract_plain_text_from_runs(runs: &[TextRun]) -> String {
    runs.iter()
        .map(|r| r.text.as_str())
        .collect::<Vec<_>>()
        .join("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_run_serialization() {
        let runs = vec![TextRun {
            text: "测试文本".to_string(),
            marks: vec![TextMark {
                mark_type: MarkType::Bold,
                start: 0,
                end: 4,
                attributes: None,
            }],
        }];

        let json = serde_json::to_string(&runs).unwrap();
        let deserialized: Vec<TextRun> = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized[0].text, "测试文本");
        assert_eq!(deserialized[0].marks[0].mark_type, MarkType::Bold);
    }

    #[test]
    fn test_extract_plain_text() {
        let runs = vec![
            TextRun {
                text: "Hello ".to_string(),
                marks: vec![],
            },
            TextRun {
                text: "World".to_string(),
                marks: vec![],
            },
        ];

        let text = extract_plain_text_from_runs(&runs);
        assert_eq!(text, "Hello World");
    }
}
