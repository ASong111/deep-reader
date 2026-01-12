use crate::reading_unit::types::*;
use regex::Regex;

/// Feature Extractor
/// 从 Segment 中提取用于评分的特征
pub struct FeatureExtractor {
    // 强章标题正则
    strong_heading_regex: Regex,
    // 弱标题正则
    weak_heading_regex: Regex,
    // 版权页关键词
    copyright_keywords: Vec<&'static str>,
    // 目录关键词
    toc_keywords: Vec<&'static str>,
    // 序言关键词
    preface_keywords: Vec<&'static str>,
}

impl FeatureExtractor {
    pub fn new() -> Self {
        // 强章标题正则：第X章、Chapter X、Part X
        let strong_pattern = r"^(第\s*[一二三四五六七八九十0-9]+\s*章|Chapter\s+\d+|Part\s+[IVX0-9]+)";
        let strong_heading_regex = Regex::new(strong_pattern).unwrap();

        // 弱标题正则：1.1、1.2.3、§1
        let weak_pattern = r"^(\d+\.\d+|\d+\.\d+\.\d+|§\s*\d+)";
        let weak_heading_regex = Regex::new(weak_pattern).unwrap();

        Self {
            strong_heading_regex,
            weak_heading_regex,
            copyright_keywords: vec![
                "ISBN", "All rights reserved", "Copyright", "版权", "出版社",
                "印刷", "发行", "CIP", "©", "版权所有",
            ],
            toc_keywords: vec!["目录", "导航", "Contents", "TOC", "Table of Contents"],
            preface_keywords: vec![
                "序", "序言", "前言", "致谢", "鸣谢", "导读", "引言",
                "Preface", "Foreword", "Introduction", "Acknowledgments", "Summary",
            ],
        }
    }

    /// 提取 Segment 的所有特征
    ///
    /// # 参数
    /// - `segment`: 当前 Segment
    /// - `prev_segment`: 上一个 Segment（用于判断连续性）
    ///
    /// # 返回
    /// SegmentFeatures 结构
    pub fn extract_features(
        &self,
        segment: &Segment,
        prev_segment: Option<&Segment>,
    ) -> SegmentFeatures {
        let toc_feature = segment.toc_level;
        let heading_feature = self.extract_heading_strength(segment);
        let length_feature = self.extract_length_feature(segment);
        let content_feature = self.extract_content_feature(segment);
        let position_in_book = segment.position_ratio;

        // 位置特征
        let is_after_strong_heading = self.is_after_strong_heading(prev_segment);
        let is_consecutive_strong_heading =
            self.is_consecutive_strong_heading(segment, prev_segment);

        // 连续性特征
        let numbering_continuity = self.extract_numbering_continuity(segment, prev_segment);

        SegmentFeatures {
            toc_feature,
            heading_feature,
            length_feature,
            content_feature,
            position_in_book,
            is_after_strong_heading,
            is_consecutive_strong_heading,
            numbering_continuity,
        }
    }

    /// 提取标题强度
    fn extract_heading_strength(&self, segment: &Segment) -> HeadingStrength {
        if let Some(ref heading) = segment.heading {
            if self.strong_heading_regex.is_match(&heading.text) {
                return HeadingStrength::Strong;
            }
            if self.weak_heading_regex.is_match(&heading.text) {
                return HeadingStrength::Weak;
            }
        }
        HeadingStrength::None
    }

    /// 提取长度特征
    fn extract_length_feature(&self, segment: &Segment) -> LengthFeature {
        match segment.length {
            0..=299 => LengthFeature::VeryShort,
            300..=799 => LengthFeature::Short,
            800..=1999 => LengthFeature::Medium,
            2000..=5999 => LengthFeature::Long,
            _ => LengthFeature::VeryLong,
        }
    }

    /// 提取内容特征
    fn extract_content_feature(&self, segment: &Segment) -> ContentFeature {
        if let Some(ref heading) = segment.heading {
            let text = heading.text.to_lowercase();

            // 检测版权页
            for keyword in &self.copyright_keywords {
                if text.contains(&keyword.to_lowercase()) {
                    return ContentFeature::Copyright;
                }
            }

            // 检测目录
            for keyword in &self.toc_keywords {
                if text.contains(&keyword.to_lowercase()) {
                    return ContentFeature::Toc;
                }
            }

            // 检测序言
            for keyword in &self.preface_keywords {
                if text.contains(&keyword.to_lowercase()) {
                    return ContentFeature::Preface;
                }
            }
        }

        ContentFeature::Body
    }

    /// 判断是否在强章标题之后
    fn is_after_strong_heading(&self, prev_segment: Option<&Segment>) -> bool {
        if let Some(prev) = prev_segment {
            if let Some(ref heading) = prev.heading {
                return self.strong_heading_regex.is_match(&heading.text);
            }
        }
        false
    }

    /// 判断是否连续两个强章标题
    fn is_consecutive_strong_heading(
        &self,
        segment: &Segment,
        prev_segment: Option<&Segment>,
    ) -> bool {
        let current_is_strong = if let Some(ref heading) = segment.heading {
            self.strong_heading_regex.is_match(&heading.text)
        } else {
            false
        };

        let prev_is_strong = if let Some(prev) = prev_segment {
            if let Some(ref heading) = prev.heading {
                self.strong_heading_regex.is_match(&heading.text)
            } else {
                false
            }
        } else {
            false
        };

        current_is_strong && prev_is_strong
    }

