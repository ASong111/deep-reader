use super::*;
use pulldown_cmark::{Parser as MdParser, Event, Tag, HeadingLevel};
use std::fs;
use crate::irp::{TextRun, TextMark, MarkType};
use std::collections::HashMap;

/// Markdown 解析器
///
/// 支持标准 Markdown 语法的解析，自动识别章节结构
#[derive(Clone)]
pub struct MarkdownParser;

impl MarkdownParser {
    /// 创建新的 Markdown 解析器实例
    pub fn new() -> Self {
        Self
    }

    /// 解析 Markdown 内容为章节列表
    ///
    /// # 参数
    /// - `content`: Markdown 文本内容
    ///
    /// # 返回
    /// 章节数据列表
    fn parse_markdown(&self, content: &str) -> Result<Vec<ChapterData>, String> {
        let parser = MdParser::new(content);

        let mut chapters: Vec<ChapterData> = Vec::new();
        let mut current_chapter: Option<ChapterData> = None;
        let mut current_text = String::new();
        let mut current_marks: Vec<MarkType> = Vec::new();
        let mut heading_level = 0;

        for event in parser {
            match event {
                // 标题开始
                Event::Start(Tag::Heading(level, _, _)) => {
                    heading_level = match level {
                        HeadingLevel::H1 => 1,
                        HeadingLevel::H2 => 2,
                        HeadingLevel::H3 => 3,
                        HeadingLevel::H4 => 4,
                        HeadingLevel::H5 => 5,
                        HeadingLevel::H6 => 6,
                    };
                    current_text.clear();
                    current_marks.clear();
                }
                // 标题结束
                Event::End(Tag::Heading(_, _, _)) => {
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
                            raw_html: None,
                            render_mode: "irp".to_string(),
                            heading_level: Some(heading_level as u32),
                            anchor_id: None,
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
                // 段落开始
                Event::Start(Tag::Paragraph) => {
                    current_text.clear();
                    current_marks.clear();
                }
                // 段落结束
                Event::End(Tag::Paragraph) => {
                    if let Some(ref mut chapter) = current_chapter {
                        if !current_text.trim().is_empty() {
                            chapter.blocks.push(BlockData {
                                block_type: "paragraph".to_string(),
                                runs: vec![TextRun {
                                    text: current_text.clone(),
                                    marks: self.create_marks(&current_text, &current_marks),
                                }],
                            });
                        }
                    }
                    current_text.clear();
                    current_marks.clear();
                }
                // 代码块开始
                Event::Start(Tag::CodeBlock(_)) => {
                    current_text.clear();
                }
                // 代码块结束
                Event::End(Tag::CodeBlock(_)) => {
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
                // 列表开始
                Event::Start(Tag::List(_)) => {
                    // 列表作为段落处理
                }
                Event::End(Tag::List(_)) => {}
                // 列表项
                Event::Start(Tag::Item) => {
                    current_text.push_str("• ");
                }
                Event::End(Tag::Item) => {
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
                // 加粗
                Event::Start(Tag::Strong) => {
                    current_marks.push(MarkType::Bold);
                }
                Event::End(Tag::Strong) => {
                    current_marks.retain(|m| !matches!(m, MarkType::Bold));
                }
                // 斜体
                Event::Start(Tag::Emphasis) => {
                    current_marks.push(MarkType::Italic);
                }
                Event::End(Tag::Emphasis) => {
                    current_marks.retain(|m| !matches!(m, MarkType::Italic));
                }
                // 删除线
                Event::Start(Tag::Strikethrough) => {
                    current_marks.push(MarkType::Strikethrough);
                }
                Event::End(Tag::Strikethrough) => {
                    current_marks.retain(|m| !matches!(m, MarkType::Strikethrough));
                }
                // 链接
                Event::Start(Tag::Link(_, dest_url, _)) => {
                    // 记录链接，但在文本中处理
                    let mut attrs = HashMap::new();
                    attrs.insert("href".to_string(), dest_url.to_string());
                    // 暂时存储链接信息
                }
                Event::End(Tag::Link(_, _, _)) => {}
                // 图片
                Event::Start(Tag::Image(_, dest_url, _)) => {
                    if let Some(ref mut chapter) = current_chapter {
                        chapter.blocks.push(BlockData {
                            block_type: "image".to_string(),
                            runs: vec![TextRun {
                                text: dest_url.to_string(),
                                marks: vec![],
                            }],
                        });
                    }
                }
                Event::End(Tag::Image(_, _, _)) => {}
                // 文本
                Event::Text(text) => {
                    current_text.push_str(&text);
                }
                // 行内代码
                Event::Code(code) => {
                    current_text.push_str(&code);
                    // 添加代码标记
                    current_marks.push(MarkType::Code);
                }
                // 换行
                Event::SoftBreak => {
                    current_text.push(' ');
                }
                Event::HardBreak => {
                    current_text.push('\n');
                }
                // 其他事件
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
                raw_html: None,
                render_mode: "irp".to_string(),
                heading_level: Some(1),
                anchor_id: None,
            });
        }

        Ok(chapters)
    }

    /// 创建文本标记
    ///
    /// 根据当前活动的标记类型创建 TextMark 列表
    fn create_marks(&self, text: &str, mark_types: &[MarkType]) -> Vec<TextMark> {
        let text_len = text.len();
        mark_types
            .iter()
            .map(|mark_type| TextMark {
                mark_type: mark_type.clone(),
                start: 0,
                end: text_len,
                attributes: None,
            })
            .collect()
    }
}

impl Parser for MarkdownParser {
    fn parse(&self, file_path: &Path, _book_id: i32, _conn: &Connection) -> Result<ParseResult, String> {
        // 读取文件内容
        let content = fs::read_to_string(file_path)
            .map_err(|e| format!("读取文件失败: {}", e))?;

        // 按 H1/H2 标题分割 Markdown 内容
        let chapters = self.split_markdown_by_headings(&content)?;
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

impl MarkdownParser {
    /// 按所有标题（H1-H6）分割 Markdown 内容
    ///
    /// 保留原始 Markdown 内容，用于前端渲染
    /// 策略：将整个文档作为一个章节，但提取所有标题信息用于目录导航
    fn split_markdown_by_headings(&self, content: &str) -> Result<Vec<ChapterData>, String> {
        let mut chapters = Vec::new();
        let lines: Vec<&str> = content.lines().collect();

        // 提取所有标题信息用于目录
        let mut heading_infos = Vec::new();

        for (line_index, line) in lines.iter().enumerate() {
            // 检查是否是任意级别的标题（H1-H6）
            let heading_level = if line.starts_with("# ") && !line.starts_with("## ") {
                Some(1)
            } else if line.starts_with("## ") && !line.starts_with("### ") {
                Some(2)
            } else if line.starts_with("### ") && !line.starts_with("#### ") {
                Some(3)
            } else if line.starts_with("#### ") && !line.starts_with("##### ") {
                Some(4)
            } else if line.starts_with("##### ") && !line.starts_with("###### ") {
                Some(5)
            } else if line.starts_with("###### ") {
                Some(6)
            } else {
                None
            };

            if let Some(level) = heading_level {
                let title = line.trim_start_matches('#').trim().to_string();
                heading_infos.push((title, level, line_index));
            }
        }

        // 如果有标题，为每个标题创建一个"虚拟章节"用于目录
        if !heading_infos.is_empty() {
            let full_content = content.to_string();

            // 为每个标题创建一个章节条目（用于目录）
            for (title, level, _) in heading_infos {
                chapters.push(ChapterData {
                    title,
                    blocks: Vec::new(),
                    confidence: "explicit".to_string(),
                    raw_html: Some(full_content.clone()), // 所有章节共享同一份完整内容
                    render_mode: "markdown".to_string(),
                    heading_level: Some(level),
                    anchor_id: None, // 锚点 ID 将在前端生成
                });
            }
        } else {
            // 如果没有标题，创建一个默认章节
            chapters.push(ChapterData {
                title: "全文".to_string(),
                blocks: Vec::new(),
                confidence: "linear".to_string(),
                raw_html: Some(content.to_string()),
                render_mode: "markdown".to_string(),
                heading_level: Some(1),
                anchor_id: None,
            });
        }

        Ok(chapters)
    }
}

impl Default for MarkdownParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_md_parser_creation() {
        let parser = MarkdownParser::new();
        assert_eq!(parser.get_quality(), ParseQuality::Native);
        assert_eq!(parser.supported_extensions(), vec!["md", "markdown"]);
    }

    #[test]
    fn test_parse_simple_markdown() {
        let parser = MarkdownParser::new();
        let content = r#"# 第一章

这是第一章的内容。

## 第二章

这是第二章的内容。
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "第一章");
        assert_eq!(chapters[1].title, "第二章");
    }

    #[test]
    fn test_parse_headings() {
        let parser = MarkdownParser::new();
        let content = r#"# 主标题

### 子标题

段落内容。
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "主标题");
        assert!(chapters[0].blocks.len() >= 1);

        // 检查是否有标题块
        let has_heading = chapters[0].blocks.iter()
            .any(|b| b.block_type == "heading");
        assert!(has_heading);
    }

    #[test]
    fn test_parse_bold_text() {
        let parser = MarkdownParser::new();
        let content = r#"# 标题

这是**加粗**文本。
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);

        // 检查是否有段落
        let has_paragraph = chapters[0].blocks.iter()
            .any(|b| b.block_type == "paragraph");
        assert!(has_paragraph);
    }

