use regex::Regex;
use super::*;

/// 章节信息
///
/// 包含章节标题、置信度和起始位置
#[derive(Debug, Clone)]
pub struct ChapterInfo {
    /// 章节标题
    pub title: String,
    /// 章节识别置信度：explicit（显式）、inferred（推断）、linear（线性）
    pub confidence: String,
    /// 章节起始块索引
    pub start_index: usize,
}

/// 章节检测器
///
/// 实现三层回退式章节识别：
/// 1. 显式识别：基于正则表达式匹配明确的章节标记
/// 2. 结构性推断：基于段落密度和长度变化推断章节分界
/// 3. 线性模式：无法识别章节时，作为单章节处理
pub struct ChapterDetector {
    /// 章节标题匹配模式列表
    patterns: Vec<Regex>,
}

impl ChapterDetector {
    /// 创建新的章节检测器实例
    ///
    /// 初始化所有章节标题匹配模式
    pub fn new() -> Self {
        let patterns = vec![
            // 中文章节标题
            Regex::new(r"^第[零一二三四五六七八九十百千万\d]+章").unwrap(),
            Regex::new(r"^第\d+章").unwrap(),
            Regex::new(r"^第[零一二三四五六七八九十百千万\d]+节").unwrap(),
            Regex::new(r"^第\d+节").unwrap(),

            // 英文章节标题
            Regex::new(r"^Chapter\s+\d+").unwrap(),
            Regex::new(r"^CHAPTER\s+\d+").unwrap(),
            Regex::new(r"^Section\s+\d+").unwrap(),
            Regex::new(r"^SECTION\s+\d+").unwrap(),

            // Markdown 标题
            Regex::new(r"^#\s+").unwrap(),
            Regex::new(r"^##\s+").unwrap(),

            // 数字章节
            Regex::new(r"^\d+\.\s+").unwrap(),
            Regex::new(r"^\d+、").unwrap(),

            // 其他常见格式
            Regex::new(r"^卷\s*[零一二三四五六七八九十百千万\d]+").unwrap(),
            Regex::new(r"^Part\s+\d+").unwrap(),
            Regex::new(r"^PART\s+\d+").unwrap(),
        ];

        Self { patterns }
    }

    /// 第一层：显式章节识别
    ///
    /// 使用正则表达式匹配明确的章节标记
    ///
    /// # 参数
    /// - `text`: 要检测的文本
    ///
    /// # 返回
    /// 如果匹配成功，返回章节信息；否则返回 None
    pub fn detect_explicit(&self, text: &str) -> Option<ChapterInfo> {
        let trimmed = text.trim();

        // 跳过过长的文本（可能是正文而非标题）
        if trimmed.len() > 100 {
            return None;
        }

        for pattern in &self.patterns {
            if pattern.is_match(trimmed) {
                return Some(ChapterInfo {
                    title: trimmed.to_string(),
                    confidence: "explicit".to_string(),
                    start_index: 0,
                });
            }
        }

        None
    }

    /// 在块列表中检测显式章节
    ///
    /// 遍历所有块，查找匹配章节标题模式的块
    ///
    /// # 参数
    /// - `blocks`: 块列表
    ///
    /// # 返回
    /// 章节信息列表
    pub fn detect_chapters_in_blocks(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
        let mut chapters = Vec::new();

        for (i, block) in blocks.iter().enumerate() {
            // 只检查标题块和段落块
            if block.block_type == "heading" || block.block_type == "paragraph" {
                if let Some(run) = block.runs.first() {
                    if let Some(mut chapter) = self.detect_explicit(&run.text) {
                        chapter.start_index = i;
                        chapters.push(chapter);
                    }
                }
            }
        }

        chapters
    }

    /// 第二层：结构性推断 - 基于空行密度
    ///
    /// 通过检测连续空行来推断章节分界
    ///
    /// # 参数
    /// - `blocks`: 块列表
    ///
    /// # 返回
    /// 推断的章节信息列表
    pub fn detect_inferred(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
        let mut boundaries = Vec::new();
        let mut consecutive_empty = 0;

        for (i, block) in blocks.iter().enumerate() {
            let is_empty = block.runs.is_empty() ||
                           block.runs.iter().all(|r| r.text.trim().is_empty());

            if is_empty {
                consecutive_empty += 1;
            } else {
                // 连续 3 个或以上空行，可能是章节分界
                if consecutive_empty >= 3 && i > 0 {
                    // 使用下一个非空块的内容作为标题（如果足够短）
                    let title = if let Some(run) = block.runs.first() {
                        let text = run.text.trim();
                        if text.len() <= 50 {
                            text.to_string()
                        } else {
                            format!("章节 {}", boundaries.len() + 1)
                        }
                    } else {
                        format!("章节 {}", boundaries.len() + 1)
                    };

                    boundaries.push(ChapterInfo {
                        title,
                        confidence: "inferred".to_string(),
                        start_index: i,
                    });
                }
                consecutive_empty = 0;
            }
        }

        boundaries
    }

