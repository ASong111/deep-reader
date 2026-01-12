use crate::reading_unit::types::*;
use std::collections::HashMap;

/// Scoring Engine
/// 根据特征计算合并评分
pub struct ScoringEngine {
    weights: HashMap<String, f64>,
}

impl ScoringEngine {
    pub fn new() -> Self {
        let mut weights = HashMap::new();
        weights.insert("toc".to_string(), 1.5);
        weights.insert("heading".to_string(), 1.2);
        weights.insert("length".to_string(), 1.0);
        weights.insert("content".to_string(), 1.0);
        weights.insert("position".to_string(), 0.8);
        weights.insert("continuity".to_string(), 0.8);

        Self { weights }
    }

    /// 计算 Segment 的评分
    ///
    /// # 参数
    /// - `features`: 提取的特征
    ///
    /// # 返回
    /// SegmentScore 结构
    pub fn calculate_score(&self, features: &SegmentFeatures) -> SegmentScore {
        let mut score = SegmentScore::new();

        // 1. TOC 语义分
        score.toc_score = self.calculate_toc_score(features);

        // 2. 标题强度分
        score.heading_score = Some(self.calculate_heading_score(features));

        // 3. 长度合理性分
        score.length_score = Some(self.calculate_length_score(features));

        // 4. 内容类型分
        score.content_score = Some(self.calculate_content_score(features));

        // 5. 位置惩罚分
        score.position_score = Some(self.calculate_position_score(features));

        // 6. 连续性分
        score.continuity_score = self.calculate_continuity_score(features);

        // 计算加权总分
        score.calculate_total(&self.weights);

        score
    }

    /// 计算 TOC 语义分
    fn calculate_toc_score(&self, features: &SegmentFeatures) -> Option<f64> {
        features.toc_feature.map(|level| match level {
            1 => -3.0, // TOC 一级节点（仅对非元信息内容生效）
            2 => 1.0,  // TOC 二级节点，倾向合并到父章节
            _ => 2.0,  // TOC 三级及以下，强烈倾向合并
        })
    }

    /// 计算标题强度分
    fn calculate_heading_score(&self, features: &SegmentFeatures) -> f64 {
        match features.heading_feature {
            HeadingStrength::Strong => -3.0, // 强章标题，创建新章节
            HeadingStrength::Weak => 2.0,    // 弱标题（小节），倾向合并
            HeadingStrength::None => 1.0,    // 无标题，倾向合并
        }
    }

    /// 计算长度合理性分
    fn calculate_length_score(&self, features: &SegmentFeatures) -> f64 {
        match features.length_feature {
            LengthFeature::VeryShort => 3.0,  // < 300，强烈倾向合并
            LengthFeature::Short => 2.0,      // 300-800，倾向合并
            LengthFeature::Medium => 0.0,     // 800-2000，中性
            LengthFeature::Long => -1.0,      // 2000-6000，轻微倾向独立
            LengthFeature::VeryLong => -2.0,  // > 6000，倾向独立
        }
    }

    /// 计算内容类型分
    fn calculate_content_score(&self, features: &SegmentFeatures) -> f64 {
        match features.content_feature {
            ContentFeature::Copyright => 5.0, // 版权页，强制合并
            ContentFeature::Toc => 5.0,       // 目录，强制合并
            ContentFeature::Preface => 5.0,   // 序言，强制合并
            ContentFeature::Body => 0.0,      // 正文，中性
        }
    }

    /// 计算位置惩罚分
    fn calculate_position_score(&self, features: &SegmentFeatures) -> f64 {
        let mut score = 0.0;

        // 位于书籍前 5% 且非强章
        if features.position_in_book < 0.05
            && features.heading_feature != HeadingStrength::Strong
        {
            score += 2.0;
        }

        // 位于书籍后 5%
        if features.position_in_book > 0.95 {
            score += 1.0;
        }

        // 紧跟强章标题
        if features.is_after_strong_heading {
            score += 1.0;
        }

        // 连续两个强章标题
        if features.is_consecutive_strong_heading {
            score -= 1.0;
        }

        score
    }

