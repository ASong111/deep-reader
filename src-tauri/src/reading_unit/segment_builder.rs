use crate::parser::ChapterData;
use crate::reading_unit::types::{Segment, Heading, SourceFormat};
use rusqlite::Connection;

/// Segment Builder
/// 从 Parser 输出的 ChapterData 构建 Segment 候选片段
pub struct SegmentBuilder {
    book_id: i32,
    source_format: SourceFormat,
}

impl SegmentBuilder {
    /// 创建新的 SegmentBuilder
    pub fn new(book_id: i32, source_format: SourceFormat) -> Self {
        Self {
            book_id,
            source_format,
        }
    }

    /// 从 ChapterData 列表构建 Segment 列表
    ///
    /// # 参数
    /// - `chapters`: Parser 输出的章节列表
    /// - `conn`: 数据库连接（用于查询 block IDs）
    ///
    /// # 返回
    /// Segment 列表
    pub fn build_segments(
        &self,
        chapters: &[ChapterData],
        conn: &Connection,
    ) -> Result<Vec<Segment>, String> {
        let mut segments = Vec::new();
        let total_chapters = chapters.len();

        for (index, chapter) in chapters.iter().enumerate() {
            // 查询该章节的 chapter_id 和 block IDs
            let chapter_id = self.get_chapter_id(conn, index as i32)?;
            let (start_block_id, end_block_id) = self.get_block_range(conn, chapter_id)?;

            // 计算正文长度（排除标题）
            let length = self.calculate_content_length(chapter);

            // 计算位置比例
            let position_ratio = if total_chapters > 1 {
                index as f64 / (total_chapters - 1) as f64
            } else {
                0.5
            };

            // 提取标题信息
            let heading = self.extract_heading(chapter);

            // 创建 Segment
            let segment = Segment {
                id: format!("seg-{}-{}", self.book_id, chapter_id),
                chapter_id,
                heading,
                length,
                position_ratio,
                toc_level: None, // 将在后续步骤中填充（EPUB/HTML 格式）
                source_format: self.source_format.clone(),
                start_block_id,
                end_block_id,
            };

            segments.push(segment);
        }

        Ok(segments)
    }

    /// 查询章节 ID
    fn get_chapter_id(&self, conn: &Connection, chapter_index: i32) -> Result<i32, String> {
        let mut stmt = conn
            .prepare("SELECT id FROM chapters WHERE book_id = ?1 AND chapter_index = ?2")
            .map_err(|e| format!("准备查询失败: {}", e))?;

        let chapter_id = stmt
            .query_row([self.book_id, chapter_index], |row| row.get(0))
            .map_err(|e| format!("查询章节 ID 失败: {}", e))?;

        Ok(chapter_id)
    }

    /// 查询章节的 block ID 范围
    fn get_block_range(&self, conn: &Connection, chapter_id: i32) -> Result<(i32, i32), String> {
        let mut stmt = conn
            .prepare(
                "SELECT MIN(id), MAX(id) FROM blocks WHERE chapter_id = ?1"
            )
            .map_err(|e| format!("准备查询失败: {}", e))?;

        let result: Result<(Option<i32>, Option<i32>), _> = stmt
            .query_row([chapter_id], |row| Ok((row.get(0)?, row.get(1)?)));

        match result {
            Ok((Some(start_id), Some(end_id))) => Ok((start_id, end_id)),
            Ok((None, None)) => {
                // 章节没有blocks，使用chapter_id作为占位符
                Ok((chapter_id, chapter_id))
            }
            Ok(_) => Err(format!("章节 {} 的 block 数据不一致", chapter_id)),
            Err(e) => Err(format!("查询 block 范围失败: {}", e)),
        }
    }

    /// 计算正文长度（排除标题）
    fn calculate_content_length(&self, chapter: &ChapterData) -> usize {
        chapter
            .blocks
            .iter()
            .filter(|block| block.block_type != "heading")
            .map(|block| {
                block
                    .runs
                    .iter()
                    .map(|run| run.text.chars().count())
                    .sum::<usize>()
            })
            .sum()
    }

    /// 提取标题信息
    fn extract_heading(&self, chapter: &ChapterData) -> Option<Heading> {
        // 优先使用章节标题
        if !chapter.title.is_empty() && chapter.title != "未命名章节" {
            return Some(Heading {
                text: chapter.title.clone(),
                level: None, // 将在 Feature Extractor 中推断
            });
        }

        // 查找第一个 heading 类型的 block
        for block in &chapter.blocks {
            if block.block_type == "heading" {
                let text: String = block.runs.iter().map(|run| run.text.as_str()).collect();
                if !text.trim().is_empty() {
                    return Some(Heading {
                        text: text.trim().to_string(),
                        level: None,
                    });
                }
            }
        }

        None
    }

    /// 设置 TOC 层级信息（用于 EPUB/HTML 格式）
    ///
    /// # 参数
    /// - `segments`: Segment 列表（可变引用）
    /// - `toc_mapping`: 章节索引到 TOC 层级的映射
    pub fn set_toc_levels(
        segments: &mut [Segment],
        toc_mapping: &std::collections::HashMap<i32, u32>,
    ) {
        for segment in segments.iter_mut() {
            // 从 chapter_id 推断章节索引（假设 chapter_id 是连续的）
            if let Some(&toc_level) = toc_mapping.get(&segment.chapter_id) {
                segment.toc_level = Some(toc_level);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::irp::TextRun;
    use crate::parser::BlockData;

    #[test]
    fn test_calculate_content_length() {
        let builder = SegmentBuilder::new(1, SourceFormat::Epub);

        let chapter = ChapterData {
            title: "第一章".to_string(),
            blocks: vec![
                BlockData {
                    block_type: "heading".to_string(),
                    runs: vec![TextRun {
                        text: "第一章 标题".to_string(),
                        marks: vec![],
                    }],
                },
                BlockData {
                    block_type: "paragraph".to_string(),
                    runs: vec![TextRun {
                        text: "这是正文内容。".to_string(),
                        marks: vec![],
                    }],
                },
            ],
            confidence: "explicit".to_string(),
            raw_html: None,
            render_mode: "irp".to_string(),
        };

        let length = builder.calculate_content_length(&chapter);
        assert_eq!(length, 7); // "这是正文内容。" = 7 个字符（不含标点）
    }

    #[test]
    fn test_extract_heading() {
        let builder = SegmentBuilder::new(1, SourceFormat::Epub);

        let chapter = ChapterData {
            title: "第一章".to_string(),
            blocks: vec![],
            confidence: "explicit".to_string(),
            raw_html: None,
            render_mode: "irp".to_string(),
        };

        let heading = builder.extract_heading(&chapter);
        assert!(heading.is_some());
        assert_eq!(heading.unwrap().text, "第一章");
    }

    #[test]
    fn test_extract_heading_from_block() {
        let builder = SegmentBuilder::new(1, SourceFormat::Txt);

        let chapter = ChapterData {
            title: "未命名章节".to_string(),
            blocks: vec![BlockData {
                block_type: "heading".to_string(),
                runs: vec![TextRun {
                    text: "第一章 开始".to_string(),
                    marks: vec![],
                }],
            }],
            confidence: "inferred".to_string(),
            raw_html: None,
            render_mode: "irp".to_string(),
        };

        let heading = builder.extract_heading(&chapter);
        assert!(heading.is_some());
        assert_eq!(heading.unwrap().text, "第一章 开始");
    }
}