    /// 第二层：结构性推断 - 基于长度变化
    ///
    /// 通过检测短段落后跟长段落的模式来推断章节标题
    ///
    /// # 参数
    /// - `blocks`: 块列表
    ///
    /// # 返回
    /// 推断的章节信息列表
    pub fn detect_by_length_change(&self, blocks: &[BlockData]) -> Vec<ChapterInfo> {
        let mut chapters = Vec::new();

        for i in 1..blocks.len() {
            let current_len = blocks[i].runs.iter()
                .map(|r| r.text.len())
                .sum::<usize>();

            let prev_len = blocks[i - 1].runs.iter()
                .map(|r| r.text.len())
                .sum::<usize>();

            // 短段落（< 50 字符）后跟长段落（> 200 字符），可能是标题+正文
            if prev_len > 0 && prev_len < 50 && current_len > 200 {
                if let Some(run) = blocks[i - 1].runs.first() {
                    chapters.push(ChapterInfo {
                        title: run.text.trim().to_string(),
                        confidence: "inferred".to_string(),
                        start_index: i - 1,
                    });
                }
            }
        }

        chapters
    }

    /// 综合检测方法：三层回退式章节识别
    ///
    /// 1. 尝试显式识别
    /// 2. 如果失败，尝试结构性推断
    /// 3. 如果仍失败，回退到线性模式（单章节）
    ///
    /// # 参数
    /// - `blocks`: 块列表
    ///
    /// # 返回
    /// 章节数据列表
    pub fn detect(&self, blocks: &[BlockData]) -> Vec<ChapterData> {
        // 第一层：尝试显式识别
        let explicit_chapters = self.detect_chapters_in_blocks(blocks);
        if !explicit_chapters.is_empty() {
            return self.split_blocks_by_chapters(blocks, explicit_chapters);
        }

        // 第二层：尝试结构性推断
        let mut inferred_chapters = self.detect_inferred(blocks);
        if inferred_chapters.is_empty() {
            inferred_chapters = self.detect_by_length_change(blocks);
        }

        if !inferred_chapters.is_empty() {
            return self.split_blocks_by_chapters(blocks, inferred_chapters);
        }

        // 第三层：回退到线性模式（单章节）
        vec![ChapterData {
            title: "全文".to_string(),
            blocks: blocks.to_vec(),
            confidence: "linear".to_string(),
            raw_html: None,
            render_mode: "irp".to_string(),
        }]
    }

    /// 根据章节信息分割块列表
    ///
    /// # 参数
    /// - `blocks`: 块列表
    /// - `chapter_infos`: 章节信息列表
    ///
    /// # 返回
    /// 章节数据列表
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

            // 确保有内容
            if start < end {
                chapters.push(ChapterData {
                    title: info.title.clone(),
                    blocks: blocks[start..end].to_vec(),
                    confidence: info.confidence.clone(),
                    raw_html: None,
                    render_mode: "irp".to_string(),
                });
            }
        }

        // 如果没有生成任何章节，回退到线性模式
        if chapters.is_empty() {
            chapters.push(ChapterData {
                title: "全文".to_string(),
                blocks: blocks.to_vec(),
                confidence: "linear".to_string(),
                raw_html: None,
                render_mode: "irp".to_string(),
            });
        }

        chapters
    }
}

