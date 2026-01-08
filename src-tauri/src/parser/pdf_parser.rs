use super::*;
use std::fs;
use crate::irp::TextRun;

/// PDF 解析器（基础版）
///
/// 支持纯文本 PDF 的解析，不支持扫描版 PDF
#[derive(Clone)]
pub struct PdfParser;

impl PdfParser {
    /// 创建新的 PDF 解析器实例
    pub fn new() -> Self {
        Self
    }

    /// 分割文本为段落
    ///
    /// 根据空行（连续的换行符）分割段落
    ///
    /// # 参数
    /// - `text`: 文本内容
    ///
    /// # 返回
    /// BlockData 列表
    fn split_into_blocks(&self, text: &str) -> Vec<BlockData> {
        let mut blocks = Vec::new();

        // 按双换行符分割段落
        let paragraphs: Vec<&str> = text
            .split("\n\n")
            .map(|p| p.trim())
            .filter(|p| !p.is_empty())
            .collect();

        for paragraph in paragraphs {
            // 将单个换行符替换为空格
            let text = paragraph.replace('\n', " ");

            if !text.trim().is_empty() {
                blocks.push(BlockData {
                    block_type: "paragraph".to_string(),
                    runs: vec![TextRun {
                        text,
                        marks: vec![],
                    }],
                });
            }
        }

        blocks
    }
}

impl Parser for PdfParser {
    fn parse(&self, file_path: &Path, _book_id: i32, _conn: &Connection) -> Result<ParseResult, String> {
        // 读取文件字节
        let bytes = fs::read(file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        // 提取 PDF 文本
        let text = pdf_extract::extract_text_from_mem(&bytes)
            .map_err(|e| format!("PDF 解析失败: {}。可能是扫描版 PDF，暂不支持", e))?;

        // 检查是否为扫描版 PDF（无文本内容）
        if text.trim().is_empty() {
            return Err("此 PDF 文件无法提取文本内容。\n\n可能原因：\n1. 这是扫描版 PDF（图片格式），需要 OCR 识别\n2. PDF 文件已加密或受保护\n\n建议：\n- 使用文字版 PDF\n- 或使用 OCR 工具转换后再导入".to_string());
        }

        // 分割为段落块
        let blocks = self.split_into_blocks(&text);
        let total_blocks = blocks.len();

        // 使用章节检测器进行三层回退式章节识别
        let detector = super::chapter_detector::ChapterDetector::new();
        let chapters = detector.detect(&blocks);

        Ok(ParseResult {
            chapters,
            total_blocks,
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

impl Default for PdfParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pdf_parser_creation() {
        let parser = PdfParser::new();
        assert_eq!(parser.get_quality(), ParseQuality::Light);
        assert_eq!(parser.supported_extensions(), vec!["pdf"]);
    }

    #[test]
    fn test_split_into_blocks() {
        let parser = PdfParser::new();
        let text = "第一段文本。\n这是第一段的第二行。\n\n第二段文本。\n\n第三段文本。";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].block_type, "paragraph");
        assert_eq!(blocks[0].runs[0].text, "第一段文本。 这是第一段的第二行。");
        assert_eq!(blocks[1].runs[0].text, "第二段文本。");
        assert_eq!(blocks[2].runs[0].text, "第三段文本。");
    }

    #[test]
    fn test_split_single_paragraph() {
        let parser = PdfParser::new();
        let text = "这是一段没有空行的文本。";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].runs[0].text, "这是一段没有空行的文本。");
    }

    #[test]
    fn test_split_with_multiple_empty_lines() {
        let parser = PdfParser::new();
        let text = "第一段。\n\n\n\n第二段。";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].runs[0].text, "第一段。");
        assert_eq!(blocks[1].runs[0].text, "第二段。");
    }

    #[test]
    fn test_empty_text() {
        let parser = PdfParser::new();
        let text = "";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn test_only_whitespace() {
        let parser = PdfParser::new();
        let text = "   \n\n   \n   ";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 0);
    }

    #[test]
    fn test_newline_replacement() {
        let parser = PdfParser::new();
        let text = "第一行\n第二行\n第三行";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].runs[0].text, "第一行 第二行 第三行");
    }

    #[test]
    fn test_paragraph_trimming() {
        let parser = PdfParser::new();
        let text = "  第一段  \n\n  第二段  ";
        let blocks = parser.split_into_blocks(text);

        assert_eq!(blocks.len(), 2);
        assert_eq!(blocks[0].runs[0].text, "第一段");
        assert_eq!(blocks[1].runs[0].text, "第二段");
    }
}
