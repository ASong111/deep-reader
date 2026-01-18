use crate::reading_unit::types::*;
use std::time::{SystemTime, UNIX_EPOCH};

/// Reading Unit Builder
/// 根据决策构建最终的 Reading Unit 结构
pub struct ReadingUnitBuilder {
    book_id: i32,
    next_unit_id: std::cell::Cell<u32>, // 用于生成唯一ID
}

impl ReadingUnitBuilder {
    pub fn new(book_id: i32) -> Self {
        Self {
            book_id,
            next_unit_id: std::cell::Cell::new(1),
        }
    }

    /// 构建 Reading Unit 列表
    ///
    /// # 参数
    /// - `segments`: Segment 列表
    /// - `decisions`: 决策列表 (决策, 原因, 层级)
    ///
    /// # 返回
    /// Reading Unit 列表
    pub fn build(
        &self,
        segments: &[Segment],
        decisions: &[(MergeDecision, String, Option<u32>)],
    ) -> Result<Vec<ReadingUnit>, String> {
        if segments.len() != decisions.len() {
            return Err("Segments 和 decisions 长度不匹配".to_string());
        }

        let mut reading_units = Vec::new();
        let mut current_unit: Option<ReadingUnit> = None;
        let mut current_level_1_parent: Option<String> = None;

        for (i, (segment, (decision, _reason, level))) in
            segments.iter().zip(decisions.iter()).enumerate()
        {
            match decision {
                MergeDecision::Merge => {
                    // 合并到当前 Reading Unit
                    if let Some(ref mut unit) = current_unit {
                        unit.segment_ids.push(segment.id.clone());
                        unit.end_block_id = segment.end_block_id;
                    } else {
                        // 如果没有当前单元，创建一个新的（第一个segment就是Merge的情况）
                        let content_type = self.determine_content_type(segment, i, segments.len());
                        current_unit = Some(self.create_reading_unit(
                            segment,
                            1,
                            None,
                            content_type,
                        ));
                    }
                }
                MergeDecision::CreateNew => {
                    // 保存当前 Reading Unit（如果存在）
                    if let Some(unit) = current_unit.take() {
                        reading_units.push(unit);
                    }

                    // 创建新的 Reading Unit
                    let unit_level = level.unwrap_or(1);
                    let parent_id = if unit_level == 2 {
                        current_level_1_parent.clone()
                    } else {
                        None
                    };

                    let content_type = self.determine_content_type(segment, i, segments.len());

                    let new_unit = self.create_reading_unit(
                        segment,
                        unit_level,
                        parent_id,
                        content_type,
                    );

                    // 如果是 level=1，更新当前父节点
                    if unit_level == 1 {
                        current_level_1_parent = Some(new_unit.id.clone());
                    }

                    current_unit = Some(new_unit);
                }
            }
        }

        // 保存最后一个 Reading Unit
        if let Some(unit) = current_unit {
            reading_units.push(unit);
        }

        Ok(reading_units)
    }

    /// 创建 Reading Unit
    fn create_reading_unit(
        &self,
        segment: &Segment,
        level: u32,
        parent_id: Option<String>,
        content_type: Option<ContentType>,
    ) -> ReadingUnit {
        let title = segment
            .heading
            .as_ref()
            .map(|h| h.text.clone())
            .unwrap_or_else(|| format!("未命名章节 {}", segment.chapter_id));

        let source = if segment.toc_level.is_some() {
            "toc".to_string()
        } else {
            "heuristic".to_string()
        };

        // 生成唯一ID
        let unit_id = self.next_unit_id.get();
        self.next_unit_id.set(unit_id + 1);

        ReadingUnit {
            id: format!("ru-{}-{}", self.book_id, unit_id),
            book_id: self.book_id,
            title,
            level,
            parent_id,
            segment_ids: vec![segment.id.clone()],
            start_block_id: segment.start_block_id,
            end_block_id: segment.end_block_id,
            source,
            content_type,
            summary: None,
        }
    }