    #[test]
    fn test_parse_code_block() {
        let parser = MarkdownParser::new();
        let content = r#"# 标题

```rust
fn main() {
    println!("Hello");
}
```
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);

        // 检查是否有代码块
        let has_code = chapters[0].blocks.iter()
            .any(|b| b.block_type == "code");
        assert!(has_code);
    }

    #[test]
    fn test_parse_list() {
        let parser = MarkdownParser::new();
        let content = r#"# 标题

- 项目 1
- 项目 2
- 项目 3
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);
        assert!(chapters[0].blocks.len() >= 3);
    }

    #[test]
    fn test_parse_image() {
        let parser = MarkdownParser::new();
        let content = r#"# 标题

![图片](image.png)
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);

        // 检查是否有图片块
        let has_image = chapters[0].blocks.iter()
            .any(|b| b.block_type == "image");
        assert!(has_image);
    }

    #[test]
    fn test_no_chapters() {
        let parser = MarkdownParser::new();
        let content = "这是没有标题的文本。";

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "全文");
        assert_eq!(chapters[0].confidence, "linear");
    }

    #[test]
    fn test_multiple_h1_chapters() {
        let parser = MarkdownParser::new();
        let content = r#"# 第一章

内容1

# 第二章

内容2

# 第三章

内容3
"#;

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 3);
        assert_eq!(chapters[0].title, "第一章");
        assert_eq!(chapters[1].title, "第二章");
        assert_eq!(chapters[2].title, "第三章");
    }

    #[test]
    fn test_empty_markdown() {
        let parser = MarkdownParser::new();
        let content = "";

        let chapters = parser.parse_markdown(content).unwrap();
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "全文");
    }
}
