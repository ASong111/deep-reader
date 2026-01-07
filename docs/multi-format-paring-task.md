# DeepReader 多格式导入重构 - 详细实施计划

  ## 项目概述

  本文档基于 `multi-format-paring.md` PRD，提供详细的、分步骤的实施计划。该计划将多格式导入功能分解为可管理的小任务，每个任务都有明确的依赖关系和实施指导。

  ## 任务依赖图例说明

  - **依赖**: `[依赖任务ID]` 表示必须先完成的任务
  - **状态**: ☐ 未开始 | ◐ 进行中 | ☑ 已完成
  - **优先级**: P0 (最高) | P1 (高) | P2 (中) | P3 (低)

  ---

  ## 第一阶段：基础设施搭建 (Foundation)

  ### 模块 1.1：数据库架构重构

  #### ☐ 任务 1.1.1：设计 IRP 数据模型
  **任务ID**: T-1.1.1
  **依赖**: 无
  **优先级**: P0 (最高)

  **实施内容**:
  - [ ] 设计 `chapters` 表结构
    ```sql
    CREATE TABLE chapters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        confidence_level TEXT DEFAULT 'explicit', -- 'explicit', 'inferred', 'linear'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

  - 设计 blocks 表结构
  CREATE TABLE blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      block_index INTEGER NOT NULL,
      block_type TEXT NOT NULL, -- 'paragraph', 'heading', 'image', 'code'
      runs_json TEXT NOT NULL, -- 存储 TextRun 数组的 JSON
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );
  - 设计 TextRun 和 TextMark 数据结构 (Rust struct)
  #[derive(Serialize, Deserialize, Debug, Clone)]
  pub struct TextRun {
      pub text: String,
      pub marks: Vec<TextMark>,
  }

  #[derive(Serialize, Deserialize, Debug, Clone)]
  pub struct TextMark {
      pub mark_type: MarkType,
      pub start: usize,
      pub end: usize,
      pub attributes: Option<HashMap<String, String>>, // 如链接的 href
  }

  #[derive(Serialize, Deserialize, Debug, Clone)]
  pub enum MarkType {
      Bold,
      Italic,
      Link,
      Code,
      Underline,
      Strikethrough,
  }

  验收标准:
  - 数据模型文档完成
  - Rust 结构体定义完成并通过编译
  - 数据库 schema SQL 脚本准备就绪

  预计工作量: 0.5 天

  ---
  ☐ 任务 1.1.2：实现数据库迁移脚本

  任务ID: T-1.1.2
  依赖: [T-1.1.1]
  优先级: P0

  实施内容:
  - 在 src-tauri/src/db.rs 中添加新表创建逻辑
  // 在 init_db 函数中添加
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
  - 添加索引优化查询性能
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
  - 添加 books 表新字段
  // 尝试添加新字段（如果表已存在）
  let _ = conn.execute(
      "ALTER TABLE books ADD COLUMN parse_status TEXT DEFAULT 'pending'",
      []
  );
  let _ = conn.execute(
      "ALTER TABLE books ADD COLUMN parse_quality TEXT DEFAULT 'native'",
      []
  );
  let _ = conn.execute(
      "ALTER TABLE books ADD COLUMN total_blocks INTEGER DEFAULT 0",
      []
  );

  验收标准:
  - 数据库迁移脚本运行成功
  - 旧数据不受影响
  - 新表和索引创建成功
  - 在已有数据库上运行不报错

  预计工作量: 0.5 天

  ---
  ☐ 任务 1.1.3：实现 IRP 数据访问层 (DAO)

  任务ID: T-1.1.3
  依赖: [T-1.1.2]
  优先级: P0

  实施内容:
  - 创建 src-tauri/src/irp.rs 模块
  use rusqlite::{Connection, Result};
  use serde::{Deserialize, Serialize};
  use std::collections::HashMap;

  #[derive(Serialize, Deserialize, Debug, Clone)]
  pub struct Chapter {
      pub id: i32,
      pub book_id: i32,
      pub title: String,
      pub chapter_index: i32,
      pub confidence_level: String,
  }

  #[derive(Serialize, Deserialize, Debug, Clone)]
  pub struct Block {
      pub id: i32,
      pub chapter_id: i32,
      pub block_index: i32,
      pub block_type: String,
      pub runs: Vec<TextRun>,
  }
  - 实现 Chapter CRUD 操作
  pub fn create_chapter(
      conn: &Connection,
      book_id: i32,
      title: &str,
      index: i32,
      confidence: &str
  ) -> Result<i64> {
      conn.execute(
          "INSERT INTO chapters (book_id, title, chapter_index, confidence_level) 
           VALUES (?1, ?2, ?3, ?4)",
          rusqlite::params![book_id, title, index, confidence],
      )?;
      Ok(conn.last_insert_rowid())
  }

  pub fn get_chapters_by_book(conn: &Connection, book_id: i32) -> Result<Vec<Chapter>> {
      let mut stmt = conn.prepare(
          "SELECT id, book_id, title, chapter_index, confidence_level 
           FROM chapters WHERE book_id = ?1 ORDER BY chapter_index"
      )?;

      let chapters = stmt.query_map([book_id], |row| {
          Ok(Chapter {
              id: row.get(0)?,
              book_id: row.get(1)?,
              title: row.get(2)?,
              chapter_index: row.get(3)?,
              confidence_level: row.get(4)?,
          })
      })?
      .collect::<Result<Vec<_>, _>>()?;

      Ok(chapters)
  }
  - 实现 Block CRUD 操作
  pub fn create_block(
      conn: &Connection,
      chapter_id: i32,
      block_index: i32,
      block_type: &str,
      runs: &[TextRun]
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

  pub fn get_blocks_by_chapter(conn: &Connection, chapter_id: i32) -> Result<Vec<Block>> {
      let mut stmt = conn.prepare(
          "SELECT id, chapter_id, block_index, block_type, runs_json 
           FROM blocks WHERE chapter_id = ?1 ORDER BY block_index"
      )?;

      let blocks = stmt.query_map([chapter_id], |row| {
          let runs_json: String = row.get(4)?;
          let runs: Vec<TextRun> = serde_json::from_str(&runs_json)
              .map_err(|e| rusqlite::Error::FromSqlConversionFailure(
                  4, rusqlite::types::Type::Text, Box::new(e)
              ))?;

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
  - 在 src-tauri/src/lib.rs 中添加模块声明
  mod irp;

  验收标准:
  - 所有 DAO 函数通过单元测试
  - JSON 序列化往返测试通过
  - 性能测试：1000 个 Block 的插入和查询 < 100ms

  预计工作量: 1 天

  ---
  模块 1.2：资产管理系统

  ☐ 任务 1.2.1：实现图片提取和存储逻辑

  任务ID: T-1.2.1
  依赖: [T-1.1.2]
  优先级: P1

  实施内容:
  - 创建 src-tauri/src/asset_manager.rs 模块
  use std::fs;
  use std::path::{Path, PathBuf};
  use tauri::AppHandle;
  use sha2::{Sha256, Digest};

  pub struct AssetManager {
      app_handle: AppHandle,
  }

  impl AssetManager {
      pub fn new(app_handle: AppHandle) -> Self {
          Self { app_handle }
      }

      pub fn extract_image(
          &self,
          book_id: i32,
          image_data: &[u8],
          original_path: &str,
      ) -> Result<String, String> {
          // 1. 生成唯一文件名 (SHA256 hash + 扩展名)
          let mut hasher = Sha256::new();
          hasher.update(image_data);
          let hash = format!("{:x}", hasher.finalize());

          let ext = Path::new(original_path)
              .extension()
              .and_then(|s| s.to_str())
              .unwrap_or("png");

          let filename = format!("{}.{}", &hash[..16], ext);

          // 2. 保存到 app_data_dir/assets/{book_id}/
          let app_data_dir = self.app_handle.path().app_data_dir()
              .map_err(|e| e.to_string())?;
          let asset_dir = app_data_dir.join("assets").join(book_id.to_string());
          fs::create_dir_all(&asset_dir).map_err(|e| e.to_string())?;

          let file_path = asset_dir.join(&filename);
          fs::write(&file_path, image_data).map_err(|e| e.to_string())?;

          // 3. 返回相对路径
          let relative_path = format!("assets/{}/{}", book_id, filename);
          Ok(relative_path)
      }

      pub fn get_asset_url(&self, relative_path: &str) -> Result<String, String> {
          // 转换为 Tauri asset protocol URL
          Ok(format!("asset://localhost/{}", relative_path))
      }
  }
  - 添加 asset_mappings 表
  // 在 db.rs 的 init_db 中添加
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

  conn.execute(
      "CREATE INDEX IF NOT EXISTS idx_asset_mappings_book_id ON asset_mappings(book_id)",
      [],
  )?;
  - 实现路径映射存储
  pub fn save_asset_mapping(
      conn: &Connection,
      book_id: i32,
      original_path: &str,
      local_path: &str,
      asset_type: &str,
  ) -> Result<i64> {
      conn.execute(
          "INSERT INTO asset_mappings (book_id, original_path, local_path, asset_type) 
           VALUES (?1, ?2, ?3, ?4)",
          rusqlite::params![book_id, original_path, local_path, asset_type],
      )?;
      Ok(conn.last_insert_rowid())
  }

  pub fn get_local_path(
      conn: &Connection,
      book_id: i32,
      original_path: &str,
  ) -> Result<Option<String>> {
      let result = conn.query_row(
          "SELECT local_path FROM asset_mappings 
           WHERE book_id = ?1 AND original_path = ?2",
          rusqlite::params![book_id, original_path],
          |row| row.get(0),
      );

      match result {
          Ok(path) => Ok(Some(path)),
          Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
          Err(e) => Err(e),
      }
  }

  验收标准:
  - 图片成功提取并保存到本地
  - 路径映射正确存储
  - 支持 PNG, JPEG, GIF, WebP, SVG 格式
  - 相同图片不重复存储（通过 hash 去重）

  预计工作量: 1 天

  ---
  ☐ 任务 1.2.2：实现资产清理机制

  任务ID: T-1.2.2
  依赖: [T-1.2.1]
  优先级: P2

  实施内容:
  - 实现书籍删除时的资产清理
  pub fn cleanup_book_assets(book_id: i32, app_handle: &AppHandle) -> Result<(), String> {
      // 1. 删除 app_data_dir/assets/{book_id}/ 目录
      let app_data_dir = app_handle.path().app_data_dir()
          .map_err(|e| e.to_string())?;
      let asset_dir = app_data_dir.join("assets").join(book_id.to_string());

      if asset_dir.exists() {
          fs::remove_dir_all(&asset_dir).map_err(|e| e.to_string())?;
      }

      // 2. 删除 asset_mappings 表中的记录（通过外键自动删除）
      Ok(())
  }
  - 在 remove_book 命令中集成资产清理
  #[tauri::command]
  fn remove_book(app: AppHandle, id: i32) -> Result<(), String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      // 先清理资产
      asset_manager::cleanup_book_assets(id, &app)?;

      // 再删除数据库记录
      conn.execute("DELETE FROM books WHERE id = ?1", [id])
          .map_err(|e| e.to_string())?;

      Ok(())
  }
  - 添加孤立资产检测和清理功能
  pub fn cleanup_orphaned_assets(app_handle: &AppHandle) -> Result<u32, String> {
      let db_path = get_db_path(app_handle);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      // 获取所有有效的 book_id
      let mut stmt = conn.prepare("SELECT id FROM books").map_err(|e| e.to_string())?;
      let valid_book_ids: Vec<i32> = stmt.query_map([], |row| row.get(0))
          .map_err(|e| e.to_string())?
          .collect::<Result<Vec<_>, _>>()
          .map_err(|e| e.to_string())?;

      // 扫描 assets 目录
      let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
      let assets_dir = app_data_dir.join("assets");

      let mut cleaned_count = 0;

      if assets_dir.exists() {
          for entry in fs::read_dir(&assets_dir).map_err(|e| e.to_string())? {
              let entry = entry.map_err(|e| e.to_string())?;
              if let Ok(book_id) = entry.file_name().to_string_lossy().parse::<i32>() {
                  if !valid_book_ids.contains(&book_id) {
                      fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
                      cleaned_count += 1;
                  }
              }
          }
      }

      Ok(cleaned_count)
  }

  验收标准:
  - 删除书籍时资产文件被正确清理
  - 不影响其他书籍的资产
  - 孤立资产检测准确
  - 清理操作安全（不误删）

  预计工作量: 0.5 天

  ---
  第二阶段：解析引擎开发 (Parser Engine)

  模块 2.1：Parser Router 架构

  ☐ 任务 2.1.1：设计 Parser 接口和路由器

  任务ID: T-2.1.1
  依赖: [T-1.1.3]
  优先级: P0

  实施内容:
  - 创建 src-tauri/src/parser/mod.rs 模块
  use rusqlite::Connection;
  use std::path::Path;
  use std::collections::HashMap;

  pub mod epub_parser;
  pub mod txt_parser;
  pub mod md_parser;
  pub mod pdf_parser;
  pub mod chapter_detector;

  #[derive(Debug, Clone)]
  pub enum ParseQuality {
      Native,      // 原生结构（如 HTML/EPUB）
      Light,       // 文本可提取但结构不稳定（如 PDF）
      Experimental, // 尽力而为（如扫描件识别预留）
  }

  #[derive(Debug, Clone)]
  pub struct ChapterData {
      pub title: String,
      pub blocks: Vec<BlockData>,
      pub confidence: String, // "explicit", "inferred", "linear"
  }

  #[derive(Debug, Clone)]
  pub struct BlockData {
      pub block_type: String,
      pub runs: Vec<crate::irp::TextRun>,
  }

  pub struct ParseResult {
      pub chapters: Vec<ChapterData>,
      pub total_blocks: usize,
      pub quality: ParseQuality,
  }

  pub trait Parser: Send + Sync {
      fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String>;
      fn get_quality(&self) -> ParseQuality;
      fn supported_extensions(&self) -> Vec<&str>;
  }
  - 实现 ParserRouter
  pub struct ParserRouter {
      parsers: HashMap<String, Box<dyn Parser>>,
  }

  impl ParserRouter {
      pub fn new() -> Self {
          let mut parsers: HashMap<String, Box<dyn Parser>> = HashMap::new();

          // 注册各种解析器
          let epub = Box::new(epub_parser::EpubParser::new());
          for ext in epub.supported_extensions() {
              parsers.insert(ext.to_string(), epub.clone());
          }

          let txt = Box::new(txt_parser::TxtParser::new());
          for ext in txt.supported_extensions() {
              parsers.insert(ext.to_string(), txt.clone());
          }

          let md = Box::new(md_parser::MdParser::new());
          for ext in md.supported_extensions() {
              parsers.insert(ext.to_string(), md.clone());
          }

          let pdf = Box::new(pdf_parser::PdfParser::new());
          for ext in pdf.supported_extensions() {
              parsers.insert(ext.to_string(), pdf.clone());
          }

          Self { parsers }
      }

      pub fn route(&self, file_path: &Path) -> Result<&dyn Parser, String> {
          let ext = file_path
              .extension()
              .and_then(|s| s.to_str())
              .ok_or("无法识别文件扩展名")?
              .to_lowercase();

          self.parsers
              .get(&ext)
              .map(|p| p.as_ref())
              .ok_or(format!("不支持的文件格式: {}", ext))
      }
  }

  验收标准:
  - Parser trait 定义清晰
  - ParserRouter 能正确路由到对应解析器
  - 单元测试覆盖率 > 80%
  - 支持动态注册新的解析器

  预计工作量: 0.5 天

  ---
  ☐ 任务 2.1.2：实现 EPUB 解析器

  任务ID: T-2.1.2
  依赖: [T-2.1.1, T-1.2.1]
  优先级: P0

  实施内容:
  - 创建 src-tauri/src/parser/epub_parser.rs
  use super::*;
  use epub::doc::EpubDoc;
  use crate::irp::TextRun;
  use crate::asset_manager::AssetManager;

  #[derive(Clone)]
  pub struct EpubParser;

  impl EpubParser {
      pub fn new() -> Self {
          Self
      }

      fn parse_html_to_blocks(&self, html: &str) -> Result<Vec<BlockData>, String> {
          use scraper::{Html, Selector};

          let document = Html::parse_document(html);
          let mut blocks = Vec::new();

          // 解析段落
          let p_selector = Selector::parse("p").unwrap();
          for element in document.select(&p_selector) {
              let runs = self.extract_runs_from_element(&element)?;
              if !runs.is_empty() {
                  blocks.push(BlockData {
                      block_type: "paragraph".to_string(),
                      runs,
                  });
              }
          }

          // 解析标题
          for level in 1..=6 {
              let h_selector = Selector::parse(&format!("h{}", level)).unwrap();
              for element in document.select(&h_selector) {
                  let runs = self.extract_runs_from_element(&element)?;
                  if !runs.is_empty() {
                      blocks.push(BlockData {
                          block_type: "heading".to_string(),
                          runs,
                      });
                  }
              }
          }

          // 解析图片
          let img_selector = Selector::parse("img").unwrap();
          for element in document.select(&img_selector) {
              if let Some(src) = element.value().attr("src") {
                  blocks.push(BlockData {
                      block_type: "image".to_string(),
                      runs: vec![TextRun {
                          text: src.to_string(),
                          marks: vec![],
                      }],
                  });
              }
          }

          Ok(blocks)
      }

      fn extract_runs_from_element(&self, element: &scraper::ElementRef) -> Result<Vec<TextRun>, String> {
          // 提取文本和样式标记
          let text = element.text().collect::<String>();

          // 简化版：先提取纯文本
          // TODO: 后续实现完整的样式提取
          Ok(vec![TextRun {
              text,
              marks: vec![],
          }])
      }
  }

  impl Parser for EpubParser {
      fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
          let mut doc = EpubDoc::new(file_path)
              .map_err(|e| format!("EPUB 解析错误: {}", e))?;

          let mut chapters = Vec::new();
          let mut total_blocks = 0;

          for i in 0..doc.get_num_chapters() {
              if !doc.set_current_chapter(i) {
                  continue;
              }

              let (html_content, _) = doc.get_current_str()
                  .ok_or("无法获取章节内容")?;

              // 解析 HTML 为 Blocks
              let blocks = self.parse_html_to_blocks(&html_content)?;
              total_blocks += blocks.len();

              // 获取章节标题（如果有）
              let title = doc.get_current_id()
                  .map(|id| id.to_string())
                  .unwrap_or(format!("章节 {}", i + 1));

              chapters.push(ChapterData {
                  title,
                  blocks,
                  confidence: "explicit".to_string(),
              });
          }

          Ok(ParseResult {
              chapters,
              total_blocks,
              quality: ParseQuality::Native,
          })
      }

      fn get_quality(&self) -> ParseQuality {
          ParseQuality::Native
      }

      fn supported_extensions(&self) -> Vec<&str> {
          vec!["epub"]
      }
  }
  - 添加依赖到 Cargo.toml
  scraper = "0.17"
  html5ever = "0.26"
  - 实现图片提取集成
  fn extract_images(&self, mut blocks: Vec<BlockData>, doc: &mut EpubDoc, book_id: i32, app: &AppHandle) -> Result<Vec<BlockData>, String> {
      let asset_manager = AssetManager::new(app.clone());

      for block in &mut blocks {
          if block.block_type == "image" {
              if let Some(run) = block.runs.first_mut() {
                  let original_path = &run.text;

                  // 从 EPUB 中提取图片数据
                  if let Some(image_data) = doc.get_resource_by_path(original_path) {
                      // 保存图片并获取本地路径
                      let local_path = asset_manager.extract_image(book_id, &image_data, original_path)?;

                      // 更新路径为本地路径
                      run.text = local_path;
                  }
              }
          }
      }

      Ok(blocks)
  }

  验收标准:
  - 能正确解析标准 EPUB 文件
  - 章节、段落、图片正确提取
  - 文本样式保留完整（bold, italic, link）
  - 测试用例：至少 3 本不同结构的 EPUB
  - 性能：1MB EPUB 解析 < 2秒

  预计工作量: 2 天

  ---
  ☐ 任务 2.1.3：实现 TXT 解析器
  **任务ID**: T-2.1.3
  **依赖**: [T-2.1.1]
  **优先级**: P1

  **实施内容**:
  - [ ] 创建 `src-tauri/src/parser/txt_parser.rs`
    ```rust
    use super::*;
    use encoding_rs::*;
    use std::fs;

    #[derive(Clone)]
    pub struct TxtParser;

    impl TxtParser {
        pub fn new() -> Self {
            Self
        }

        fn detect_encoding(&self, bytes: &[u8]) -> &'static Encoding {
            // 尝试检测编码
            let (encoding, _, _) = Encoding::for_bom(bytes)
                .unwrap_or((UTF_8, 0));

            // 如果没有 BOM，尝试检测中文编码
            if encoding == UTF_8 {
                // 简单检测：如果包含 GBK 特征字节，使用 GBK
                if self.looks_like_gbk(bytes) {
                    return GBK;
                }
            }

            encoding
        }

        fn looks_like_gbk(&self, bytes: &[u8]) -> bool {
            // 简单的 GBK 检测逻辑
            for i in 0..bytes.len().saturating_sub(1) {
                let b1 = bytes[i];
                let b2 = bytes[i + 1];

                // GBK 第一字节范围：0x81-0xFE
                // GBK 第二字节范围：0x40-0xFE
                if (0x81..=0xFE).contains(&b1) && (0x40..=0xFE).contains(&b2) {
                    return true;
                }
            }
            false
        }
    }

    impl Parser for TxtParser {
        fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
            // 读取文件字节
            let bytes = fs::read(file_path)
                .map_err(|e| format!("读取文件失败: {}", e))?;

            // 检测编码
            let encoding = self.detect_encoding(&bytes);

            // 解码为字符串
            let (content, _, had_errors) = encoding.decode(&bytes);
            if had_errors {
                eprintln!("警告：文件解码时出现错误，可能存在乱码");
            }

            // 按段落分割（双换行符或多个换行符）
            let paragraphs: Vec<&str> = content
                .split("\n\n")
                .map(|p| p.trim())
                .filter(|p| !p.is_empty())
                .collect();

            let mut blocks = Vec::new();
            for paragraph in paragraphs {
                // 将单个换行符替换为空格
                let text = paragraph.replace('\n', " ");

                blocks.push(BlockData {
                    block_type: "paragraph".to_string(),
                    runs: vec![TextRun {
                        text,
                        marks: vec![],
                    }],
                });
            }

            // 单章节模式
            let chapter = ChapterData {
                title: "全文".to_string(),
                blocks,
                confidence: "linear".to_string(),
            };

            Ok(ParseResult {
                chapters: vec![chapter],
                total_blocks: chapter.blocks.len(),
                quality: ParseQuality::Light,
            })
        }

        fn get_quality(&self) -> ParseQuality {
            ParseQuality::Light
        }

        fn supported_extensions(&self) -> Vec<&str> {
            vec!["txt"]
        }
    }
