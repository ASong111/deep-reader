use super::*;
use encoding_rs::*;
use std::fs;
use crate::irp::TextRun;

/// TXT 解析器
///
/// 支持纯文本文件的解析，自动检测编码（UTF-8, GBK 等）
#[derive(Clone)]
pub struct TxtParser;

impl TxtParser {
    /// 创建新的 TXT 解析器实例
    pub fn new() -> Self {
        Self
    }

    /// 检测文件编码
    ///
    /// 尝试检测文件的字符编码，支持 UTF-8、GBK 等常见编码
    ///
    /// # 参数
    /// - `bytes`: 文件字节数据
    ///
    /// # 返回
    /// 检测到的编码
    fn detect_encoding(&self, bytes: &[u8]) -> &'static Encoding {
        // 1. 检查 BOM (Byte Order Mark)
        if let Some((encoding, _bom_length)) = Encoding::for_bom(bytes) {
            return encoding;
        }

        // 2. 尝试 UTF-8 解码
        if let Ok(_) = std::str::from_utf8(bytes) {
            return UTF_8;
        }

        // 3. 检测是否为 GBK
        if self.looks_like_gbk(bytes) {
            return GBK;
        }

        // 4. 默认使用 UTF-8
        UTF_8
    }

    /// 检测字节序列是否像 GBK 编码
    ///
    /// GBK 编码特征：
    /// - 第一字节范围：0x81-0xFE
    /// - 第二字节范围：0x40-0xFE
    fn looks_like_gbk(&self, bytes: &[u8]) -> bool {
        let mut gbk_pairs = 0;
        let mut total_pairs = 0;

        let mut i = 0;
        while i < bytes.len().saturating_sub(1) {
            let b1 = bytes[i];
            let b2 = bytes[i + 1];

            // 检查是否为 ASCII 字符
            if b1 < 0x80 {
                i += 1;
                continue;
            }

            total_pairs += 1;

            // 检查是否符合 GBK 编码规则
            if (0x81..=0xFE).contains(&b1) && (0x40..=0xFE).contains(&b2) {
                gbk_pairs += 1;
                i += 2; // 跳过这一对字节
            } else {
                i += 1;
            }
        }

        // 如果超过 50% 的非 ASCII 字节对符合 GBK 规则，则认为是 GBK
        total_pairs > 0 && (gbk_pairs as f32 / total_pairs as f32) > 0.5
    }

    /// 分割文本为段落
    ///
    /// 根据空行（连续的换行符）分割段落
    ///
    /// # 参数
    /// - `content`: 文本内容
    ///
    /// # 返回
    /// 段落列表
    fn split_into_paragraphs(&self, content: &str) -> Vec<String> {
        let mut paragraphs = Vec::new();
        let mut current_paragraph = String::new();

        for line in content.lines() {
            let trimmed = line.trim();

            if trimmed.is_empty() {
                // 空行，结束当前段落
                if !current_paragraph.trim().is_empty() {
                    paragraphs.push(current_paragraph.trim().to_string());
                    current_paragraph.clear();
                }
            } else {
                // 非空行，添加到当前段落
                if !current_paragraph.is_empty() {
                    current_paragraph.push(' ');
                }
                current_paragraph.push_str(trimmed);
            }
        }

        // 添加最后一个段落
        if !current_paragraph.trim().is_empty() {
            paragraphs.push(current_paragraph.trim().to_string());
        }

        paragraphs
    }

    /// 创建段落块
    ///
    /// 将段落文本转换为 BlockData
    fn create_paragraph_block(&self, text: String) -> BlockData {
        BlockData {
            block_type: "paragraph".to_string(),
            runs: vec![TextRun {
                text,
                marks: vec![],
            }],
        }
    }
}

