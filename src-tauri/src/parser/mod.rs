use rusqlite::Connection;
use std::path::Path;
use std::collections::HashMap;
use serde::{Serialize, Deserialize};

// 子模块声明
pub mod epub_parser;
pub mod txt_parser;
pub mod md_parser;
pub mod pdf_parser;
pub mod chapter_detector;

/// 解析质量等级
///
/// 用于标识不同格式的解析质量和可靠性
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum ParseQuality {
    /// 原生结构（如 HTML/EPUB）- 最高质量
    Native,
    /// 文本可提取但结构不稳定（如 PDF）- 中等质量
    Light,
    /// 尽力而为（如扫描件识别预留）- 实验性质量
    Experimental,
}

/// 章节数据
///
/// 表示解析后的一个章节，包含标题、内容块和置信度
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterData {
    /// 章节标题
    pub title: String,
    /// 章节内容块列表
    pub blocks: Vec<BlockData>,
    /// 章节识别置信度：explicit（显式）、inferred（推断）、linear（线性）
    pub confidence: String,
    /// 原始 HTML 内容（可选，用于 EPUB 等格式）
    pub raw_html: Option<String>,
    /// 渲染模式："html" 或 "irp"
    pub render_mode: String,
}

/// 内容块数据
///
/// 表示文档的基本单元（段落、标题、图片等）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockData {
    /// 块类型：paragraph（段落）、heading（标题）、image（图片）、code（代码）
    pub block_type: String,
    /// 文本运行列表（包含文本和样式标记）
    pub runs: Vec<crate::irp::TextRun>,
}

/// 解析结果
///
/// 包含解析后的所有章节、总块数和解析质量
#[derive(Debug, Clone)]
pub struct ParseResult {
    /// 解析得到的章节列表
    pub chapters: Vec<ChapterData>,
    /// 总内容块数量
    pub total_blocks: usize,
    /// 解析质量等级
    pub quality: ParseQuality,
}

/// Parser trait
///
/// 所有格式解析器必须实现此 trait
pub trait Parser: Send + Sync {
    /// 解析文件
    ///
    /// # 参数
    /// - `file_path`: 要解析的文件路径
    /// - `book_id`: 书籍 ID
    /// - `conn`: 数据库连接
    ///
    /// # 返回
    /// 解析结果，包含章节、块和质量信息
    fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String>;

    /// 获取解析质量等级
    fn get_quality(&self) -> ParseQuality;

    /// 获取支持的文件扩展名列表
    fn supported_extensions(&self) -> Vec<&str>;
}

/// Parser 路由器
///
/// 根据文件扩展名路由到对应的解析器
pub struct ParserRouter {
    /// 扩展名到解析器的映射
    parsers: HashMap<String, Box<dyn Parser>>,
}

impl ParserRouter {
    /// 创建新的路由器实例
    ///
    /// 注册所有可用的解析器
    pub fn new() -> Self {
        let mut parsers: HashMap<String, Box<dyn Parser>> = HashMap::new();

        // 注册 EPUB 解析器
        let epub = Box::new(epub_parser::EpubParser::new());
        for ext in epub.supported_extensions() {
            parsers.insert(ext.to_string(), epub.clone());
        }

        // 注册 TXT 解析器
        let txt = Box::new(txt_parser::TxtParser::new());
        for ext in txt.supported_extensions() {
            parsers.insert(ext.to_string(), txt.clone());
        }

        // 注册 Markdown 解析器
        let md = Box::new(md_parser::MarkdownParser::new());
        for ext in md.supported_extensions() {
            parsers.insert(ext.to_string(), md.clone());
        }

        // 注册 PDF 解析器
        let pdf = Box::new(pdf_parser::PdfParser::new());
        for ext in pdf.supported_extensions() {
            parsers.insert(ext.to_string(), pdf.clone());
        }

        Self { parsers }
    }

    /// 根据文件路径路由到对应的解析器
    ///
    /// # 参数
    /// - `file_path`: 文件路径
    ///
    /// # 返回
    /// 对应的解析器引用，如果不支持该格式则返回错误
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