```
  - 添加依赖到 Cargo.toml
  encoding_rs = "0.8"

  验收标准:
  - 正确解析 UTF-8 和 GBK 编码的 TXT 文件
  - 段落分割准确
  - 测试用例：至少 5 个不同编码和格式的 TXT 文件
  - 性能：1MB TXT 文件解析 < 500ms

  预计工作量: 1 天

  ---
  ☐ 任务 2.1.4：实现 Markdown 解析器

  任务ID: T-2.1.4
  依赖: [T-2.1.1]
  优先级: P1

  实施内容:
  - 创建 src-tauri/src/parser/md_parser.rs
  use super::*;
  use pulldown_cmark::{Parser as MdParser, Event, Tag, TagEnd};
  use std::fs;

  #[derive(Clone)]
  pub struct MarkdownParser;

  impl MarkdownParser {
      pub fn new() -> Self {
          Self
      }

      fn parse_markdown(&self, content: &str) -> Result<Vec<ChapterData>, String> {
          let parser = MdParser::new(content);

          let mut chapters: Vec<ChapterData> = Vec::new();
          let mut current_chapter: Option<ChapterData> = None;
          let mut current_block: Option<BlockData> = None;
          let mut current_text = String::new();
          let mut in_heading = false;
          let mut heading_level = 0;

          for event in parser {
              match event {
                  Event::Start(Tag::Heading { level, .. }) => {
                      in_heading = true;
                      heading_level = level as u8;
                      current_text.clear();
                  }
                  Event::End(TagEnd::Heading(_)) => {
                      in_heading = false;

                      // H1 和 H2 作为章节标题
                      if heading_level <= 2 {
                          // 保存当前章节
                          if let Some(chapter) = current_chapter.take() {
                              chapters.push(chapter);
                          }

                          // 创建新章节
                          current_chapter = Some(ChapterData {
                              title: current_text.clone(),
                              blocks: Vec::new(),
                              confidence: "explicit".to_string(),
                          });
                      } else {
                          // H3-H6 作为标题块
                          if let Some(ref mut chapter) = current_chapter {
                              chapter.blocks.push(BlockData {
                                  block_type: "heading".to_string(),
                                  runs: vec![TextRun {
                                      text: current_text.clone(),
                                      marks: vec![],
                                  }],
                              });
                          }
                      }

                      current_text.clear();
                  }
                  Event::Start(Tag::Paragraph) => {
                      current_text.clear();
                  }
                  Event::End(TagEnd::Paragraph) => {
                      if let Some(ref mut chapter) = current_chapter {
                          if !current_text.trim().is_empty() {
                              chapter.blocks.push(BlockData {
                                  block_type: "paragraph".to_string(),
                                  runs: vec![TextRun {
                                      text: current_text.clone(),
                                      marks: vec![],
                                  }],
                              });
                          }
                      }
                      current_text.clear();
                  }
                  Event::Start(Tag::CodeBlock(_)) => {
                      current_text.clear();
                  }
                  Event::End(TagEnd::CodeBlock) => {
                      if let Some(ref mut chapter) = current_chapter {
                          chapter.blocks.push(BlockData {
                              block_type: "code".to_string(),
                              runs: vec![TextRun {
                                  text: current_text.clone(),
                                  marks: vec![],
                              }],
                          });
                      }
                      current_text.clear();
                  }
                  Event::Text(text) => {
                      current_text.push_str(&text);
                  }
                  Event::Code(code) => {
                      current_text.push_str(&format!("`{}`", code));
                  }
                  Event::SoftBreak | Event::HardBreak => {
                      current_text.push(' ');
                  }
                  _ => {}
              }
          }

          // 保存最后一个章节
          if let Some(chapter) = current_chapter {
              chapters.push(chapter);
          }

          // 如果没有章节，创建一个默认章节
          if chapters.is_empty() {
              chapters.push(ChapterData {
                  title: "全文".to_string(),
                  blocks: Vec::new(),
                  confidence: "linear".to_string(),
              });
          }

          Ok(chapters)
      }
  }

  impl Parser for MarkdownParser {
      fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
          let content = fs::read_to_string(file_path)
              .map_err(|e| format!("读取文件失败: {}", e))?;

          let chapters = self.parse_markdown(&content)?;
          let total_blocks = chapters.iter().map(|c| c.blocks.len()).sum();

          Ok(ParseResult {
              chapters,
              total_blocks,
              quality: ParseQuality::Native,
          })
      }

      fn get_quality(&self) -> ParseQuality {
          ParseQuality::Native
      }

      fn supported_extensions(&self) -> Vec<&str> {
          vec!["md", "markdown"]
      }
  }
  - 添加依赖到 Cargo.toml
  pulldown-cmark = "0.9"

  验收标准:
  - 正确解析标准 Markdown 语法
  - 标题自动识别为章节
  - 代码块、链接、样式正确保留
  - 测试用例：至少 3 个不同结构的 MD 文件
  - 性能：1MB MD 文件解析 < 1秒

  预计工作量: 1.5 天

  ---
  ☐ 任务 2.1.5：实现 PDF 解析器 (基础版)

  任务ID: T-2.1.5
  依赖: [T-2.1.1]
  优先级: P2

  实施内容:
  - 添加 PDF 解析依赖到 Cargo.toml
  pdf-extract = "0.7"
  - 创建 src-tauri/src/parser/pdf_parser.rs
  use super::*;
  use std::fs;

  #[derive(Clone)]
  pub struct PdfParser;

  impl PdfParser {
      pub fn new() -> Self {
          Self
      }

      fn split_into_blocks(&self, text: &str) -> Vec<BlockData> {
          // 按段落分割（双换行符）
          let paragraphs: Vec<&str> = text
              .split("\n\n")
              .map(|p| p.trim())
              .filter(|p| !p.is_empty())
              .collect();

          paragraphs
              .into_iter()
              .map(|p| BlockData {
                  block_type: "paragraph".to_string(),
                  runs: vec![TextRun {
                      text: p.replace('\n', " "),
                      marks: vec![],
                  }],
              })
              .collect()
      }
  }

  impl Parser for PdfParser {
      fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
          let bytes = fs::read(file_path)
              .map_err(|e| format!("读取文件失败: {}", e))?;

          let text = pdf_extract::extract_text_from_mem(&bytes)
              .map_err(|e| format!("PDF 解析失败: {}。可能是扫描版 PDF，暂不支持", e))?;

          // 按页或段落分割
          let blocks = self.split_into_blocks(&text);

          let chapter = ChapterData {
              title: "全文".to_string(),
              blocks,
              confidence: "linear".to_string(),
          };

          Ok(ParseResult {
              chapters: vec![chapter],
              total_blocks: chapter.blocks.len(),
              quality: ParseQuality::Light, // PDF 质量标记为 Light
          })
      }

      fn get_quality(&self) -> ParseQuality {
          ParseQuality::Light
      }

      fn supported_extensions(&self) -> Vec<&str> {
          vec!["pdf"]
      }
  }

  验收标准:
  - 能提取纯文本 PDF 的内容
  - 对于扫描版 PDF 返回友好错误提示
  - 测试用例：至少 3 个不同类型的 PDF
  - 性能：10MB PDF 解析 < 5秒

  预计工作量: 1 天

  ---
  模块 2.2：三层回退式章节识别引擎

  ☐ 任务 2.2.1：实现第一层 - 显式章节识别

  任务ID: T-2.2.1
  依赖: [T-2.1.2, T-2.1.3, T-2.1.4]
  优先级: P0

  实施内容:
  - 创建 src-tauri/src/parser/chapter_detector.rs
  use regex::Regex;
  use super::*;

  pub struct ChapterDetector {
      patterns: Vec<Regex>,
  }

  #[derive(Debug, Clone)]
  pub struct ChapterInfo {
      pub title: String,
      pub confidence: String,
      pub start_index: usize,
  }

  impl ChapterDetector {
      pub fn new() -> Self {
          let patterns = vec![
              // 中文章节
              Regex::new(r"^第[零一二三四五六七八九十百千\d]+章").unwrap(),
              Regex::new(r"^第\d+章").unwrap(),
              Regex::new(r"^第[零一二三四五六七八九十百千\d]+节").unwrap(),

              // 英文章节
              Regex::new(r"^Chapter\s+\d+").unwrap(),
              Regex::new(r"^CHAPTER\s+\d+").unwrap(),
              Regex::new(r"^Section\s+\d+").unwrap(),

              // Markdown 标题
              Regex::new(r"^#\s+").unwrap(),
              Regex::new(r"^##\s+").unwrap(),

              // 数字章节
              Regex::new(r"^\d+\.\s+").unwrap(),
              Regex::new(r"^\d+、").unwrap(),
          ];

          Self { patterns }
      }

      pub fn detect_explicit(&self, text: &str) -> Option<ChapterInfo> {
          let trimmed = text.trim();

          for pattern in &self.patterns {
              if let Some(cap) = pattern.find(trimmed) {
                  return Some(ChapterInfo {
                      title: trimmed.to_string(),
                      confidence: "explicit".to_string(),
                      start_index: 0,
                  });
              }
          }

          None
      }

      pub fn detect_chapters_in_blocks(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
          let mut chapters = Vec::new();

          for (i, block) in blocks.iter().enumerate() {
              if block.block_type == "heading" || block.block_type == "paragraph" {
                  if let Some(run) = block.runs.first() {
                      if let Some(chapter) = self.detect_explicit(&run.text) {
                          chapters.push(ChapterInfo {
                              title: chapter.title,
                              confidence: chapter.confidence,
                              start_index: i,
                          });
                      }
                  }
              }
          }

          chapters
      }
  }

  验收标准:
  - 识别中文章节标题 (第X章、第X节)
  - 识别英文章节标题 (Chapter X, Section X)
  - 识别 Markdown 标题 (#, ##)
  - 识别 HTML 标题 (, )
  - 测试用例覆盖率 > 90%

  预计工作量: 1 天

  ---
  ☐ 任务 2.2.2：实现第二层 - 结构性推断

  任务ID: T-2.2.2
  依赖: [T-2.2.1]
  优先级: P1

  实施内容:
  - 实现基于段落密度的章节推断
  impl ChapterDetector {
      pub fn detect_inferred(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
          let mut boundaries = Vec::new();
          let mut consecutive_empty = 0;

          for (i, block) in blocks.iter().enumerate() {
              let is_empty = block.runs.is_empty() ||
                             block.runs.iter().all(|r| r.text.trim().is_empty());

              if is_empty {
                  consecutive_empty += 1;
              } else {
                  // 连续 3 个空行，可能是章节分界
                  if consecutive_empty >= 3 {
                      boundaries.push(ChapterInfo {
                          title: format!("章节 {}", boundaries.len() + 1),
                          confidence: "inferred".to_string(),
                          start_index: i,
                      });
                  }
                  consecutive_empty = 0;
              }
          }

          boundaries
      }

      pub fn detect_by_length_change(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
          let mut chapters = Vec::new();

          for (i, block) in blocks.iter().enumerate() {
              if i == 0 {
                  continue;
              }

              let current_len = block.runs.iter()
                  .map(|r| r.text.len())
                  .sum::<usize>();

              let prev_len = blocks[i - 1].runs.iter()
                  .map(|r| r.text.len())
                  .sum::<usize>();

              // 短段落后跟长段落，可能是标题+正文
              if prev_len < 50 && current_len > 200 {
                  if let Some(run) = blocks[i - 1].runs.first() {
                      chapters.push(ChapterInfo {
                          title: run.text.clone(),
                          confidence: "inferred".to_string(),
                          start_index: i - 1,
                      });
                  }
              }
          }

          chapters
      }
  }

  验收标准:
  - 能识别无明显标题的长文档的章节分界
  - 误判率 < 10%
  - 测试用例：至少 5 个无明显章节标记的文档

  预计工作量: 1 天

  ---
  ☐ 任务 2.2.3：实现第三层 - 线性模式

  任务ID: T-2.2.3
  依赖: [T-2.2.2]
  优先级: P2

  实施内容:
  - 实现线性模式回退
  impl ChapterDetector {
      pub fn detect(&self, blocks: &[BlockData]) -> Vec<ChapterData> {
          // 尝试第一层：显式识别
          let explicit_chapters = self.detect_chapters_in_blocks(blocks);
          if !explicit_chapters.is_empty() {
              return self.split_blocks_by_chapters(blocks, explicit_chapters);
          }

          // 尝试第二层：结构性推断
          let mut inferred_chapters = self.detect_inferred(blocks);
          if inferred_chapters.is_empty() {
              inferred_chapters = self.detect_by_length_change(blocks);
          }

          if !inferred_chapters.is_empty() {
              return self.split_blocks_by_chapters(blocks, inferred_chapters);
          }

          // 回退到第三层：单章节线性模式
          vec![ChapterData {
              title: "全文".to_string(),
              blocks: blocks.to_vec(),
              confidence: "linear".to_string(),
          }]
      }

      fn split_blocks_by_chapters(
          &self,
          blocks: &[BlockData],
          chapter_infos: Vec<ChapterInfo>
      ) -> Vec<ChapterData> {
          let mut chapters = Vec::new();

          for (i, info) in chapter_infos.iter().enumerate() {
              let start = info.start_index;
              let end = chapter_infos.get(i + 1)
                  .map(|next| next.start_index)
                  .unwrap_or(blocks.len());

              chapters.push(ChapterData {
                  title: info.title.clone(),
                  blocks: blocks[start..end].to_vec(),
                  confidence: info.confidence.clone(),
              });
          }

          chapters
      }
  }

  验收标准:
  - 任何文档都能成功解析（不会失败）
  - 置信度标记正确
  - 测试用例：各种边缘情况文档

  预计工作量: 0.5 天

  ---
  第三阶段：异步导入流程 (Async Import)

  模块 3.1：后台任务队列

  ☐ 任务 3.1.1：设计异步任务架构

  任务ID: T-3.1.1
  依赖: [T-2.1.2]
  优先级: P0

  实施内容:
  - 创建 src-tauri/src/import_queue.rs
  use std::collections::{VecDeque, HashMap};
  use std::sync::{Arc, Mutex};
  use serde::{Serialize, Deserialize};
  use std::path::PathBuf;
  use chrono::{DateTime, Utc};

  #[derive(Serialize, Deserialize, Clone, Debug)]
  pub enum ImportStatus {
      Pending,
      Parsing,
      ExtractingAssets,
      BuildingIndex,
      Completed,
      Failed(String),
  }

  #[derive(Clone, Debug)]
  pub struct ImportTask {
      pub book_id: i32,
      pub file_path: PathBuf,
      pub status: ImportStatus,
      pub progress: f32, // 0.0 - 1.0
      pub created_at: DateTime<Utc>,
  }

  pub struct ImportQueue {
      tasks: Arc<Mutex<VecDeque<ImportTask>>>,
      active_tasks: Arc<Mutex<HashMap<i32, ImportTask>>>,
      max_concurrent: usize,
  }

  impl ImportQueue {
      pub fn new(max_concurrent: usize) -> Self {
          Self {
              tasks: Arc::new(Mutex::new(VecDeque::new())),
              active_tasks: Arc::new(Mutex::new(HashMap::new())),
              max_concurrent,
          }
      }

      pub fn enqueue(&self, task: ImportTask) -> Result<(), String> {
          let mut tasks = self.tasks.lock()
              .map_err(|e| format!("锁定任务队列失败: {}", e))?;
          tasks.push_back(task);
          Ok(())
      }

      pub fn dequeue(&self) -> Result<Option<ImportTask>, String> {
          let mut tasks = self.tasks.lock()
              .map_err(|e| format!("锁定任务队列失败: {}", e))?;
          let active = self.active_tasks.lock()
              .map_err(|e| format!("锁定活动任务失败: {}", e))?;

          if active.len() >= self.max_concurrent {
              return Ok(None);
          }

          Ok(tasks.pop_front())
      }

      pub fn mark_active(&self, task: ImportTask) -> Result<(), String> {
          let mut active = self.active_tasks.lock()
              .map_err(|e| format!("锁定活动任务失败: {}", e))?;
          active.insert(task.book_id, task);
          Ok(())
      }

      pub fn mark_completed(&self, book_id: i32) -> Result<(), String> {
          let mut active = self.active_tasks.lock()
              .map_err(|e| format!("锁定活动任务失败: {}", e))?;
          active.remove(&book_id);
          Ok(())
      }

      pub fn get_status(&self, book_id: i32) -> Option<ImportTask> {
          let active = self.active_tasks.lock().ok()?;
          active.get(&book_id).cloned()
      }

      pub fn update_progress(&self, book_id: i32, progress: f32, status: ImportStatus) -> Result<(), String> {
          let mut active = self.active_tasks.lock()
              .map_err(|e| format!("锁定活动任务失败: {}", e))?;

          if let Some(task) = active.get_mut(&book_id) {
              task.progress = progress;
              task.status = status;
          }

          Ok(())
      }
  }
  - 在 src-tauri/src/lib.rs 中注册全局状态
  mod import_queue;
  use import_queue::ImportQueue;

  // 在 run() 函数中
  .manage(ImportQueue::new(3)) // 最多 3 个并发任务

  验收标准:
  - 任务队列线程安全
  - 支持并发任务（最多 3 个）
  - 任务状态正确更新

  预计工作量: 1 天

  ---
  ☐ 任务 3.1.2：实现异步导入命令
  **任务ID**: T-3.1.2
  **依赖**: [T-3.1.1, T-2.1.1]
  **优先级**: P0

  **实施内容**:
  - [ ] 重构导入命令为异步
    ```rust
    #[tauri::command]
    async fn import_book(app: AppHandle, file_path: String) -> Result<i32, String> {
        // 1. 创建 Book 记录，状态为 Pending
        let db_path = get_db_path(&app);
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

        // 提取文件名作为临时标题
        let filename = Path::new(&file_path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("未知书籍");

        conn.execute(
            "INSERT INTO books (title, author, file_path, parse_status) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![filename, "未知作者", &file_path, "pending"],
        ).map_err(|e| e.to_string())?;

        let book_id = conn.last_insert_rowid() as i32;

        // 2. 加入任务队列
        let queue = app.state::<ImportQueue>();
        queue.enqueue(ImportTask {
            book_id,
            file_path: PathBuf::from(file_path),
            status: ImportStatus::Pending,
            progress: 0.0,
            created_at: Utc::now(),
        })?;

        // 3. 启动后台处理
        let app_clone = app.clone();
        tokio::spawn(async move {
            process_queue(app_clone).await;
        });

        // 4. 立即返回 book_id
        Ok(book_id)
    }

    async fn process_queue(app: AppHandle) {
        let queue = app.state::<ImportQueue>();

        loop {
            // 从队列中取出任务
            let task = match queue.dequeue() {
                Ok(Some(t)) => t,
                Ok(None) => {
                    // 队列为空或已达并发上限
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    continue;
                }
                Err(e) => {
                    eprintln!("获取任务失败: {}", e);
                    break;
                }
            };

            // 标记为活动任务
            if let Err(e) = queue.mark_active(task.clone()) {
                eprintln!("标记活动任务失败: {}", e);
                continue;
            }

            // 处理任务
            let app_clone = app.clone();
            let task_clone = task.clone();
            tokio::spawn(async move {
                if let Err(e) = process_import_task(app_clone.clone(), task_clone.clone()).await {
                    eprintln!("导入任务失败: {}", e);

                    // 更新状态为失败
                    let db_path = get_db_path(&app_clone);
                    if let Ok(conn) = db::init_db(&db_path) {
                        let _ = conn.execute(
                            "UPDATE books SET parse_status = ?1 WHERE id = ?2",
                            rusqlite::params!["failed", task_clone.book_id],
                        );
                    }

                    // 发送错误事件
                    let _ = app_clone.emit("import-error", serde_json::json!({
                        "book_id": task_clone.book_id,
                        "error": e
                    }));
                }

                // 标记任务完成
                let queue = app_clone.state::<ImportQueue>();
                let _ = queue.mark_completed(task_clone.book_id);
            });
        }
    }

    async fn process_import_task(app: AppHandle, task: ImportTask) -> Result<(), String> {
        let db_path = get_db_path(&app);
        let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

        // 更新状态为 Parsing
        conn.execute(
            "UPDATE books SET parse_status = ?1 WHERE id = ?2",
            rusqlite::params!["parsing", task.book_id],
        ).map_err(|e| e.to_string())?;

        app.emit("import-progress", serde_json::json!({
            "book_id": task.book_id,
            "status": "parsing",
            "progress": 0.1
        })).map_err(|e| e.to_string())?;

        // 路由到对应的 Parser
        let router = parser::ParserRouter::new();
        let parser = router.route(&task.file_path)?;

        // 解析
        let result = parser.parse(&task.file_path, task.book_id, &conn)?;

        // 更新进度
        app.emit("import-progress", serde_json::json!({
            "book_id": task.book_id,
            "status": "saving",
            "progress": 0.5
        })).map_err(|e| e.to_string())?;

        // 保存章节和块到数据库
        for (chapter_index, chapter) in result.chapters.iter().enumerate() {
            let chapter_id = irp::create_chapter(
                &conn,
                task.book_id,
                &chapter.title,
                chapter_index as i32,
                &chapter.confidence,
            ).map_err(|e| e.to_string())?;

            for (block_index, block) in chapter.blocks.iter().enumerate() {
                irp::create_block(
                    &conn,
                    chapter_id as i32,
                    block_index as i32,
                    &block.block_type,
                    &block.runs,
                ).map_err(|e| e.to_string())?;
            }
        }

        // 更新书籍信息
        conn.execute(
            "UPDATE books SET parse_status = ?1, parse_quality = ?2, total_blocks = ?3 WHERE id = ?4",
            rusqlite::params![
                "completed",
                format!("{:?}", result.quality),
                result.total_blocks,
                task.book_id
            ],
        ).map_err(|e| e.to_string())?;

        // 发送完成事件
        app.emit("import-progress", serde_json::json!({
            "book_id": task.book_id,
            "status": "completed",
            "progress": 1.0
        })).map_err(|e| e.to_string())?;

        Ok(())
    }

  - 在 lib.rs 中注册命令
  .invoke_handler(tauri::generate_handler![
      import_book,
      // ... 其他命令
  ])

  验收标准:
  - 导入不阻塞 UI
  - 进度事件正确发送到前端
  - 错误处理完善
  - 支持多文件并发导入

  预计工作量: 2 天

  ---
  ☐ 任务 3.1.3：实现前端进度显示

  任务ID: T-3.1.3
  依赖: [T-3.1.2]
  优先级: P1

  实施内容:
  - 创建 src/components/import/ImportProgress.tsx
  import { useEffect, useState } from 'react';
  import { listen } from '@tauri-apps/api/event';

  interface ImportProgressProps {
      bookId: number;
  }

  interface ProgressPayload {
      book_id: number;
      status: string;
      progress: number;
  }

  export function ImportProgress({ bookId }: ImportProgressProps) {
      const [progress, setProgress] = useState(0);
      const [status, setStatus] = useState('pending');

      useEffect(() => {
          const unlisten = listen<ProgressPayload>('import-progress', (event) => {
              if (event.payload.book_id === bookId) {
                  setProgress(event.payload.progress);
                  setStatus(event.payload.status);
              }
          });

          return () => {
              unlisten.then(fn => fn());
          };
      }, [bookId]);

      const getStatusText = (status: string) => {
          const statusMap: Record<string, string> = {
              'pending': '等待中',
              'parsing': '解析中',
              'saving': '保存中',
              'extracting_assets': '提取资源',
              'building_index': '构建索引',
              'completed': '完成',
              'failed': '失败',
          };
          return statusMap[status] || status;
      };

      return (
          <div className="import-progress">
              <div className="progress-bar-container">
                  <div 
                      className="progress-bar" 
                      style={{ width: `${progress * 100}%` }}
                  />
              </div>
              <span className="status-text">{getStatusText(status)}</span>
          </div>
      );
  }
  - 在书架页面集成进度显示
  // 在 BookCard.tsx 中
  {book.parse_status !== 'completed' && (
      <ImportProgress bookId={book.id} />
  )}
  - 添加样式
  .import-progress {
      margin-top: 8px;
  }

  .progress-bar-container {
      width: 100%;
      height: 4px;
      background-color: #e0e0e0;
      border-radius: 2px;
      overflow: hidden;
  }

  .progress-bar {
      height: 100%;
      background-color: #4caf50;
      transition: width 0.3s ease;
  }

  .status-text {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
      display: block;
  }

  验收标准:
  - 进度条实时更新
  - 状态文本友好显示
  - 完成后自动刷新书架
  - 错误时显示友好提示

  预计工作量: 0.5 天

  ---
  模块 3.2：错误处理和重试机制

  ☐ 任务 3.2.1：实现导入错误处理

  任务ID: T-3.2.1
  依赖: [T-3.1.2]
  优先级: P1

  实施内容:
  - 定义错误类型
  #[derive(Debug, thiserror::Error)]
  pub enum ImportError {
      #[error("文件格式不支持: {0}")]
      UnsupportedFormat(String),

      #[error("文件损坏或无法读取: {0}")]
      FileCorrupted(String),

      #[error("解析失败: {0}")]
      ParseError(String),

      #[error("数据库错误: {0}")]
      DatabaseError(#[from] rusqlite::Error),

      #[error("IO 错误: {0}")]
      IoError(#[from] std::io::Error),
  }
  - 实现错误捕获和记录
  async fn process_import_task(app: AppHandle, task: ImportTask) -> Result<(), String> {
      match do_import(&app, &task).await {
          Ok(_) => {
              let conn = db::init_db(&get_db_path(&app))?;
              conn.execute(
                  "UPDATE books SET parse_status = ?1 WHERE id = ?2",
                  rusqlite::params!["completed", task.book_id],
              ).map_err(|e| e.to_string())?;
          }
          Err(e) => {
              eprintln!("Import failed for book {}: {}", task.book_id, e);

              let conn = db::init_db(&get_db_path(&app))?;
              conn.execute(
                  "UPDATE books SET parse_status = ?1 WHERE id = ?2",
                  rusqlite::params![format!("failed: {}", e), task.book_id],
              ).map_err(|e| e.to_string())?;

              app.emit("import-error", serde_json::json!({
                  "book_id": task.book_id,
                  "error": e.to_string()
              })).map_err(|e| e.to_string())?;
          }
      }
      Ok(())
  }
  - 前端错误提示
  // 在 App.tsx 或主组件中
  useEffect(() => {
      const unlisten = listen<{ book_id: number; error: string }>('import-error', (event) => {
          toast.error(`导入失败: ${event.payload.error}`);
      });

      return () => {
          unlisten.then(fn => fn());
      };
  }, []);

  验收标准:
  - 所有错误类型都有友好的提示信息
  - 错误日志完整记录
  - 用户能看到失败原因
  - 失败的书籍可以删除或重试

  预计工作量: 0.5 天

  ---
  ☐ 任务 3.2.2：实现导入重试机制

  任务ID: T-3.2.2
  依赖: [T-3.2.1]
  优先级: P2

  实施内容:
  - 添加重试逻辑
  #[tauri::command]
  pub async fn retry_import(app: AppHandle, book_id: i32) -> Result<(), String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      // 获取原始文件路径
      let file_path: String = conn.query_row(
          "SELECT file_path FROM books WHERE id = ?1",
          [book_id],
          |row| row.get(0)
      ).map_err(|e| e.to_string())?;

      // 清理旧数据
      conn.execute("DELETE FROM chapters WHERE book_id = ?1", [book_id])
          .map_err(|e| e.to_string())?;

      // 重置状态
      conn.execute(
          "UPDATE books SET parse_status = ?1 WHERE id = ?2",
          rusqlite::params!["pending", book_id],
      ).map_err(|e| e.to_string())?;

      // 重新加入队列
      let queue = app.state::<ImportQueue>();
      queue.enqueue(ImportTask {
          book_id,
          file_path: PathBuf::from(file_path),
          status: ImportStatus::Pending,
          progress: 0.0,
          created_at: Utc::now(),
      })?;

      Ok(())
  }
  - 前端添加"重试"按钮
  {book.parse_status?.startsWith('failed') && (
      <button
          onClick={() => invoke('retry_import', { bookId: book.id })}
          className="retry-button"
      >
          重试
      </button>
  )}

  验收标准:
  - 失败的导入可以重试
  - 重试时清除旧数据
  - 重试次数无限制（由用户控制）

  预计工作量: 0.5 天

  ---
  第四阶段：阅读器适配 (Reader Integration)

  模块 4.1：阅读器数据源切换

  ☐ 任务 4.1.1：重构章节列表数据源

  任务ID: T-4.1.1
  依赖: [T-1.1.3, T-3.1.2]
  优先级: P0

  实施内容:
  - 修改 get_book_details 命令
  #[derive(Serialize)]
  struct ChapterInfo {
      id: String,
      title: String,
      confidence: String,
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

      if status != "completed" {
          return Err(format!("书籍正在解析中，状态: {}", status));
      }

      // 从 chapters 表读取
      let mut stmt = conn.prepare(
          "SELECT id, title, confidence_level FROM chapters 
           WHERE book_id = ?1 ORDER BY chapter_index"
      ).map_err(|e| e.to_string())?;

      let chapters = stmt.query_map([id], |row| {
          Ok(ChapterInfo {
              id: row.get::<_, i32>(0)?.to_string(),
              title: row.get(1)?,
              confidence: row.get(2)?,
          })
      }).map_err(|e| e.to_string())?
      .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

      Ok(chapters)
  }
  - 前端显示章节置信度标记
  {chapter.confidence !== 'explicit' && (
      <span className="confidence-badge">
          {chapter.confidence === 'inferred' ? '推断' : '自动'}
      </span>
  )}

  验收标准:
  - 章节列表从 IRP 数据库读取
  - 显示章节置信度标记
  - 未完成解析的书籍显示友好提示

  预计工作量: 0.5 天

  ---
  ☐ 任务 4.1.2：重构章节内容渲染

  任务ID: T-4.1.2
  依赖: [T-4.1.1]
  优先级: P0

  实施内容:
  - 修改 get_chapter_content 命令
  #[tauri::command]
  fn get_chapter_content(app: AppHandle, book_id: i32, chapter_id: i32) -> Result<String, String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      // 获取该章节的所有 blocks
      let blocks = irp::get_blocks_by_chapter(&conn, chapter_id)
          .map_err(|e| e.to_string())?;

      // 将 blocks 转换为 HTML
      let html = render_blocks_to_html(&blocks, &app)?;

      Ok(html)
  }

  fn render_blocks_to_html(blocks: &[irp::Block], app: &AppHandle) -> Result<String, String> {
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
                      let asset_url = resolve_image_path(&run.text, app)?;
                      html.push_str(&format!("<img src='{}' alt='image' />", asset_url));
                  }
              }
              "code" => {
                  html.push_str("<pre><code>");
                  html.push_str(&render_runs_to_html(&block.runs));
                  html.push_str("</code></pre>");
              }
              _ => {}
          }
      }

      Ok(html)
  }

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
                              text = format!("<a href='{}'>{}</a>", href, text);
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
  - 添加 HTML 转义依赖
  html-escape = "0.2"

  验收标准:
  - 章节内容从 IRP 渲染
  - 文本样式正确显示
  - 图片路径正确映射
  - 性能：10000 个 Block 的章节渲染 < 500ms
  - HTML 注入安全（文本正确转义）

  预计工作量: 1 天

  ---
  ☐ 任务 4.1.3：实现图片路径解析

  任务ID: T-4.1.3
  依赖: [T-4.1.2, T-1.2.1]
  优先级: P1

  实施内容:
  - 实现图片路径转换
  fn resolve_image_path(local_path: &str, app: &AppHandle) -> Result<String, String> {
      use tauri::Manager;

      let app_data_dir = app.path().app_data_dir()
          .map_err(|e| e.to_string())?;
      let full_path = app_data_dir.join(local_path);

      // 检查文件是否存在
      if !full_path.exists() {
          return Err(format!("图片文件不存在: {}", local_path));
      }

      // 转换为 Tauri convertFileSrc URL
      let asset_url = tauri::api::path::resolve_path(
          &app.config(),
          app.package_info(),
          &tauri::Env::default(),
          &full_path.to_string_lossy(),
          Some(tauri::api::path::BaseDirectory::AppData)
      ).map_err(|e| e.to_string())?;

      Ok(asset_url.to_string_lossy().to_string())
  }
  - 配置 Tauri 文件访问权限
  // 在 tauri.conf.json 中
  {
    "tauri": {
      "allowlist": {
        "fs": {
          "scope": ["$APPDATA/assets/**"]
        },
        "protocol": {
          "asset": true,
          "assetScope": ["$APPDATA/assets/**"]
        }
      }
    }
  }

  验收标准:
  - 图片正确显示
  - 支持本地文件协议
  - 图片加载性能良好
  - 不存在的图片显示占位符

  预计工作量: 0.5 天

  ---
  模块 4.2：阅读进度管理

  ☐ 任务 4.2.1：实现 Block 级进度记录