    /// 提取编号连续性
    fn extract_numbering_continuity(
        &self,
        segment: &Segment,
        prev_segment: Option<&Segment>,
    ) -> Option<bool> {
        let current_number = self.extract_section_number(segment);
        let prev_number = prev_segment.and_then(|s| self.extract_section_number(s));

        match (current_number, prev_number) {
            (Some(curr), Some(prev)) => {
                // 判断是否连续
                Some(self.is_continuous_numbering(&prev, &curr))
            }
            _ => None,
        }
    }

    /// 从标题中提取章节编号
    fn extract_section_number(&self, segment: &Segment) -> Option<Vec<u32>> {
        if let Some(ref heading) = segment.heading {
            // 匹配 1.2.3 格式
            let number_regex = Regex::new(r"^(\d+(?:\.\d+)*)").unwrap();
            if let Some(caps) = number_regex.captures(&heading.text) {
                let number_str = caps.get(1).unwrap().as_str();
                let numbers: Vec<u32> = number_str
                    .split('.')
                    .filter_map(|s| s.parse().ok())
                    .collect();
                if !numbers.is_empty() {
                    return Some(numbers);
                }
            }
        }
        None
    }

    /// 判断编号是否连续
    fn is_continuous_numbering(&self, prev: &[u32], curr: &[u32]) -> bool {
        // 如果层级不同，判断为跳跃
        if prev.len() != curr.len() {
            return false;
        }

        // 检查最后一位是否递增 1
        if let (Some(&prev_last), Some(&curr_last)) = (prev.last(), curr.last()) {
            if curr_last == prev_last + 1 {
                // 检查前面的位是否相同
                return prev[..prev.len() - 1] == curr[..curr.len() - 1];
            }
        }

        false
    }
}

impl Default for FeatureExtractor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_segment(heading_text: &str, length: usize, position: f64) -> Segment {
        Segment {
            id: "test-seg".to_string(),
            chapter_id: 1,
            heading: Some(Heading {
                text: heading_text.to_string(),
                level: None,
            }),
            length,
            position_ratio: position,
            toc_level: None,
            source_format: SourceFormat::Epub,
            start_block_id: 1,
            end_block_id: 1,
        }
    }

    #[test]
    fn test_extract_heading_strength_strong() {
        let extractor = FeatureExtractor::new();
        let segment = create_test_segment("第一章 开始", 1000, 0.1);

        let strength = extractor.extract_heading_strength(&segment);
        assert_eq!(strength, HeadingStrength::Strong);
    }

    #[test]
    fn test_extract_heading_strength_weak() {
        let extractor = FeatureExtractor::new();
        let segment = create_test_segment("1.1 小节", 500, 0.2);

        let strength = extractor.extract_heading_strength(&segment);
        assert_eq!(strength, HeadingStrength::Weak);
    }

    #[test]
    fn test_extract_length_feature() {
        let extractor = FeatureExtractor::new();

        let segment1 = create_test_segment("标题", 200, 0.1);
        assert_eq!(
            extractor.extract_length_feature(&segment1),
            LengthFeature::VeryShort
        );

        let segment2 = create_test_segment("标题", 500, 0.2);
        assert_eq!(
            extractor.extract_length_feature(&segment2),
            LengthFeature::Short
        );

        let segment3 = create_test_segment("标题", 1500, 0.3);
        assert_eq!(
            extractor.extract_length_feature(&segment3),
            LengthFeature::Medium
        );
    }

    #[test]
    fn test_extract_content_feature_copyright() {
        let extractor = FeatureExtractor::new();
        let segment = create_test_segment("版权所有", 100, 0.01);

        let feature = extractor.extract_content_feature(&segment);
        assert_eq!(feature, ContentFeature::Copyright);
    }

    #[test]
    fn test_extract_content_feature_toc() {
        let extractor = FeatureExtractor::new();
        let segment = create_test_segment("目录", 50, 0.02);

        let feature = extractor.extract_content_feature(&segment);
        assert_eq!(feature, ContentFeature::Toc);
    }

    #[test]
    fn test_extract_content_feature_preface() {
        let extractor = FeatureExtractor::new();
        let segment = create_test_segment("序言", 200, 0.03);

        let feature = extractor.extract_content_feature(&segment);
        assert_eq!(feature, ContentFeature::Preface);
    }

    #[test]
    fn test_extract_section_number() {
        let extractor = FeatureExtractor::new();

        let segment1 = create_test_segment("1.2.3 小节", 500, 0.2);
        let number1 = extractor.extract_section_number(&segment1);
        assert_eq!(number1, Some(vec![1, 2, 3]));

        let segment2 = create_test_segment("2.1 小节", 500, 0.3);
        let number2 = extractor.extract_section_number(&segment2);
        assert_eq!(number2, Some(vec![2, 1]));
    }

    #[test]
    fn test_is_continuous_numbering() {
        let extractor = FeatureExtractor::new();

        // 连续：1.1 -> 1.2
        assert!(extractor.is_continuous_numbering(&[1, 1], &[1, 2]));

        // 不连续：1.1 -> 1.3
        assert!(!extractor.is_continuous_numbering(&[1, 1], &[1, 3]));

        // 不连续：1.1 -> 2.1
        assert!(!extractor.is_continuous_numbering(&[1, 1], &[2, 1]));

        // 不连续：层级不同
        assert!(!extractor.is_continuous_numbering(&[1, 1], &[1, 1, 1]));
    }
}
