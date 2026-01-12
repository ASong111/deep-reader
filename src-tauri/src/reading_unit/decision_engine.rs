use crate::reading_unit::types::*;

/// Decision Engine
/// 根据评分和特征决定是否合并或创建新章节
pub struct DecisionEngine {
    merge_threshold: f64,
    new_threshold: f64,
    gray_zone_length: usize,
}

impl DecisionEngine {
    pub fn new() -> Self {
        Self {
            merge_threshold: 3.0,
            new_threshold: -3.0,
            gray_zone_length: 800,
        }
    }

    /// 做出合并决策
    ///
    /// # 参数
    /// - `score`: 评分结果
    /// - `features`: 特征数据
    /// - `segment`: Segment 数据
    ///
    /// # 返回
    /// (决策, 决策原因, 层级)
    pub fn make_decision(
        &self,
        score: &SegmentScore,
        features: &SegmentFeatures,
        segment: &Segment,
    ) -> (MergeDecision, String, Option<u32>) {
        // 第一优先级：内容类型判断
        if let Some(content_score) = score.content_score {
            if content_score >= 5.0 {
                return (
                    MergeDecision::Merge,
                    self.format_reason("元信息内容，强制合并"),
                    None,
                );
            }
        }

        // 第二优先级：TOC 一级节点 + 非元信息
        if let Some(toc_level) = features.toc_feature {
            if toc_level == 1 {
                // 检查是否为元信息
                if !matches!(
                    features.content_feature,
                    ContentFeature::Copyright | ContentFeature::Toc | ContentFeature::Preface
                ) {
                    return (
                        MergeDecision::CreateNew,
                        self.format_reason("TOC 一级节点，创建新章节"),
                        Some(1),
                    );
                }
            }
        }

        // 第三优先级：TOC 二级节点
        if let Some(toc_level) = features.toc_feature {
            if toc_level == 2 {
                return (
                    MergeDecision::CreateNew,
                    self.format_reason("TOC 二级节点，创建新小节"),
                    Some(2),
                );
            }
        }

        // 第四优先级：评分模型
        if score.total_score >= self.merge_threshold {
            return (
                MergeDecision::Merge,
                self.format_reason(&format!(
                    "总分 {:.1} >= +{:.1}，倾向合并",
                    score.total_score, self.merge_threshold
                )),
                None,
            );
        }

        if score.total_score <= self.new_threshold {
            // 判断层级
            let level = self.determine_level(features, segment);
            return (
                MergeDecision::CreateNew,
                self.format_reason(&format!(
                    "总分 {:.1} <= {:.1}，创建新章节",
                    score.total_score, self.new_threshold
                )),
                Some(level),
            );
        }

        // 灰区处理
        if segment.length < self.gray_zone_length {
            (
                MergeDecision::Merge,
                self.format_reason(&format!(
                    "灰区判断：长度 {} < {}，合并",
                    segment.length, self.gray_zone_length
                )),
                None,
            )
        } else {
            let level = self.determine_level(features, segment);
            (
                MergeDecision::CreateNew,
                self.format_reason(&format!(
                    "灰区判断：长度 {} >= {}，创建新章节",
                    segment.length, self.gray_zone_length
                )),
                Some(level),
            )
        }
    }

    /// 判断章节层级
    fn determine_level(&self, features: &SegmentFeatures, _segment: &Segment) -> u32 {
        // 如果是强章标题，返回 level=1
        if features.heading_feature == HeadingStrength::Strong {
            return 1;
        }

        // 如果是弱标题（小节），返回 level=2
        if features.heading_feature == HeadingStrength::Weak {
            return 2;
        }

        // 默认返回 level=1
        1
    }

    /// 格式化决策原因
    fn format_reason(&self, reason: &str) -> String {
        reason.to_string()
    }

    /// 设置阈值
    pub fn set_thresholds(&mut self, merge: f64, new: f64, gray_length: usize) {
        self.merge_threshold = merge;
        self.new_threshold = new;
        self.gray_zone_length = gray_length;
    }
}

impl Default for DecisionEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_segment(length: usize) -> Segment {
        Segment {
            id: "test-seg".to_string(),
            chapter_id: 1,
            heading: Some(Heading {
                text: "测试标题".to_string(),
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

    fn create_test_features(
        toc_level: Option<u32>,
        heading: HeadingStrength,
        content: ContentFeature,
    ) -> SegmentFeatures {
        SegmentFeatures {
            toc_feature: toc_level,
            heading_feature: heading,
            length_feature: LengthFeature::Medium,
            content_feature: content,
            position_in_book: 0.5,
            is_after_strong_heading: false,
            is_consecutive_strong_heading: false,
            numbering_continuity: None,
        }
    }

    fn create_test_score(total: f64, content: Option<f64>) -> SegmentScore {
        let mut score = SegmentScore::new();
        score.total_score = total;
        score.content_score = content;
        score
    }

    #[test]
    fn test_priority_1_frontmatter() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(100);
        let features = create_test_features(None, HeadingStrength::None, ContentFeature::Copyright);
        let score = create_test_score(0.0, Some(5.0));

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::Merge);
        assert!(reason.contains("元信息"));
        assert_eq!(level, None);
    }

    #[test]
    fn test_priority_2_toc_level_1() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(1000);
        let features = create_test_features(Some(1), HeadingStrength::Strong, ContentFeature::Body);
        let score = create_test_score(0.0, Some(0.0));

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("TOC 一级节点"));
        assert_eq!(level, Some(1));
    }

    #[test]
    fn test_priority_3_toc_level_2() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(500);
        let features = create_test_features(Some(2), HeadingStrength::Weak, ContentFeature::Body);
        let score = create_test_score(0.0, Some(0.0));

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("TOC 二级节点"));
        assert_eq!(level, Some(2));
    }

    #[test]
    fn test_priority_4_high_score() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(500);
        let features = create_test_features(None, HeadingStrength::None, ContentFeature::Body);
        let score = create_test_score(5.0, Some(0.0));

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::Merge);
        assert!(reason.contains("总分"));
        assert_eq!(level, None);
    }

    #[test]
    fn test_priority_4_low_score() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(1000);
        let features = create_test_features(None, HeadingStrength::Strong, ContentFeature::Body);
        let score = create_test_score(-5.0, Some(0.0));

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("总分"));
        assert_eq!(level, Some(1));
    }

    #[test]
    fn test_gray_zone_short() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(500); // < 800
        let features = create_test_features(None, HeadingStrength::None, ContentFeature::Body);
        let score = create_test_score(0.0, Some(0.0)); // 灰区分数

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::Merge);
        assert!(reason.contains("灰区"));
        assert_eq!(level, None);
    }

    #[test]
    fn test_gray_zone_long() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(1000); // >= 800
        let features = create_test_features(None, HeadingStrength::None, ContentFeature::Body);
        let score = create_test_score(0.0, Some(0.0)); // 灰区分数

        let (decision, reason, level) = engine.make_decision(&score, &features, &segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("灰区"));
        assert_eq!(level, Some(1));
    }

    #[test]
    fn test_determine_level_strong_heading() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(1000);
        let features = create_test_features(None, HeadingStrength::Strong, ContentFeature::Body);

        let level = engine.determine_level(&features, &segment);
        assert_eq!(level, 1);
    }

    #[test]
    fn test_determine_level_weak_heading() {
        let engine = DecisionEngine::new();
        let segment = create_test_segment(500);
        let features = create_test_features(None, HeadingStrength::Weak, ContentFeature::Body);

        let level = engine.determine_level(&features, &segment);
        assert_eq!(level, 2);
    }
}