**任务ID**: T-4.2.1
  **依赖**: [T-4.1.2]
  **优先级**: P1

  **实施内容**:
  - [ ] 添加 `reading_progress` 表
    ```rust
    // 在 db.rs 的 init_db 中添加
    conn.execute(
        "CREATE TABLE IF NOT EXISTS reading_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            chapter_id INTEGER NOT NULL,
            block_id INTEGER NOT NULL,
            scroll_offset INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
            FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
            FOREIGN KEY (block_id) REFERENCES blocks(id) ON DELETE CASCADE,
            UNIQUE(book_id)
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id ON reading_progress(book_id)",
        [],
    )?;

  - 实现进度保存命令
  #[derive(Serialize, Deserialize)]
  pub struct ReadingProgress {
      pub chapter_id: i32,
      pub block_id: i32,
      pub scroll_offset: i32,
  }

  #[tauri::command]
  fn save_reading_progress(
      app: AppHandle,
      book_id: i32,
      chapter_id: i32,
      block_id: i32,
      scroll_offset: i32
  ) -> Result<(), String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      conn.execute(
          "INSERT OR REPLACE INTO reading_progress 
           (book_id, chapter_id, block_id, scroll_offset, updated_at)
           VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
          rusqlite::params![book_id, chapter_id, block_id, scroll_offset]
      ).map_err(|e| e.to_string())?;

      Ok(())
  }
  - 实现进度读取命令
  #[tauri::command]
  fn get_reading_progress(app: AppHandle, book_id: i32) -> Result<Option<ReadingProgress>, String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      let result = conn.query_row(
          "SELECT chapter_id, block_id, scroll_offset FROM reading_progress WHERE book_id = ?1",
          [book_id],
          |row| {
              Ok(ReadingProgress {
                  chapter_id: row.get(0)?,
                  block_id: row.get(1)?,
                  scroll_offset: row.get(2)?,
              })
          }
      );

      match result {
          Ok(progress) => Ok(Some(progress)),
          Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
          Err(e) => Err(e.to_string()),
      }
  }

  验收标准:
  - 进度精确到 Block 级别
  - 关闭重开后进度恢复准确
  - 性能：进度保存 < 10ms
  - 支持多本书籍独立进度

  预计工作量: 0.5 天

  ---
  ☐ 任务 4.2.2：前端进度同步
**任务ID**: T-4.2.2
  **依赖**: [T-4.2.1]
  **优先级**: P1

  **实施内容**:
  - [ ] 在 `ReaderContent.tsx` 中集成进度保存
    ```tsx
    import { invoke } from '@tauri-apps/api/tauri';
    import { useDebounce } from '../hooks/useDebounce';

    export function ReaderContent({ bookId, chapterId }: ReaderContentProps) {
        const [currentBlockId, setCurrentBlockId] = useState<number | null>(null);

        // 获取当前可见的 block ID
        const getVisibleBlockId = () => {
            const blocks = document.querySelectorAll('[data-block-id]');
            const viewportMiddle = window.innerHeight / 2;

            for (const block of blocks) {
                const rect = block.getBoundingClientRect();
                if (rect.top <= viewportMiddle && rect.bottom >= viewportMiddle) {
                    return parseInt(block.getAttribute('data-block-id') || '0');
                }
            }

            return null;
        };

        // 防抖保存进度
        const debouncedSaveProgress = useDebounce((blockId: number) => {
            invoke('save_reading_progress', {
                bookId,
                chapterId,
                blockId,
                scrollOffset: window.scrollY
            }).catch(err => console.error('保存进度失败:', err));
        }, 1000);

        useEffect(() => {
            const handleScroll = () => {
                const blockId = getVisibleBlockId();
                if (blockId !== null && blockId !== currentBlockId) {
                    setCurrentBlockId(blockId);
                    debouncedSaveProgress(blockId);
                }
            };

            window.addEventListener('scroll', handleScroll);
            return () => window.removeEventListener('scroll', handleScroll);
        }, [bookId, chapterId, currentBlockId]);

        // ... 渲染逻辑
    }

  - 打开书籍时恢复进度
  useEffect(() => {
      invoke<ReadingProgress | null>('get_reading_progress', { bookId })
          .then((progress) => {
              if (progress) {
                  // 跳转到对应章节
                  navigateToChapter(progress.chapter_id);

                  // 等待章节加载后滚动到对应位置
                  setTimeout(() => {
                      const block = document.querySelector(`[data-block-id="${progress.block_id}"]`);
                      if (block) {
                          block.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }
                  }, 300);
              }
          })
          .catch(err => console.error('获取进度失败:', err));
  }, [bookId]);
  - 在渲染 Block 时添加 data-block-id 属性
  <div
      key={block.id}
      data-block-id={block.id}
      className="block"
      dangerouslySetInnerHTML={{ __html: block.html }}
  />

  验收标准:
  - 滚动时自动保存进度
  - 重新打开书籍时准确恢复位置
  - 不影响阅读流畅度
  - 跨章节进度正确保存

  预计工作量: 1 天

  ---
  第五阶段：全文检索 (Full-Text Search)

  模块 5.1：FTS5 索引构建

  ☐ 任务 5.1.1：启用 SQLite FTS5 扩展

  任务ID: T-5.1.1
  依赖: [T-1.1.3]
  优先级: P1

  实施内容:
  - 在 Cargo.toml 中启用 FTS5
  rusqlite = { version = "0.31", features = ["bundled", "fts5"] }
  - 创建 FTS5 虚拟表
  // 在 db.rs 的 init_db 中添加
  pub fn init_fts5(conn: &Connection) -> Result<()> {
      conn.execute(
          "CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
              block_id UNINDEXED,
              book_id UNINDEXED,
              chapter_id UNINDEXED,
              content,
              tokenize='unicode61 remove_diacritics 2'
          )",
          []
      )?;

      Ok(())
  }

  // 在 init_db 函数末尾调用
  init_fts5(&conn)?;

  验收标准:
  - FTS5 扩展成功启用
  - 虚拟表创建成功
  - 支持中文分词（基础级别）

  预计工作量: 0.5 天

  ---
  ☐ 任务 5.1.2：实现渐进式索引构建

  任务ID: T-5.1.2
  依赖: [T-5.1.1, T-3.1.2]
  优先级: P1

  实施内容:
  - 实现索引构建任务
  pub async fn build_fts_index(app: AppHandle, book_id: i32) -> Result<(), String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      // 获取所有 blocks
      let mut stmt = conn.prepare(
          "SELECT b.id, b.chapter_id, c.book_id, b.runs_json 
           FROM blocks b
           JOIN chapters c ON b.chapter_id = c.id
           WHERE c.book_id = ?1"
      ).map_err(|e| e.to_string())?;

      let blocks: Vec<(i32, i32, i32, String)> = stmt.query_map([book_id], |row| {
          Ok((
              row.get(0)?, // block_id
              row.get(1)?, // chapter_id
              row.get(2)?, // book_id
              row.get(3)?, // runs_json
          ))
      }).map_err(|e| e.to_string())?
      .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

      // 批量插入索引
      let tx = conn.transaction().map_err(|e| e.to_string())?;

      {
          let mut insert_stmt = tx.prepare(
              "INSERT INTO blocks_fts (block_id, book_id, chapter_id, content) VALUES (?1, ?2, ?3, ?4)"
          ).map_err(|e| e.to_string())?;

          for (block_id, chapter_id, book_id, runs_json) in blocks {
              // 提取纯文本
              let runs: Vec<irp::TextRun> = serde_json::from_str(&runs_json)
                  .map_err(|e| e.to_string())?;
              let text = extract_plain_text_from_runs(&runs);

              insert_stmt.execute(rusqlite::params![block_id, book_id, chapter_id, text])
                  .map_err(|e| e.to_string())?;
          }
      }

      tx.commit().map_err(|e| e.to_string())?;

      Ok(())
  }

  fn extract_plain_text_from_runs(runs: &[irp::TextRun]) -> String {
      runs.iter()
          .map(|r| r.text.as_str())
          .collect::<Vec<_>>()
          .join("")
  }
  - 在导入完成后触发索引构建
  // 在 process_import_task 中，保存完章节和块后
  app.emit("import-progress", serde_json::json!({
      "book_id": task.book_id,
      "status": "building_index",
      "progress": 0.8
  })).map_err(|e| e.to_string())?;

  build_fts_index(app.clone(), task.book_id).await?;

  验收标准:
  - 索引构建不阻塞导入流程
  - 大型书籍（10万字）索引构建 < 5秒
  - 索引完整性验证通过
  - 支持增量索引更新

  预计工作量: 1 天

  ---
  ☐ 任务 5.1.3：实现全文搜索命令

  任务ID: T-5.1.3
  依赖: [T-5.1.2]
  优先级: P1

  实施内容:
  - 实现搜索命令
  #[derive(Serialize, Debug)]
  pub struct SearchResult {
      pub book_id: i32,
      pub book_title: String,
      pub chapter_id: i32,
      pub chapter_title: String,
      pub block_id: i32,
      pub snippet: String, // 高亮片段
      pub rank: f32,
  }

  #[tauri::command]
  fn search_books(
      app: AppHandle,
      query: String,
      book_id: Option<i32>
  ) -> Result<Vec<SearchResult>, String> {
      let db_path = get_db_path(&app);
      let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

      let mut sql = String::from(
          "SELECT 
              fts.book_id,
              b.title as book_title,
              fts.chapter_id,
              c.title as chapter_title,
              fts.block_id,
              snippet(blocks_fts, 3, '<mark>', '</mark>', '...', 32) as snippet,
              rank
           FROM blocks_fts fts
           JOIN books b ON fts.book_id = b.id
           JOIN chapters c ON fts.chapter_id = c.id
           WHERE blocks_fts MATCH ?1"
      );

      let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(query)];

      if let Some(bid) = book_id {
          sql.push_str(" AND fts.book_id = ?2");
          params.push(Box::new(bid));
      }

      sql.push_str(" ORDER BY rank LIMIT 50");

      let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
      let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter()
          .map(|p| p.as_ref() as &dyn rusqlite::ToSql)
          .collect();

      let results = stmt.query_map(rusqlite::params_from_iter(params_refs.iter()), |row| {
          Ok(SearchResult {
              book_id: row.get(0)?,
              book_title: row.get(1)?,
              chapter_id: row.get(2)?,
              chapter_title: row.get(3)?,
              block_id: row.get(4)?,
              snippet: row.get(5)?,
              rank: row.get(6)?,
          })
      }).map_err(|e| e.to_string())?
      .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

      Ok(results)
  }

  验收标准:
  - 支持跨书籍搜索
  - 支持单书籍搜索
  - 搜索结果包含高亮片段
  - 搜索性能：10万字书籍 < 100ms
  - 支持中文搜索

  预计工作量: 1 天

  ---
  模块 5.2：搜索 UI

  ☐ 任务 5.2.1：实现搜索界面

  任务ID: T-5.2.1
  依赖: [T-5.1.3]
  优先级: P2

  实施内容:
  - 创建 src/components/search/SearchPanel.tsx
  import { useState, useEffect } from 'react';
  import { invoke } from '@tauri-apps/api/tauri';
  import { useDebounce } from '../../hooks/useDebounce';

  interface SearchResult {
      book_id: number;
      book_title: string;
      chapter_id: number;
      chapter_title: string;
      block_id: number;
      snippet: string;
      rank: number;
  }

  export function SearchPanel() {
      const [query, setQuery] = useState('');
      const [results, setResults] = useState<SearchResult[]>([]);
      const [loading, setLoading] = useState(false);

      const debouncedQuery = useDebounce(query, 300);

      useEffect(() => {
          if (debouncedQuery.trim().length < 2) {
              setResults([]);
              return;
          }

          setLoading(true);
          invoke<SearchResult[]>('search_books', { query: debouncedQuery })
              .then(setResults)
              .catch(err => console.error('搜索失败:', err))
              .finally(() => setLoading(false));
      }, [debouncedQuery]);

      const navigateToBlock = (result: SearchResult) => {
          // 跳转到对应书籍、章节和块
          window.location.href = `/reader/${result.book_id}?chapter=${result.chapter_id}&block=${result.block_id}`;
      };

      return (
          <div className="search-panel">
              <div className="search-input-container">
                  <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="搜索书籍内容..."
                      className="search-input"
                  />
                  {loading && <span className="loading-spinner">搜索中...</span>}
              </div>

              <div className="search-results">
                  {results.length === 0 && query.trim().length >= 2 && !loading && (
                      <div className="no-results">未找到相关内容</div>
                  )}

                  {results.map((result, index) => (
                      <SearchResultItem
                          key={`${result.book_id}-${result.block_id}-${index}`}
                          result={result}
                          onClick={() => navigateToBlock(result)}
                      />
                  ))}
              </div>
          </div>
      );
  }

  function SearchResultItem({ result, onClick }: { result: SearchResult; onClick: () => void }) {
      return (
          <div className="search-result-item" onClick={onClick}>
              <div className="result-header">
                  <span className="book-title">{result.book_title}</span>
                  <span className="chapter-title">{result.chapter_title}</span>
              </div>
              <div 
                  className="result-snippet"
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
              />
          </div>
      );
  }
  - 添加样式
  .search-panel {
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
  }

  .search-input-container {
      position: relative;
      margin-bottom: 20px;
  }

  .search-input {
      width: 100%;
      padding: 12px 16px;
      font-size: 16px;
      border: 1px solid #ddd;
      border-radius: 8px;
  }

  .search-input:focus {
      outline: none;
      border-color: #4caf50;
  }

  .loading-spinner {
      position: absolute;
      right: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: #666;
      font-size: 14px;
  }

  .search-results {
      display: flex;
      flex-direction: column;
      gap: 12px;
  }

  .search-result-item {
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
  }

  .search-result-item:hover {
      border-color: #4caf50;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  .result-header {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 14px;
  }

  .book-title {
      font-weight: bold;
      color: #333;
  }

  .chapter-title {
      color: #666;
  }

  .result-snippet {
      font-size: 14px;
      line-height: 1.6;
      color: #555;
  }

  .result-snippet mark {
      background-color: #ffeb3b;
      padding: 2px 4px;
      border-radius: 2px;
  }

  .no-results {
      text-align: center;
      padding: 40px;
      color: #999;
  }

  验收标准:
  - 搜索界面友好
  - 支持实时搜索（debounce）
  - 搜索结果高亮显示
  - 点击结果准确跳转
  - 响应式设计

  预计工作量: 1 天

  ---
  第六阶段：测试与优化 (Testing & Optimization)

  模块 6.1：单元测试

  ☐ 任务 6.1.1：编写 Parser 单元测试

  任务ID: T-6.1.1
  依赖: [T-2.1.2, T-2.1.3, T-2.1.4]
  优先级: P1

  实施内容:
  - 创建测试文件 src-tauri/src/parser/tests.rs
  #[cfg(test)]
  mod tests {
      use super::*;
      use tempfile::TempDir;

      fn setup_test_db() -> (TempDir, Connection) {
          let temp_dir = TempDir::new().unwrap();
          let db_path = temp_dir.path().join("test.db");
          let conn = db::init_db(&db_path).unwrap();
          (temp_dir, conn)
      }

      #[test]
      fn test_epub_parser() {
          let (_temp, conn) = setup_test_db();
          let parser = EpubParser::new();

          let test_file = Path::new("test_data/sample.epub");
          if !test_file.exists() {
              println!("跳过测试：测试文件不存在");
              return;
          }

          let result = parser.parse(test_file, 1, &conn).unwrap();

          assert!(result.chapters.len() > 0);
          assert_eq!(result.quality, ParseQuality::Native);
      }

      #[test]
      fn test_chapter_detection() {
          let detector = ChapterDetector::new();

          let test_cases = vec![
              ("第一章 开始", true),
              ("Chapter 1", true),
              ("# 标题", true),
              ("普通段落", false),
          ];

          for (text, should_detect) in test_cases {
              let result = detector.detect_explicit(text);
              assert_eq!(result.is_some(), should_detect, "测试失败: {}", text);
          }
      }

      #[test]
      fn test_txt_encoding_detection() {
          let parser = TxtParser::new();

          // 测试 UTF-8
          let utf8_bytes = "测试文本".as_bytes();
          let encoding = parser.detect_encoding(utf8_bytes);
          assert_eq!(encoding, UTF_8);
      }
  }
  - 准备测试数据集
    - 创建 test_data/ 目录
    - 添加至少 5 个不同格式的测试文件
    - 覆盖各种边缘情况

  验收标准:
  - 测试覆盖率 > 80%
  - 所有测试通过
  - 边缘情况处理正确
  - CI/CD 集成

  预计工作量: 1.5 天

  ---
  ☐ 任务 6.1.2：编写 IRP 数据层测试

  任务ID: T-6.1.2
  依赖: [T-1.1.3]
  优先级: P1

  实施内容:
  - 测试 Chapter/Block CRUD
  #[cfg(test)]
  mod irp_tests {
      use super::*;

      #[test]
      fn test_chapter_crud() {
          let (_temp, conn) = setup_test_db();

          // 创建书籍
          conn.execute(
              "INSERT INTO books (title, author, file_path) VALUES (?1, ?2, ?3)",
              rusqlite::params!["测试书籍", "测试作者", "/test/path"],
          ).unwrap();
          let book_id = conn.last_insert_rowid() as i32;

          // 创建章节
          let chapter_id = irp::create_chapter(&conn, book_id, "第一章", 0, "explicit").unwrap();
          assert!(chapter_id > 0);

          // 读取章节
          let chapters = irp::get_chapters_by_book(&conn, book_id).unwrap();
          assert_eq!(chapters.len(), 1);
          assert_eq!(chapters[0].title, "第一章");
      }

      #[test]
      fn test_block_json_serialization() {
          let runs = vec![
              TextRun {
                  text: "测试文本".to_string(),
                  marks: vec![],
              }
          ];

          let json = serde_json::to_string(&runs).unwrap();
          let deserialized: Vec<TextRun> = serde_json::from_str(&json).unwrap();

          assert_eq!(deserialized[0].text, "测试文本");
      }

      #[test]
      fn test_concurrent_access() {
          use std::thread;
          use std::sync::Arc;

          let (_temp, conn) = setup_test_db();
          let conn = Arc::new(Mutex::new(conn));

          let mut handles = vec![];

          for i in 0..10 {
              let conn_clone = Arc::clone(&conn);
              let handle = thread::spawn(move || {
                  let conn = conn_clone.lock().unwrap();
                  // 执行并发操作
              });
              handles.push(handle);
          }

          for handle in handles {
              handle.join().unwrap();
          }
      }
  }

  验收标准:
  - 所有 DAO 函数测试通过
  - 并发测试无数据竞争
  - 性能测试达标

  预计工作量: 1 天

  ---
  模块 6.2：集成测试

  ☐ 任务 6.2.1：端到端导入测试

  任务ID: T-6.2.1
  依赖: [T-3.1.2, T-4.1.2]
  优先级: P1

  实施内容:
  - 测试完整导入流程
  #[tokio::test]
  async fn test_full_import_flow() {
      // 1. 创建测试应用
      let app = create_test_app();

      // 2. 导入文件
      let book_id = import_book(app.clone(), "test_data/sample.epub".to_string())
          .await
          .unwrap();

      // 3. 等待导入完成
      tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

      // 4. 验证数据
      let conn = db::init_db(&get_db_path(&app)).unwrap();

      let status: String = conn.query_row(
          "SELECT parse_status FROM books WHERE id = ?1",
          [book_id],
          |row| row.get(0)
      ).unwrap();

      assert_eq!(status, "completed");

      // 5. 验证章节
      let chapters = irp::get_chapters_by_book(&conn, book_id).unwrap();
      assert!(chapters.len() > 0);

      // 6. 验证内容可读取
      let content = get_chapter_content(app, book_id, chapters[0].id).unwrap();
      assert!(!content.is_empty());
  }
  - 测试多格式导入
  - 测试大文件导入（> 10MB）
  - 测试错误恢复

  验收标准:
  - 所有格式导入成功
  - 大文件导入不崩溃
  - 内存占用合理
  - 错误处理正确

  预计工作量: 1.5 天

  ---
  模块 6.3：性能优化

  ☐ 任务 6.3.1：数据库查询优化

  任务ID: T-6.3.1
  依赖: [T-4.1.2, T-5.1.3]
  优先级: P2

  实施内容:
  - 分析慢查询
  // 启用 SQLite 查询分析
  conn.execute("PRAGMA query_only = ON", [])?;
  conn.execute("PRAGMA optimize", [])?;
  - 添加必要的索引
  // 复合索引优化
  conn.execute(
      "CREATE INDEX IF NOT EXISTS idx_blocks_chapter_index 
       ON blocks(chapter_id, block_index)",
      []
  )?;
  - 优化 JOIN 查询
    - 使用 EXPLAIN QUERY PLAN 分析
    - 减少不必要的 JOIN
    - 使用子查询优化
  - 实现查询结果缓存
  use std::collections::HashMap;
  use std::sync::{Arc, Mutex};

  pub struct QueryCache {
      cache: Arc<Mutex<HashMap<String, String>>>,
  }

  impl QueryCache {
      pub fn get(&self, key: &str) -> Option<String> {
          self.cache.lock().unwrap().get(key).cloned()
      }

      pub fn set(&self, key: String, value: String) {
          self.cache.lock().unwrap().insert(key, value);
      }
  }

  验收标准:
  - 章节加载 < 200ms
  - 搜索响应 < 100ms
  - 数据库大小合理（< 原文件 2倍）
  - 缓存命中率 > 70%

  预计工作量: 1 天

  ---
  ☐ 任务 6.3.2：前端渲染优化
    **任务ID**: T-6.3.2
  **依赖**: [T-4.1.2]
  **优先级**: P2

  **实施内容**:
  - [ ] 实现虚拟滚动
    ```tsx
    import { useVirtualizer } from '@tanstack/react-virtual';

    export function VirtualizedReader({ blocks }: { blocks: Block[] }) {
        const parentRef = useRef<HTMLDivElement>(null);

        const virtualizer = useVirtualizer({
            count: blocks.length,
            getScrollElement: () => parentRef.current,
            estimateSize: () => 100, // 估计每个块的高度
            overscan: 5, // 预渲染 5 个块
        });

        return (
            <div ref={parentRef} style={{ height: '100vh', overflow: 'auto' }}>
                <div
                    style={{
                        height: `${virtualizer.getTotalSize()}px`,
                        position: 'relative',
                    }}
                >
                    {virtualizer.getVirtualItems().map((virtualItem) => (
                        <div
                            key={virtualItem.key}
                            data-index={virtualItem.index}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                transform: `translateY(${virtualItem.start}px)`,
                            }}
                        >
                            <BlockRenderer block={blocks[virtualItem.index]} />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

  - 图片懒加载
  export function LazyImage({ src, alt }: { src: string; alt: string }) {
      const [isLoaded, setIsLoaded] = useState(false);
      const imgRef = useRef<HTMLImageElement>(null);

      useEffect(() => {
          const observer = new IntersectionObserver(
              ([entry]) => {
                  if (entry.isIntersecting) {
                      setIsLoaded(true);
                      observer.disconnect();
                  }
              },
              { rootMargin: '200px' }
          );

          if (imgRef.current) {
              observer.observe(imgRef.current);
          }

          return () => observer.disconnect();
      }, []);

      return (
          <img
              ref={imgRef}
              src={isLoaded ? src : '/placeholder.png'}
              alt={alt}
              loading="lazy"
          />
      );
  }
  - 优化 React 组件渲染
  // 使用 React.memo 避免不必要的重渲染
  export const BlockRenderer = React.memo(({ block }: { block: Block }) => {
      return (
          <div 
              className="block"
              dangerouslySetInnerHTML={{ __html: block.html }}
          />
      );
  }, (prevProps, nextProps) => {
      return prevProps.block.id === nextProps.block.id;
  });
  - 添加依赖
  {
    "dependencies": {
      "@tanstack/react-virtual": "^3.0.0"
    }
  }

  验收标准:
  - 10000 个 Block 的章节流畅滚动
  - 首屏渲染 < 500ms
  - 内存占用 < 200MB
  - 滚动帧率 > 55fps

  预计工作量: 1.5 天

  ---
  第七阶段：文档与部署 (Documentation & Deployment)

  模块 7.1：用户文档

  ☐ 任务 7.1.1：编写用户手册

  任务ID: T-7.1.1
  依赖: [T-6.2.1]
  优先级: P2

  实施内容:
  - 创建 docs/user-guide.md
  # DeepReader 用户手册

  ## 导入书籍

  ### 支持的格式
  - EPUB (.epub) - 完整支持，保留原始格式
  - Markdown (.md, .markdown) - 完整支持
  - 纯文本 (.txt) - 支持 UTF-8 和 GBK 编码
  - PDF (.pdf) - 基础支持，仅限文字版 PDF

  ### 导入步骤
  1. 点击主界面的"导入书籍"按钮
  2. 选择要导入的文件
  3. 等待解析完成（进度条显示）
  4. 解析完成后即可开始阅读

  ### 注意事项
  - 导入后可以删除原始文件，书籍数据已保存到本地
  - 大文件（>50MB）导入可能需要较长时间
  - PDF 扫描版暂不支持

  ## 阅读功能

  ### 章节导航
  - 左侧章节列表显示所有章节
  - 点击章节标题快速跳转
  - 章节标记说明：
    - 无标记：原文自带章节
    - "推断"：系统自动识别的章节
    - "自动"：无法识别章节，作为整体显示

  ### 阅读进度
  - 系统自动保存阅读位置
  - 重新打开书籍时自动恢复到上次阅读位置

  ### 搜索功能
  - 支持全文搜索
  - 搜索结果高亮显示
  - 点击搜索结果直接跳转

  ## 常见问题

  ### Q: 导入失败怎么办？
  A:
  1. 检查文件格式是否支持
  2. 确认文件未损坏
  3. 点击"重试"按钮重新导入
  4. 如仍失败，请查看错误信息

  ### Q: 为什么有些 PDF 无法导入？
  A: 目前仅支持文字版 PDF，扫描版 PDF（图片格式）暂不支持。

  ### Q: 导入的书籍存储在哪里？
  A: 书籍数据存储在应用数据目录，可以在设置中查看具体路径。
  - 添加截图和示例
  - 创建视频教程（可选）

  验收标准:
  - 文档清晰易懂
  - 包含截图示例
  - 覆盖所有主要功能
  - 常见问题解答完整

  预计工作量: 1 天

  ---
  模块 7.2：开发者文档

  ☐ 任务 7.2.1：编写架构文档

  任务ID: T-7.2.1
  依赖: [T-6.1.2]
  优先级: P2

  实施内容:
  - 创建 docs/architecture.md
  # DeepReader 架构文档

  ## 系统架构

  ### 整体架构
  - ┌─────────────────────────────────────────┐
  │           Frontend (React)              │
  │  ┌──────────┐  ┌──────────┐  ┌────────┐│
  │  │ 书架界面 │  │ 阅读器   │  │ 搜索   ││
  │  └──────────┘  └──────────┘  └────────┘│
  └─────────────────┬───────────────────────┘
                │ Tauri IPC
  ┌─────────────────▼───────────────────────┐
  │         Backend (Rust/Tauri)            │
  │  ┌──────────┐  ┌──────────┐  ┌────────┐│
  │  │ 导入队列 │  │ 解析引擎 │  │ 资产   ││
  │  │          │  │          │  │ 管理器 ││
  │  └──────────┘  └──────────┘  └────────┘│
  │  ┌──────────────────────────────────┐  │
  │  │      IRP 数据访问层 (DAO)        │  │
  │  └──────────────────────────────────┘  │
  └─────────────────┬───────────────────────┘
                │
  ┌─────────────────▼───────────────────────┐
  │         SQLite Database                 │
  │  ┌────────┐ ┌─────────┐ ┌──────────┐   │
  │  │ books  │ │chapters │ │  blocks  │   │
  │  └────────┘ └─────────┘ └──────────┘   │
  │  ┌──────────────┐  ┌──────────────┐    │
  │  │ blocks_fts   │  │ asset_map    │    │
  │  └──────────────┘  └──────────────┘    │
  └─────────────────────────────────────────┘

  ## IRP 数据模型

  ### 核心概念
  IRP (Intermediate Reading Representation) 是一种中间表示格式，用于统一存储不同格式的文档内容。

  ### 数据结构

  #### TextRun
  表示一段连续的文本及其样式标记。

  ```rust
  pub struct TextRun {
      pub text: String,        // 文本内容
      pub marks: Vec<TextMark>, // 样式标记
  }

  TextMark

  - 表示文本的样式标记（加粗、斜体、链接等）。

  pub struct TextMark {
      pub mark_type: MarkType,  // 标记类型
      pub start: usize,         // 起始位置
      pub end: usize,           // 结束位置
      pub attributes: Option<HashMap<String, String>>, // 额外属性
  }

  Block

  - 表示文档的基本单元（段落、标题、图片等）。

  pub struct Block {
      pub id: i32,
      pub chapter_id: i32,
      pub block_index: i32,
      pub block_type: String,  // "paragraph", "heading", "image", "code"
      pub runs: Vec<TextRun>,
  }

  Parser 扩展指南

  添加新的解析器

    a. 创建新的解析器文件 src-tauri/src/parser/xxx_parser.rs
    b. 实现 Parser trait
    c. 在 ParserRouter 中注册

  示例：

  use super::*;

  #[derive(Clone)]
  pub struct MyParser;

  impl Parser for MyParser {
      fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
          // 实现解析逻辑
          todo!()
      }

      fn get_quality(&self) -> ParseQuality {
          ParseQuality::Native
      }

      fn supported_extensions(&self) -> Vec<&str> {
          vec!["myformat"]
      }
  }

  API 文档

  Tauri Commands

  import_book

  导入书籍文件。

  #[tauri::command]
  async fn import_book(app: AppHandle, file_path: String) -> Result<i32, String>

  参数：
    - file_path: 文件路径

  返回：
    - book_id: 书籍 ID

  get_chapter_content

  获取章节内容。

  #[tauri::command]
  fn get_chapter_content(app: AppHandle, book_id: i32, chapter_id: i32) -> Result<String, String>

  参数：
    - book_id: 书籍 ID
    - chapter_id: 章节 ID

  返回：
    - HTML 格式的章节内容

  search_books

  全文搜索。

  #[tauri::command]
  fn search_books(app: AppHandle, query: String, book_id: Option<i32>) -> Result<Vec<SearchResult>, String>

  参数：
    - query: 搜索关键词
    - book_id: 可选，限定搜索范围

  返回：
    - 搜索结果列表

  数据库 Schema

  books 表

  CREATE TABLE books (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      author TEXT,
      file_path TEXT NOT NULL UNIQUE,
      cover_image TEXT,
      parse_status TEXT DEFAULT 'pending',
      parse_quality TEXT DEFAULT 'native',
      total_blocks INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  chapters 表

  CREATE TABLE chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      chapter_index INTEGER NOT NULL,
      confidence_level TEXT DEFAULT 'explicit',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
  );

  blocks 表

  CREATE TABLE blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      block_index INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      runs_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  性能优化建议

  数据库优化

    - 使用事务批量插入数据
    - 合理使用索引
    - 定期执行 VACUUM 清理数据库

  前端优化

    - 使用虚拟滚动处理大量内容
    - 图片懒加载
    - 组件 memo 化避免重复渲染

  内存管理

    - 及时释放不用的资源
    - 使用流式处理大文件
    - 限制并发任务数量

  - 创建架构图（使用 draw.io 或 mermaid）
  - 添加代码注释
  - 创建 API 参考文档

  验收标准:
  - 新开发者能快速上手
  - 代码注释完整
  - 架构图清晰
  - API 文档准确

  预计工作量: 1.5 天

  ---
  任务依赖关系总览

  依赖关系图

  阶段1: 基础设施 (Foundation)
  ├─ T-1.1.1 (设计 IRP 数据模型) [无依赖]
  ├─ T-1.1.2 (数据库迁移) ← [T-1.1.1]
  ├─ T-1.1.3 (IRP DAO) ← [T-1.1.2]
  ├─ T-1.2.1 (图片提取) ← [T-1.1.2]
  └─ T-1.2.2 (资产清理) ← [T-1.2.1]

  阶段2: 解析引擎 (Parser Engine)
  ├─ T-2.1.1 (Parser 接口) ← [T-1.1.3]
  ├─ T-2.1.2 (EPUB 解析器) ← [T-2.1.1, T-1.2.1]
  ├─ T-2.1.3 (TXT 解析器) ← [T-2.1.1]
  ├─ T-2.1.4 (MD 解析器) ← [T-2.1.1]
  ├─ T-2.1.5 (PDF 解析器) ← [T-2.1.1]
  ├─ T-2.2.1 (显式章节识别) ← [T-2.1.2, T-2.1.3, T-2.1.4]
  ├─ T-2.2.2 (结构性推断) ← [T-2.2.1]
  └─ T-2.2.3 (线性模式) ← [T-2.2.2]

  阶段3: 异步导入 (Async Import)
  ├─ T-3.1.1 (任务队列) ← [T-2.1.2]
  ├─ T-3.1.2 (异步导入命令) ← [T-3.1.1, T-2.1.1]
  ├─ T-3.1.3 (前端进度显示) ← [T-3.1.2]
  ├─ T-3.2.1 (错误处理) ← [T-3.1.2]
  └─ T-3.2.2 (重试机制) ← [T-3.2.1]

  阶段4: 阅读器适配 (Reader Integration)
  ├─ T-4.1.1 (章节列表数据源) ← [T-1.1.3, T-3.1.2]
  ├─ T-4.1.2 (章节内容渲染) ← [T-4.1.1]
  ├─ T-4.1.3 (图片路径解析) ← [T-4.1.2, T-1.2.1]
  ├─ T-4.2.1 (Block 级进度记录) ← [T-4.1.2]
  └─ T-4.2.2 (前端进度同步) ← [T-4.2.1]

  阶段5: 全文检索 (Full-Text Search)
  ├─ T-5.1.1 (启用 FTS5) ← [T-1.1.3]
  ├─ T-5.1.2 (渐进式索引构建) ← [T-5.1.1, T-3.1.2]
  ├─ T-5.1.3 (全文搜索命令) ← [T-5.1.2]
  └─ T-5.2.1 (搜索界面) ← [T-5.1.3]

  阶段6: 测试与优化 (Testing & Optimization)
  ├─ T-6.1.1 (Parser 单元测试) ← [T-2.1.2, T-2.1.3, T-2.1.4]
  ├─ T-6.1.2 (IRP 数据层测试) ← [T-1.1.3]
  ├─ T-6.2.1 (端到端导入测试) ← [T-3.1.2, T-4.1.2]
  ├─ T-6.3.1 (数据库查询优化) ← [T-4.1.2, T-5.1.3]
  └─ T-6.3.2 (前端渲染优化) ← [T-4.1.2]

  阶段7: 文档与部署 (Documentation & Deployment)
  ├─ T-7.1.1 (用户手册) ← [T-6.2.1]
  └─ T-7.2.1 (架构文档) ← [T-6.1.2]

  ---
  实施时间线估算

  按阶段划分

  | 阶段              | 任务数 | 预计工作量 | 说明                 |
  |-------------------|--------|------------|----------------------|
  | 阶段1: 基础设施   | 5      | 3.5 天     | 数据库和资产管理     |
  | 阶段2: 解析引擎   | 8      | 8.5 天     | 多格式解析器开发     |
  | 阶段3: 异步导入   | 5      | 4.5 天     | 后台任务和错误处理   |
  | 阶段4: 阅读器适配 | 5      | 3.5 天     | 数据源切换和进度管理 |
  | 阶段5: 全文检索   | 4      | 3.5 天     | FTS5 索引和搜索 UI   |
  | 阶段6: 测试与优化 | 5      | 6.5 天     | 测试和性能优化       |
  | 阶段7: 文档与部署 | 2      | 2.5 天     | 文档编写             |
  | 总计              | 34     | 32 天      | 约 6-7 周            |

  关键路径

  最长依赖链（关键路径）：
  T-1.1.1 → T-1.1.2 → T-1.1.3 → T-2.1.1 → T-2.1.2 → T-3.1.1 → T-3.1.2 → T-4.1.1 → T-4.1.2 → T-6.2.1

  关键路径总时长：约 11 天

  并行开发建议

  可以并行开发的任务组：

  第一批（基础设施完成后）:
  - T-2.1.2 (EPUB 解析器)
  - T-2.1.3 (TXT 解析器)
  - T-2.1.4 (MD 解析器)
  - T-1.2.1 (图片提取)

  第二批（解析器完成后）:
  - T-2.2.1 (显式章节识别)
  - T-3.1.1 (任务队列)
  - T-5.1.1 (启用 FTS5)

  第三批（核心功能完成后）:
  - T-6.1.1 (Parser 单元测试)
  - T-6.1.2 (IRP 数据层测试)
  - T-6.3.1 (数据库查询优化)
  - T-6.3.2 (前端渲染优化)

  ---
  风险评估与缓解措施

  高风险项

  | 风险                | 影响 | 概率 | 缓解措施                            |
  |---------------------|------|------|-------------------------------------|
  | PDF 解析质量不稳定  | 高   | 高   | 明确标记为 Light 质量，提供降级方案 |
  | 大文件导入性能问题  | 中   | 中   | 实现流式处理，限制并发数            |
  | FTS5 中文分词效果差 | 中   | 中   | 考虑集成 jieba 分词库               |
  | 数据库迁移失败      | 高   | 低   | 完善备份和回滚机制                  |

  中风险项

  | 风险             | 影响 | 概率 | 缓解措施                   |
  |------------------|------|------|----------------------------|
  | 章节识别准确率低 | 中   | 中   | 三层回退机制，允许手动调整 |
  | 图片路径解析问题 | 中   | 低   | 完善测试，提供占位符       |
  | 前端渲染性能不足 | 中   | 低   | 虚拟滚动，懒加载           |

  ---
  验收标准总览

  功能性验收

  - 支持 EPUB、TXT、MD、PDF 四种格式导入
  - 章节识别准确率 > 85%
  - 图片正确提取和显示
  - 阅读进度准确保存和恢复
  - 全文搜索功能正常
  - 错误处理完善，用户体验友好

  性能验收

  - 1MB EPUB 解析 < 2秒
  - 10万字书籍索引构建 < 5秒
  - 章节加载 < 200ms
  - 搜索响应 < 100ms
  - 10000 个 Block 流畅滚动
  - 内存占用 < 200MB

  质量验收

  - 单元测试覆盖率 > 80%
  - 所有集成测试通过
  - 无严重 Bug
  - 代码审查通过
  - 文档完整

  ---
  后续优化方向

  短期优化（1-2 个月）

  1. 增强 PDF 支持
    - 集成 OCR 支持扫描版 PDF
    - 改进 PDF 章节识别
  2. 改进中文分词
    - 集成 jieba 分词库
    - 提升搜索准确率
  3. 用户体验优化
    - 添加阅读主题切换
    - 支持字体大小调整
    - 添加夜间模式

  中期优化（3-6 个月）

  1. 支持更多格式
    - MOBI 格式
    - AZW3 格式
    - DOCX 格式
  2. 云同步功能
    - 阅读进度云同步
    - 书籍云备份
  3. AI 增强功能
    - 智能摘要
    - 自动标签
    - 相关推荐

  长期规划（6-12 个月）

  1. 移动端支持
    - iOS 应用
    - Android 应用
    - 跨平台同步
  2. 社区功能
    - 笔记分享
    - 书评系统
    - 阅读统计

  ---
  附录

  A. 术语表

  | 术语     | 说明                                                  |
  |----------|-------------------------------------------------------|
  | IRP      | Intermediate Reading Representation，中间阅读表示格式 |
  | FTS5     | SQLite 的全文搜索扩展                                 |
  | Block    | 文档的基本单元（段落、标题等）                        |
  | TextRun  | 一段连续的文本及其样式                                |
  | TextMark | 文本样式标记（加粗、斜体等）                          |
  | Parser   | 文档解析器                                            |
  | DAO      | Data Access Object，数据访问对象                      |

  B. 参考资源

  - https://www.sqlite.org/fts5.html
  - https://tauri.app/
  - https://www.w3.org/publishing/epub3/
  - https://rust-lang.github.io/async-book/

  C. 联系方式

  - 项目仓库: [GitHub 链接]
  - 问题反馈: [Issues 链接]
  - 技术讨论: [Discord/论坛链接]

  ---
  文档版本: v1.0
  最后更新: 2026-01-07
  维护者: DeepReader 开发团队

  ---

  完整的实施计划文档已经输出完毕！这份文档包含了：

  1. **7 个阶段**，共 **34 个任务**
  2. 每个任务都有详细的实施内容、代码示例和验收标准
  3. 完整的依赖关系图
  4. 时间线估算（约 32 天 / 6-7 周）
  5. 风险评估和缓解措施
  6. 后续优化方向