use super::*;
use epub::doc::EpubDoc;
use scraper::{Html, Selector, ElementRef};
use crate::irp::{TextRun, TextMark, MarkType};
use crate::asset_manager::{AssetManager, save_asset_mapping};
use tauri::AppHandle;
use std::collections::HashMap;

/// EPUB 解析器
///
/// 支持标准 EPUB 格式的电子书解析
#[derive(Clone)]
pub struct EpubParser {
    app_handle: Option<AppHandle>,
}

impl EpubParser {
    /// 创建新的 EPUB 解析器实例
    pub fn new() -> Self {
        Self { app_handle: None }
    }

    /// 创建带有 AppHandle 的 EPUB 解析器实例（用于图片提取）
    pub fn with_app_handle(app_handle: AppHandle) -> Self {
        Self {
            app_handle: Some(app_handle),
        }
    }

    /// 解析 HTML 内容为 Blocks
    ///
    /// # 参数
    /// - `html`: HTML 字符串
    ///
    /// # 返回
    /// BlockData 列表
    fn parse_html_to_blocks(&self, html: &str) -> Result<Vec<BlockData>, String> {
        let document = Html::parse_document(html);
        let mut blocks = Vec::new();

        // 选择 body 内的所有直接子元素
        let body_selector = Selector::parse("body > *").unwrap();

        for element in document.select(&body_selector) {
            let tag_name = element.value().name();

            match tag_name {
                // 段落
                "p" => {
                    let runs = self.extract_runs_from_element(&element)?;
                    if !runs.is_empty() && !runs.iter().all(|r| r.text.trim().is_empty()) {
                        blocks.push(BlockData {
                            block_type: "paragraph".to_string(),
                            runs,
                        });
                    }
                }
                // 标题
                "h1" | "h2" | "h3" | "h4" | "h5" | "h6" => {
                    let runs = self.extract_runs_from_element(&element)?;
                    if !runs.is_empty() && !runs.iter().all(|r| r.text.trim().is_empty()) {
                        blocks.push(BlockData {
                            block_type: "heading".to_string(),
                            runs,
                        });
                    }
                }
                // 图片
                "img" => {
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
                // 代码块
                "pre" => {
                    let runs = self.extract_runs_from_element(&element)?;
                    if !runs.is_empty() {
                        blocks.push(BlockData {
                            block_type: "code".to_string(),
                            runs,
                        });
                    }
                }
                // 其他块级元素当作段落处理
                "div" | "section" | "article" => {
                    let runs = self.extract_runs_from_element(&element)?;
                    if !runs.is_empty() && !runs.iter().all(|r| r.text.trim().is_empty()) {
                        blocks.push(BlockData {
                            block_type: "paragraph".to_string(),
                            runs,
                        });
                    }
                }
                _ => {}
            }
        }

        Ok(blocks)
    }

    /// 从 HTML 内容中提取章节标题
    ///
    /// 优先从 h1-h6 标题标签提取，如果没有则尝试从第一个段落提取
    fn extract_title_from_html(&self, html: &str) -> Option<String> {
        let document = Html::parse_document(html);

        // 优先查找 h1-h6 标题
        for tag in &["h1", "h2", "h3", "h4", "h5", "h6"] {
            if let Ok(selector) = Selector::parse(tag) {
                if let Some(element) = document.select(&selector).next() {
                    let text = element.text().collect::<String>().trim().to_string();
                    if !text.is_empty() {
                        return Some(text);
                    }
                }
            }
        }

        // 如果没有标题标签，尝试从第一个段落提取
        // 很多 EPUB 书籍的章节标题是普通段落文本
        if let Ok(selector) = Selector::parse("p") {
            if let Some(element) = document.select(&selector).next() {
                let text = element.text().collect::<String>().trim().to_string();
                // 检查是否像章节标题（包含"章"、"节"、"序"等关键字，且长度合理）
                if !text.is_empty() && text.len() < 100 && self.looks_like_chapter_title(&text) {
                    return Some(text);
                }
            }
        }

        None
    }

    /// 判断文本是否看起来像章节标题
    fn looks_like_chapter_title(&self, text: &str) -> bool {
        // 检查是否包含章节相关的关键字
        let keywords = ["章", "节", "序", "前言", "后记", "附录", "Chapter", "Section"];
        keywords.iter().any(|&keyword| text.contains(keyword))
    }

    /// 检查 HTML 内容是否包含 h1 标题
    ///
    /// h1 标题通常表示主章节，而 h2-h6 表示分节
    fn is_h1_title(&self, html: &str) -> bool {
        let document = Html::parse_document(html);

        if let Ok(selector) = Selector::parse("h1") {
            document.select(&selector).next().is_some()
        } else {
            false
        }
    }

    /// 从 HTML 元素中提取 TextRun 列表
    ///
    /// 递归处理元素及其子元素，提取文本和样式标记
    fn extract_runs_from_element(&self, element: &ElementRef) -> Result<Vec<TextRun>, String> {
        let mut runs = Vec::new();
        self.extract_runs_recursive(element, &mut runs, &Vec::new())?;

        // 合并相邻的相同样式的 runs
        let merged_runs = self.merge_runs(runs);

        Ok(merged_runs)
    }

    /// 递归提取文本运行
    ///
    /// # 参数
    /// - `element`: 当前元素
    /// - `runs`: 累积的 runs 列表
    /// - `current_marks`: 当前活动的样式标记类型
    fn extract_runs_recursive(
        &self,
        element: &ElementRef,
        runs: &mut Vec<TextRun>,
        current_marks: &Vec<MarkType>,
    ) -> Result<(), String> {
        let tag_name = element.value().name();

        // 确定当前元素添加的新标记
        let mut new_marks = current_marks.clone();
        match tag_name {
            "strong" | "b" => new_marks.push(MarkType::Bold),
            "em" | "i" => new_marks.push(MarkType::Italic),
            "u" => new_marks.push(MarkType::Underline),
            "s" | "strike" | "del" => new_marks.push(MarkType::Strikethrough),
            "code" => new_marks.push(MarkType::Code),
            _ => {}
        }

        // 处理链接
        let link_href = if tag_name == "a" {
            element.value().attr("href").map(|s| s.to_string())
        } else {
            None
        };

        // 遍历子节点
        for child in element.children() {
            if let Some(text) = child.value().as_text() {
                // 文本节点
                let text_content = text.to_string();
                if !text_content.is_empty() {
                    let mut marks = Vec::new();
                    let text_len = text_content.len();

                    // 添加样式标记
                    for mark_type in &new_marks {
                        marks.push(TextMark {
                            mark_type: mark_type.clone(),
                            start: 0,
                            end: text_len,
                            attributes: None,
                        });
                    }

                    // 添加链接标记
                    if let Some(ref href) = link_href {
                        let mut attrs = HashMap::new();
                        attrs.insert("href".to_string(), href.clone());
                        marks.push(TextMark {
                            mark_type: MarkType::Link,
                            start: 0,
                            end: text_len,
                            attributes: Some(attrs),
                        });
                    }

                    runs.push(TextRun {
                        text: text_content,
                        marks,
                    });
                }
            } else if let Some(child_element) = ElementRef::wrap(child) {
                // 元素节点，递归处理
                self.extract_runs_recursive(&child_element, runs, &new_marks)?;
            }
        }

        Ok(())
    }

    /// 合并相邻的相同样式的 runs
    fn merge_runs(&self, runs: Vec<TextRun>) -> Vec<TextRun> {
        if runs.is_empty() {
            return runs;
        }

        let mut merged = Vec::new();
        let mut current = runs[0].clone();

        for run in runs.into_iter().skip(1) {
            // 检查样式是否相同
            if self.marks_equal(&current.marks, &run.marks) {
                // 合并文本
                current.text.push_str(&run.text);
                // 更新标记的结束位置
                for mark in &mut current.marks {
                    mark.end = current.text.len();
                }
            } else {
                // 样式不同，保存当前 run 并开始新的
                merged.push(current);
                current = run;
            }
        }

        merged.push(current);
        merged
    }

    /// 检查两个标记列表是否相等
    fn marks_equal(&self, marks1: &[TextMark], marks2: &[TextMark]) -> bool {
        if marks1.len() != marks2.len() {
            return false;
        }

        // 简化比较：只比较标记类型
        let types1: Vec<_> = marks1.iter().map(|m| &m.mark_type).collect();
        let types2: Vec<_> = marks2.iter().map(|m| &m.mark_type).collect();

        types1 == types2
    }

    /// 提取并保存图片资产
    ///
    /// # 参数
    /// - `blocks`: 内容块列表
    /// - `doc`: EPUB 文档
    /// - `book_id`: 书籍 ID
    /// - `conn`: 数据库连接
    fn extract_images(
        &self,
        mut blocks: Vec<BlockData>,
        doc: &mut EpubDoc<std::io::BufReader<std::fs::File>>,
        book_id: i32,
        conn: &Connection,
    ) -> Result<Vec<BlockData>, String> {
        // 如果没有 AppHandle，无法提取图片
        let app_handle = match &self.app_handle {
            Some(handle) => handle,
            None => return Ok(blocks),
        };

        let asset_manager = AssetManager::new(app_handle.clone());

        for block in &mut blocks {
            if block.block_type == "image" {
                if let Some(run) = block.runs.first_mut() {
                    let original_path = &run.text.clone();

                    // 从 EPUB 中提取图片数据
                    if let Some(image_data) = doc.get_resource_by_path(original_path) {
                        // 保存图片并获取本地路径
                        match asset_manager.extract_image(book_id, &image_data, original_path) {
                            Ok(local_path) => {
                                // 保存资产映射到数据库
                                let _ = save_asset_mapping(
                                    conn,
                                    book_id,
                                    original_path,
                                    &local_path,
                                    "image",
                                );

                                // 更新路径为本地路径
                                run.text = local_path;
                            }
                            Err(e) => {
                                eprintln!("提取图片失败 {}: {}", original_path, e);
                            }
                        }
                    }
                }
            }
        }

        Ok(blocks)
    }
}

impl Parser for EpubParser {
    fn parse(&self, file_path: &Path, book_id: i32, conn: &Connection) -> Result<ParseResult, String> {
        // 打开 EPUB 文件
        let mut doc = EpubDoc::new(file_path)
            .map_err(|e| format!("EPUB 解析错误: {}", e))?;

        let mut chapters = Vec::new();
        let mut total_blocks = 0;

        // 获取章节数量
        let num_chapters = doc.get_num_chapters();

        for i in 0..num_chapters {
            // 设置当前章节
            if !doc.set_current_chapter(i) {
                continue;
            }

            // 获取章节内容
            let content = doc.get_current_str();
            if content.is_none() {
                continue;
            }

            let (html_content, _mime) = content.unwrap();

            // 尝试从 HTML 内容中提取标题
            let title = self.extract_title_from_html(&html_content)
                .unwrap_or_else(|| format!("第 {} 章", chapters.len() + 1));

            eprintln!("EPUB 解析 - 文件 {}: 标题={}", i, title);

            // EPUB 只保存原始 HTML，不生成 IRP blocks
            chapters.push(ChapterData {
                title,
                blocks: Vec::new(), // 空的 blocks，不需要生成
                confidence: "explicit".to_string(),
                raw_html: Some(html_content.clone()),
                render_mode: "html".to_string(),
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

impl Default for EpubParser {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_epub_parser_creation() {
        let parser = EpubParser::new();
        assert_eq!(parser.get_quality(), ParseQuality::Native);
        assert_eq!(parser.supported_extensions(), vec!["epub"]);
    }

    #[test]
    fn test_parse_simple_html() {
        let parser = EpubParser::new();
        let html = r#"
            <body>
                <h1>标题</h1>
                <p>这是一个段落。</p>
                <p>这是<strong>加粗</strong>和<em>斜体</em>文本。</p>
            </body>
        "#;

        let blocks = parser.parse_html_to_blocks(html).unwrap();
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0].block_type, "heading");
        assert_eq!(blocks[1].block_type, "paragraph");
        assert_eq!(blocks[2].block_type, "paragraph");
    }

    #[test]
    fn test_extract_bold_text() {
        let parser = EpubParser::new();
        let html = r#"<body><p>普通<strong>加粗</strong>文本</p></body>"#;

        let blocks = parser.parse_html_to_blocks(html).unwrap();
        assert_eq!(blocks.len(), 1);

        let runs = &blocks[0].runs;
        assert!(runs.len() >= 2);

        // 检查是否有加粗标记
        let has_bold = runs.iter().any(|run| {
            run.marks.iter().any(|mark| matches!(mark.mark_type, MarkType::Bold))
        });
        assert!(has_bold);
    }

    #[test]
    fn test_extract_link() {
        let parser = EpubParser::new();
        let html = r#"<body><p><a href="https://example.com">链接</a></p></body>"#;

        let blocks = parser.parse_html_to_blocks(html).unwrap();
        assert_eq!(blocks.len(), 1);

        let runs = &blocks[0].runs;
        assert!(!runs.is_empty());

        // 检查是否有链接标记
        let has_link = runs.iter().any(|run| {
            run.marks.iter().any(|mark| matches!(mark.mark_type, MarkType::Link))
        });
        assert!(has_link);
    }

    #[test]
    fn test_parse_image() {
        let parser = EpubParser::new();
        let html = r#"<body><img src="images/cover.jpg" /></body>"#;

        let blocks = parser.parse_html_to_blocks(html).unwrap();
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].block_type, "image");
        assert_eq!(blocks[0].runs[0].text, "images/cover.jpg");
    }

    #[test]
    fn test_merge_runs() {
        let parser = EpubParser::new();

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

        let merged = parser.merge_runs(runs);
        assert_eq!(merged.len(), 1);
        assert_eq!(merged[0].text, "Hello World");
    }

    #[test]
    fn test_extract_title_from_html() {
        let parser = EpubParser::new();

        // 测试 h1 标题
        let html_h1 = r#"<html><body><h1>第一章</h1><p>内容</p></body></html>"#;
        assert_eq!(parser.extract_title_from_html(html_h1), Some("第一章".to_string()));

        // 测试 h2 标题
        let html_h2 = r#"<html><body><h2>第一节</h2><p>内容</p></body></html>"#;
        assert_eq!(parser.extract_title_from_html(html_h2), Some("第一节".to_string()));

        // 测试 h3 标题
        let html_h3 = r#"<html><body><h3>小节标题</h3><p>内容</p></body></html>"#;
        assert_eq!(parser.extract_title_from_html(html_h3), Some("小节标题".to_string()));

        // 测试没有标题（title 标签不应该被使用）
        let html_no_title = r#"<html><head><title>书名</title></head><body><p>内容</p></body></html>"#;
        assert_eq!(parser.extract_title_from_html(html_no_title), None);

        // 测试完全没有标题
        let html_empty = r#"<html><body><p>内容</p></body></html>"#;
        assert_eq!(parser.extract_title_from_html(html_empty), None);
    }

    #[test]
    fn test_is_h1_title() {
        let parser = EpubParser::new();

        // 包含 h1
        let html_h1 = r#"<html><body><h1>第一章</h1><p>内容</p></body></html>"#;
        assert!(parser.is_h1_title(html_h1));

        // 只有 h2
        let html_h2 = r#"<html><body><h2>第一节</h2><p>内容</p></body></html>"#;
        assert!(!parser.is_h1_title(html_h2));

        // 没有标题
        let html_no_title = r#"<html><body><p>内容</p></body></html>"#;
        assert!(!parser.is_h1_title(html_no_title));
    }
}