    /// 计算连续性分
    fn calculate_continuity_score(&self, features: &SegmentFeatures) -> Option<f64> {
        features.numbering_continuity.map(|is_continuous| {
            if is_continuous {
                2.0 // 编号连续，倾向合并
            } else {
                -1.0 // 编号跳跃，倾向独立
            }
        })
    }

    /// 获取权重配置
    pub fn get_weights(&self) -> &HashMap<String, f64> {
        &self.weights
    }

    /// 设置自定义权重
    pub fn set_weights(&mut self, weights: HashMap<String, f64>) {
        self.weights = weights;
    }
}

impl Default for ScoringEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_features(
        toc_level: Option<u32>,
        heading: HeadingStrength,
        length: LengthFeature,
        content: ContentFeature,
        position: f64,
    ) -> SegmentFeatures {
        SegmentFeatures {
            toc_feature: toc_level,
            heading_feature: heading,
            length_feature: length,
            content_feature: content,
            position_in_book: position,
            is_after_strong_heading: false,
            is_consecutive_strong_heading: false,
            numbering_continuity: None,
        }
    }

    #[test]
    fn test_calculate_toc_score() {
        let engine = ScoringEngine::new();

        let features1 = create_test_features(
            Some(1),
            HeadingStrength::Strong,
            LengthFeature::Medium,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_toc_score(&features1), Some(-3.0));

        let features2 = create_test_features(
            Some(2),
            HeadingStrength::Weak,
            LengthFeature::Short,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_toc_score(&features2), Some(1.0));

        let features3 = create_test_features(
            Some(3),
            HeadingStrength::Weak,
            LengthFeature::Short,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_toc_score(&features3), Some(2.0));
    }

    #[test]
    fn test_calculate_heading_score() {
        let engine = ScoringEngine::new();

        let features1 = create_test_features(
            None,
            HeadingStrength::Strong,
            LengthFeature::Medium,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_heading_score(&features1), -3.0);

        let features2 = create_test_features(
            None,
            HeadingStrength::Weak,
            LengthFeature::Short,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_heading_score(&features2), 2.0);

        let features3 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::Short,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_heading_score(&features3), 1.0);
    }

    #[test]
    fn test_calculate_length_score() {
        let engine = ScoringEngine::new();

        let features1 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::VeryShort,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_length_score(&features1), 3.0);

        let features2 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::Medium,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_length_score(&features2), 0.0);

        let features3 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::VeryLong,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_length_score(&features3), -2.0);
    }

    #[test]
    fn test_calculate_content_score() {
        let engine = ScoringEngine::new();

        let features1 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::Short,
            ContentFeature::Copyright,
            0.01,
        );
        assert_eq!(engine.calculate_content_score(&features1), 5.0);

        let features2 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::Short,
            ContentFeature::Body,
            0.5,
        );
        assert_eq!(engine.calculate_content_score(&features2), 0.0);
    }

    #[test]
    fn test_calculate_position_score() {
        let engine = ScoringEngine::new();

        // 位于前 5% 且非强章
        let mut features1 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::Short,
            ContentFeature::Body,
            0.03,
        );
        assert_eq!(engine.calculate_position_score(&features1), 2.0);

        // 紧跟强章标题
        features1.is_after_strong_heading = true;
        assert_eq!(engine.calculate_position_score(&features1), 3.0);

        // 连续两个强章标题
        features1.is_consecutive_strong_heading = true;
        assert_eq!(engine.calculate_position_score(&features1), 2.0);
    }

    #[test]
    fn test_calculate_total_score() {
        let engine = ScoringEngine::new();

        // 测试强章标题（应该得负分，倾向创建新章节）
        let features = create_test_features(
            Some(1),
            HeadingStrength::Strong,
            LengthFeature::Medium,
            ContentFeature::Body,
            0.5,
        );

        let score = engine.calculate_score(&features);
        assert!(score.total_score < 0.0);

        // 测试元信息内容（应该得高分，倾向合并）
        let features2 = create_test_features(
            None,
            HeadingStrength::None,
            LengthFeature::VeryShort,
            ContentFeature::Copyright,
            0.01,
        );

        let score2 = engine.calculate_score(&features2);
        assert!(score2.total_score > 3.0);
    }
}