    /// 获取所有支持的文件扩展名
    pub fn supported_extensions(&self) -> Vec<String> {
        self.parsers.keys().cloned().collect()
    }

    /// 检查是否支持指定的文件扩展名
    pub fn supports(&self, extension: &str) -> bool {
        self.parsers.contains_key(&extension.to_lowercase())
    }
}

impl Default for ParserRouter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 测试用的模拟解析器
    #[derive(Clone)]
    struct MockParser {
        extensions: Vec<&'static str>,
        quality: ParseQuality,
    }

    impl Parser for MockParser {
        fn parse(&self, _file_path: &Path, _book_id: i32, _conn: &Connection) -> Result<ParseResult, String> {
            Ok(ParseResult {
                chapters: vec![],
                total_blocks: 0,
                quality: self.quality.clone(),
            })
        }

        fn get_quality(&self) -> ParseQuality {
            self.quality.clone()
        }

        fn supported_extensions(&self) -> Vec<&str> {
            self.extensions.clone()
        }
    }

    #[test]
    fn test_parse_quality_equality() {
        assert_eq!(ParseQuality::Native, ParseQuality::Native);
        assert_eq!(ParseQuality::Light, ParseQuality::Light);
        assert_ne!(ParseQuality::Native, ParseQuality::Light);
    }

    #[test]
    fn test_parser_router_creation() {
        let router = ParserRouter::new();
        assert_eq!(router.supported_extensions().len(), 5); // EPUB, TXT, MD, MARKDOWN, PDF 解析器已注册
        assert!(router.supports("epub"));
        assert!(router.supports("txt"));
        assert!(router.supports("md"));
        assert!(router.supports("markdown"));
        assert!(router.supports("pdf"));
    }

    #[test]
    fn test_parser_router_epub_support() {
        let router = ParserRouter::new();
        let path = Path::new("test.epub");
        let result = router.route(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_router_txt_support() {
        let router = ParserRouter::new();
        let path = Path::new("test.txt");
        let result = router.route(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_router_md_support() {
        let router = ParserRouter::new();
        let path = Path::new("test.md");
        let result = router.route(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_router_markdown_support() {
        let router = ParserRouter::new();
        let path = Path::new("test.markdown");
        let result = router.route(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_router_pdf_support() {
        let router = ParserRouter::new();
        let path = Path::new("test.pdf");
        let result = router.route(&path);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parser_router_unsupported_format() {
        let router = ParserRouter::new();
        let path = Path::new("test.unknown");
        let result = router.route(&path);
        assert!(result.is_err());
        if let Err(err) = result {
            assert!(err.contains("不支持的文件格式"));
        }
    }

    #[test]
    fn test_parser_router_no_extension() {
        let router = ParserRouter::new();
        let path = Path::new("test");
        let result = router.route(&path);
        assert!(result.is_err());
        if let Err(err) = result {
            assert!(err.contains("无法识别文件扩展名"));
        }
    }

    #[test]
    fn test_chapter_data_creation() {
        let chapter = ChapterData {
            title: "第一章".to_string(),
            blocks: vec![],
            confidence: "explicit".to_string(),
            raw_html: None,
            render_mode: "irp".to_string(),
        };

        assert_eq!(chapter.title, "第一章");
        assert_eq!(chapter.blocks.len(), 0);
        assert_eq!(chapter.confidence, "explicit");
        assert_eq!(chapter.render_mode, "irp");
    }

    #[test]
    fn test_block_data_creation() {
        let block = BlockData {
            block_type: "paragraph".to_string(),
            runs: vec![],
        };

        assert_eq!(block.block_type, "paragraph");
        assert_eq!(block.runs.len(), 0);
    }

    #[test]
    fn test_parse_result_creation() {
        let result = ParseResult {
            chapters: vec![],
            total_blocks: 0,
            quality: ParseQuality::Native,
        };

        assert_eq!(result.chapters.len(), 0);
        assert_eq!(result.total_blocks, 0);
        assert_eq!(result.quality, ParseQuality::Native);
    }
}
