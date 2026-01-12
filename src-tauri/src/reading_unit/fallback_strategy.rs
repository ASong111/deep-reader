use crate::reading_unit::types::*;
use regex::Regex;

/// Fallback Strategy
/// 当评分计算失败时使用的降级策略
pub struct FallbackStrategy {
    strong_heading_regex: Regex,
    gray_zone_length: usize,
}

impl FallbackStrategy {
    pub fn new() -> Self {
        // 强章标题正则
        let pattern = r"^(第\s*[一二三四五六七八九十0-9]+\s*章|Chapter\s+\d+|Part\s+[IVX0-9]+)";
        let strong_heading_regex = Regex::new(pattern).unwrap();

        Self {
            strong_heading_regex,
            gray_zone_length: 800,
        }
    }

    /// 应用降级策略
    ///
    /// # 参数
    /// - `segment`: Segment 数据
    ///
    /// # 返回
    /// (决策, 决策原因)
    pub fn apply(&self, segment: &Segment) -> (MergeDecision, String) {
        // 规则 1：如果标题匹配强章标题正则，创建新章节
        if let Some(ref heading) = segment.heading {
            if self.strong_heading_regex.is_match(&heading.text) {
                return (
                    MergeDecision::CreateNew,
                    "降级策略：强章标题，创建新章节".to_string(),
                );
            }
        }

        // 规则 2：如果长度 < 800，合并
        if segment.length < self.gray_zone_length {
            return (
                MergeDecision::Merge,
                format!(
                    "降级策略：长度 {} < {}，合并",
                    segment.length, self.gray_zone_length
                ),
            );
        }

        // 规则 3：否则创建新章节
        (
            MergeDecision::CreateNew,
            format!(
                "降级策略：长度 {} >= {}，创建新章节",
                segment.length, self.gray_zone_length
            ),
        )
    }

    /// 设置灰区长度阈值
    pub fn set_gray_zone_length(&mut self, length: usize) {
        self.gray_zone_length = length;
    }
}

impl Default for FallbackStrategy {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_segment(heading_text: Option<&str>, length: usize) -> Segment {
        Segment {
            id: "test-seg".to_string(),
            chapter_id: 1,
            heading: heading_text.map(|text| Heading {
                text: text.to_string(),
                level: None,
            }),
            length,
            position_ratio: 0.5,
            toc_level: None,
            source_format: SourceFormat::Epub,
            start_block_id: 1,
            end_block_id: 1,
        }
    }

    #[test]
    fn test_strong_heading() {
        let strategy = FallbackStrategy::new();

        let segment = create_test_segment(Some("第一章 开始"), 1000);
        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("强章标题"));
    }

    #[test]
    fn test_short_length() {
        let strategy = FallbackStrategy::new();

        let segment = create_test_segment(Some("普通标题"), 500);
        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::Merge);
        assert!(reason.contains("长度"));
    }

    #[test]
    fn test_long_length() {
        let strategy = FallbackStrategy::new();

        let segment = create_test_segment(Some("普通标题"), 1000);
        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("长度"));
    }

    #[test]
    fn test_no_heading_short() {
        let strategy = FallbackStrategy::new();

        let segment = create_test_segment(None, 500);
        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::Merge);
        assert!(reason.contains("合并"));
    }

    #[test]
    fn test_no_heading_long() {
        let strategy = FallbackStrategy::new();

        let segment = create_test_segment(None, 1000);
        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("创建新章节"));
    }

    #[test]
    fn test_chapter_patterns() {
        let strategy = FallbackStrategy::new();

        // 测试中文章节
        let segment1 = create_test_segment(Some("第一章"), 1000);
        let (decision1, _) = strategy.apply(&segment1);
        assert_eq!(decision1, MergeDecision::CreateNew);

        // 测试英文章节
        let segment2 = create_test_segment(Some("Chapter 1"), 1000);
        let (decision2, _) = strategy.apply(&segment2);
        assert_eq!(decision2, MergeDecision::CreateNew);

        // 测试 Part
        let segment3 = create_test_segment(Some("Part I"), 1000);
        let (decision3, _) = strategy.apply(&segment3);
        assert_eq!(decision3, MergeDecision::CreateNew);
    }
}