impl Default for ChapterDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::irp::TextRun;

    fn create_block(text: &str, block_type: &str) -> BlockData {
        BlockData {
            block_type: block_type.to_string(),
            runs: vec![TextRun {
                text: text.to_string(),
                marks: vec![],
            }],
        }
    }

    #[test]
    fn test_explicit_detection_chinese() {
        let detector = ChapterDetector::new();

        assert!(detector.detect_explicit("第一章 开始").is_some());
        assert!(detector.detect_explicit("第1章 开始").is_some());
        assert!(detector.detect_explicit("第十章 结束").is_some());
        assert!(detector.detect_explicit("第一节 介绍").is_some());
    }

    #[test]
    fn test_explicit_detection_english() {
        let detector = ChapterDetector::new();

        assert!(detector.detect_explicit("Chapter 1").is_some());
        assert!(detector.detect_explicit("CHAPTER 1").is_some());
        assert!(detector.detect_explicit("Section 1").is_some());
        assert!(detector.detect_explicit("Part 1").is_some());
    }

    #[test]
    fn test_explicit_detection_markdown() {
        let detector = ChapterDetector::new();

        assert!(detector.detect_explicit("# 标题").is_some());
        assert!(detector.detect_explicit("## 子标题").is_some());
    }

    #[test]
    fn test_explicit_detection_numbers() {
        let detector = ChapterDetector::new();

        assert!(detector.detect_explicit("1. 第一章").is_some());
        assert!(detector.detect_explicit("1、第一章").is_some());
    }

    #[test]
    fn test_explicit_detection_negative() {
        let detector = ChapterDetector::new();

        assert!(detector.detect_explicit("普通段落文本").is_none());
        assert!(detector.detect_explicit("这是一段很长的文本，不应该被识别为章节标题，因为它太长了，超过了100个字符的限制，所以应该返回None而不是Some").is_none());
    }

    #[test]
    fn test_detect_chapters_in_blocks() {
        let detector = ChapterDetector::new();
        let blocks = vec![
            create_block("第一章 开始", "heading"),
            create_block("这是第一章的内容。", "paragraph"),
            create_block("第二章 继续", "heading"),
            create_block("这是第二章的内容。", "paragraph"),
        ];

        let chapters = detector.detect_chapters_in_blocks(&blocks);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "第一章 开始");
        assert_eq!(chapters[0].start_index, 0);
        assert_eq!(chapters[1].title, "第二章 继续");
        assert_eq!(chapters[1].start_index, 2);
    }

    #[test]
    fn test_detect_by_length_change() {
        let detector = ChapterDetector::new();
        let blocks = vec![
            create_block("短标题", "paragraph"),
            create_block("这是一段很长的正文内容，超过了200个字符的阈值。".repeat(5).as_str(), "paragraph"),
            create_block("另一个短标题", "paragraph"),
            create_block("又是一段很长的正文内容，超过了200个字符的阈值。".repeat(5).as_str(), "paragraph"),
        ];

        let chapters = detector.detect_by_length_change(&blocks);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].title, "短标题");
        assert_eq!(chapters[0].confidence, "inferred");
    }

    #[test]
    fn test_split_blocks_by_chapters() {
        let detector = ChapterDetector::new();
        let blocks = vec![
            create_block("第一章", "heading"),
            create_block("内容1", "paragraph"),
            create_block("第二章", "heading"),
            create_block("内容2", "paragraph"),
        ];

        let chapter_infos = vec![
            ChapterInfo {
                title: "第一章".to_string(),
                confidence: "explicit".to_string(),
                start_index: 0,
            },
            ChapterInfo {
                title: "第二章".to_string(),
                confidence: "explicit".to_string(),
                start_index: 2,
            },
        ];

        let chapters = detector.split_blocks_by_chapters(&blocks, chapter_infos);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].blocks.len(), 2);
        assert_eq!(chapters[1].blocks.len(), 2);
    }

    #[test]
    fn test_detect_fallback_to_linear() {
        let detector = ChapterDetector::new();
        let blocks = vec![
            create_block("普通段落1", "paragraph"),
            create_block("普通段落2", "paragraph"),
            create_block("普通段落3", "paragraph"),
        ];

        let chapters = detector.detect(&blocks);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "全文");
        assert_eq!(chapters[0].confidence, "linear");
        assert_eq!(chapters[0].blocks.len(), 3);
    }

    #[test]
    fn test_detect_with_explicit_chapters() {
        let detector = ChapterDetector::new();
        let blocks = vec![
            create_block("第一章 开始", "heading"),
            create_block("内容1", "paragraph"),
            create_block("第二章 继续", "heading"),
            create_block("内容2", "paragraph"),
        ];

        let chapters = detector.detect(&blocks);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].confidence, "explicit");
        assert_eq!(chapters[1].confidence, "explicit");
    }

    #[test]
    fn test_empty_blocks() {
        let detector = ChapterDetector::new();
        let blocks: Vec<BlockData> = vec![];

        let chapters = detector.detect(&blocks);
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].title, "全文");
        assert_eq!(chapters[0].confidence, "linear");
    }

    #[test]
    fn test_chapter_info_creation() {
        let info = ChapterInfo {
            title: "测试章节".to_string(),
            confidence: "explicit".to_string(),
            start_index: 0,
        };

        assert_eq!(info.title, "测试章节");
        assert_eq!(info.confidence, "explicit");
        assert_eq!(info.start_index, 0);
    }
}