    /// 判断内容类型
    fn determine_content_type(
        &self,
        segment: &Segment,
        index: usize,
        total: usize,
    ) -> Option<ContentType> {
        // 检查标题中的关键词
        if let Some(ref heading) = segment.heading {
            let text = heading.text.to_lowercase();

            // 版权页关键词
            let copyright_keywords = [
                "isbn",
                "all rights reserved",
                "copyright",
                "版权",
                "出版社",
                "印刷",
                "发行",
                "cip",
                "©",
                "版权所有",
            ];
            for keyword in &copyright_keywords {
                if text.contains(keyword) {
                    return Some(ContentType::Frontmatter);
                }
            }

            // 目录关键词
            let toc_keywords = ["目录", "导航", "contents", "toc", "table of contents"];
            for keyword in &toc_keywords {
                if text.contains(keyword) {
                    return Some(ContentType::Frontmatter);
                }
            }

            // 序言关键词
            let preface_keywords = [
                "序", "序言", "前言", "致谢", "鸣谢", "导读", "引言", "preface", "foreword",
                "introduction", "acknowledgments", "summary",
            ];
            for keyword in &preface_keywords {
                if text.contains(keyword) {
                    return Some(ContentType::Frontmatter);
                }
            }
        }

        // 位置判断：前 5% 的短内容可能是前言
        if index < (total as f64 * 0.05) as usize && segment.length < 500 {
            return Some(ContentType::Frontmatter);
        }

        // 位置判断：后 5% 的内容可能是后记
        if index >= (total as f64 * 0.95) as usize {
            return Some(ContentType::Backmatter);
        }

        // 默认为正文
        Some(ContentType::Body)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_segment(id: &str, chapter_id: i32, heading: &str, length: usize) -> Segment {
        Segment {
            id: id.to_string(),
            chapter_id,
            heading: Some(Heading {
                text: heading.to_string(),
                level: None,
            }),
            length,
            position_ratio: 0.5,
            toc_level: None,
            source_format: SourceFormat::Epub,
            start_block_id: chapter_id,
            end_block_id: chapter_id,
        }
    }

    #[test]
    fn test_build_simple_structure() {
        let builder = ReadingUnitBuilder::new(1);

        let segments = vec![
            create_test_segment("seg-1", 1, "第一章", 1000),
            create_test_segment("seg-2", 2, "第二章", 1500),
        ];

        let decisions = vec![
            (MergeDecision::CreateNew, "新章节".to_string(), Some(1)),
            (MergeDecision::CreateNew, "新章节".to_string(), Some(1)),
        ];

        let units = builder.build(&segments, &decisions).unwrap();

        assert_eq!(units.len(), 2);
        assert_eq!(units[0].title, "第一章");
        assert_eq!(units[1].title, "第二章");
        assert_eq!(units[0].level, 1);
        assert_eq!(units[1].level, 1);
    }

    #[test]
    fn test_build_with_merge() {
        let builder = ReadingUnitBuilder::new(1);

        let segments = vec![
            create_test_segment("seg-1", 1, "版权页", 100),
            create_test_segment("seg-2", 2, "第一章", 1000),
        ];

        let decisions = vec![
            (MergeDecision::CreateNew, "新章节".to_string(), Some(1)),
            (MergeDecision::Merge, "合并".to_string(), None),
        ];

        let units = builder.build(&segments, &decisions).unwrap();

        assert_eq!(units.len(), 1);
        assert_eq!(units[0].segment_ids.len(), 2);
        assert_eq!(units[0].start_block_id, 1);
        assert_eq!(units[0].end_block_id, 2);
    }

    #[test]
    fn test_build_two_level_structure() {
        let builder = ReadingUnitBuilder::new(1);

        let segments = vec![
            create_test_segment("seg-1", 1, "第一章", 1000),
            create_test_segment("seg-2", 2, "1.1 小节", 500),
            create_test_segment("seg-3", 3, "1.2 小节", 600),
        ];

        let decisions = vec![
            (MergeDecision::CreateNew, "新章节".to_string(), Some(1)),
            (MergeDecision::CreateNew, "新小节".to_string(), Some(2)),
            (MergeDecision::CreateNew, "新小节".to_string(), Some(2)),
        ];

        let units = builder.build(&segments, &decisions).unwrap();

        assert_eq!(units.len(), 3);
        assert_eq!(units[0].level, 1);
        assert_eq!(units[1].level, 2);
        assert_eq!(units[2].level, 2);

        // 检查 parent_id
        assert_eq!(units[0].parent_id, None);
        assert_eq!(units[1].parent_id, Some(units[0].id.clone()));
        assert_eq!(units[2].parent_id, Some(units[0].id.clone()));
    }

    #[test]
    fn test_determine_content_type_copyright() {
        let builder = ReadingUnitBuilder::new(1);
        let segment = create_test_segment("seg-1", 1, "版权所有", 100);

        let content_type = builder.determine_content_type(&segment, 0, 10);
        assert_eq!(content_type, Some(ContentType::Frontmatter));
    }

    #[test]
    fn test_determine_content_type_toc() {
        let builder = ReadingUnitBuilder::new(1);
        let segment = create_test_segment("seg-1", 1, "目录", 50);

        let content_type = builder.determine_content_type(&segment, 1, 10);
        assert_eq!(content_type, Some(ContentType::Frontmatter));
    }

    #[test]
    fn test_determine_content_type_preface() {
        let builder = ReadingUnitBuilder::new(1);
        let segment = create_test_segment("seg-1", 1, "序言", 200);

        let content_type = builder.determine_content_type(&segment, 2, 10);
        assert_eq!(content_type, Some(ContentType::Frontmatter));
    }

    #[test]
    fn test_determine_content_type_body() {
        let builder = ReadingUnitBuilder::new(1);
        let segment = create_test_segment("seg-1", 1, "第一章", 1000);

        let content_type = builder.determine_content_type(&segment, 5, 10);
        assert_eq!(content_type, Some(ContentType::Body));
    }

    #[test]
    fn test_determine_content_type_backmatter() {
        let builder = ReadingUnitBuilder::new(1);
        let segment = create_test_segment("seg-1", 1, "后记", 500);

        let content_type = builder.determine_content_type(&segment, 9, 10);
        assert_eq!(content_type, Some(ContentType::Backmatter));
    }
}