impl Parser for TxtParser {
    fn parse(&self, file_path: &Path, _book_id: i32, _conn: &Connection) -> Result<ParseResult, String> {
        // 1. 读取文件字节
        let bytes = fs::read(file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        // 2. 检测编码
        let encoding = self.detect_encoding(&bytes);

        // 3. 解码为字符串
        let (content, _encoding_used, had_errors) = encoding.decode(&bytes);
        if had_errors {
            eprintln!("警告：文件解码时出现错误，可能存在乱码");
        }

        // 4. 分割为段落
        let paragraphs = self.split_into_paragraphs(&content);

        // 5. 创建 Blocks
        let blocks: Vec<BlockData> = paragraphs
            .into_iter()
            .map(|p| self.create_paragraph_block(p))
            .collect();

        let total_blocks = blocks.len();

        // 6. 使用章节检测器进行三层回退式章节识别
        let detector = super::chapter_detector::ChapterDetector::new();
        let chapters = detector.detect(&blocks);

        Ok(ParseResult {
            chapters,
            total_blocks,
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

impl Default for TxtParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_txt_parser_creation() {
        let parser = TxtParser::new();
        assert_eq!(parser.get_quality(), ParseQuality::Light);
        assert_eq!(parser.supported_extensions(), vec!["txt"]);
    }

    #[test]
    fn test_detect_utf8_encoding() {
        let parser = TxtParser::new();
        let utf8_bytes = "测试文本".as_bytes();
        let encoding = parser.detect_encoding(utf8_bytes);
        assert_eq!(encoding, UTF_8);
    }

    #[test]
    fn test_detect_ascii_encoding() {
        let parser = TxtParser::new();
        let ascii_bytes = b"Hello World";
        let encoding = parser.detect_encoding(ascii_bytes);
        assert_eq!(encoding, UTF_8); // ASCII 兼容 UTF-8
    }

    #[test]
    fn test_split_into_paragraphs() {
        let parser = TxtParser::new();
        let content = "第一段文本。\n这是第一段的第二行。\n\n第二段文本。\n\n第三段文本。";
        let paragraphs = parser.split_into_paragraphs(content);

        assert_eq!(paragraphs.len(), 3);
        assert_eq!(paragraphs[0], "第一段文本。 这是第一段的第二行。");
        assert_eq!(paragraphs[1], "第二段文本。");
        assert_eq!(paragraphs[2], "第三段文本。");
    }

    #[test]
    fn test_split_single_paragraph() {
        let parser = TxtParser::new();
        let content = "这是一段没有空行的文本。";
        let paragraphs = parser.split_into_paragraphs(content);

        assert_eq!(paragraphs.len(), 1);
        assert_eq!(paragraphs[0], "这是一段没有空行的文本。");
    }

    #[test]
    fn test_split_with_multiple_empty_lines() {
        let parser = TxtParser::new();
        let content = "第一段。\n\n\n\n第二段。";
        let paragraphs = parser.split_into_paragraphs(content);

        assert_eq!(paragraphs.len(), 2);
        assert_eq!(paragraphs[0], "第一段。");
        assert_eq!(paragraphs[1], "第二段。");
    }

    #[test]
    fn test_create_paragraph_block() {
        let parser = TxtParser::new();
        let block = parser.create_paragraph_block("测试段落".to_string());

        assert_eq!(block.block_type, "paragraph");
        assert_eq!(block.runs.len(), 1);
        assert_eq!(block.runs[0].text, "测试段落");
        assert_eq!(block.runs[0].marks.len(), 0);
    }

    #[test]
    fn test_looks_like_gbk() {
        let parser = TxtParser::new();

        // GBK 编码的 "测试" (0xB2E2 0xCAD4)
        let gbk_bytes = vec![0xB2, 0xE2, 0xCA, 0xD4];
        assert!(parser.looks_like_gbk(&gbk_bytes));

        // ASCII 文本
        let ascii_bytes = b"Hello World";
        assert!(!parser.looks_like_gbk(ascii_bytes));

        // 纯 ASCII 不应该被识别为 GBK
        let pure_ascii = b"This is a test";
        assert!(!parser.looks_like_gbk(pure_ascii));
    }

    #[test]
    fn test_empty_file() {
        let parser = TxtParser::new();
        let content = "";
        let paragraphs = parser.split_into_paragraphs(content);

        assert_eq!(paragraphs.len(), 0);
    }

    #[test]
    fn test_only_whitespace() {
        let parser = TxtParser::new();
        let content = "   \n\n   \n   ";
        let paragraphs = parser.split_into_paragraphs(content);

        assert_eq!(paragraphs.len(), 0);
    }
}
