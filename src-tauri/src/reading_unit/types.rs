use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 源格式类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceFormat {
    Epub,
    Pdf,
    Txt,
    Md,
    Html,
}

/// 内容类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContentType {
    Frontmatter,  // 前言内容（版权页、目录、序言等）
    Body,         // 正文内容
    Backmatter,   // 后记内容
}

/// 合并决策
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MergeDecision {
    Merge,     // 合并到上一个 Reading Unit
    CreateNew, // 创建新的 Reading Unit
}

/// 标题信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Heading {
    pub text: String,
    pub level: Option<u32>, // HTML heading level (1-6)
}

/// Segment（候选片段）
/// Parser 输出的最小结构单元，用于参与章节合并判断
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    pub id: String,
    pub chapter_id: i32,           // 对应的原始 chapter ID
    pub heading: Option<Heading>,
    pub length: usize,             // 正文字符数
    pub position_ratio: f64,       // 在书籍中的位置 0.0 ~ 1.0
    pub toc_level: Option<u32>,    // TOC 层级（EPUB/HTML 可用）
    pub source_format: SourceFormat,
    pub start_block_id: i32,       // 起始 block ID
    pub end_block_id: i32,         // 结束 block ID
}

/// Reading Unit（阅读单元）
/// DeepReader 最终用于阅读、目录、AI 输入的章节结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReadingUnit {
    pub id: String,
    pub book_id: i32,
    pub title: String,
    pub level: u32,                // 层级：1=章，2=节
    pub parent_id: Option<String>, // 父节点 ID（level=2 时有值）
    pub segment_ids: Vec<String>,
    pub start_block_id: i32,
    pub end_block_id: i32,
    pub source: String,            // 'toc' 或 'heuristic'
    pub content_type: Option<ContentType>,
    pub summary: Option<Summary>,
}

/// AI 摘要
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub text: String,
    pub generated_at: i64,
    pub model: String,
}

/// 标题强度
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HeadingStrength {
    Strong,  // 强章标题
    Weak,    // 弱标题（小节）
    None,    // 无标题
}

/// 长度特征
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LengthFeature {
    VeryShort, // < 300
    Short,     // 300-800
    Medium,    // 800-2000
    Long,      // 2000-6000
    VeryLong,  // > 6000
}

/// 内容特征
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentFeature {
    Copyright, // 版权页
    Toc,       // 目录
    Preface,   // 序言
    Body,      // 正文
}

/// Segment 特征
#[derive(Debug, Clone)]
pub struct SegmentFeatures {
    pub toc_feature: Option<u32>,           // TOC 层级
    pub heading_feature: HeadingStrength,
    pub length_feature: LengthFeature,
    pub content_feature: ContentFeature,
    pub position_in_book: f64,              // 0.0 ~ 1.0
    pub is_after_strong_heading: bool,
    pub is_consecutive_strong_heading: bool,
    pub numbering_continuity: Option<bool>, // Some(true)=连续, Some(false)=跳跃, None=无编号
}

/// Segment 评分
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentScore {
    pub toc_score: Option<f64>,
    pub heading_score: Option<f64>,
    pub length_score: Option<f64>,
    pub content_score: Option<f64>,
    pub position_score: Option<f64>,
    pub continuity_score: Option<f64>,
    pub total_score: f64,
}

/// Debug 评分数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DebugSegmentScore {
    pub segment_id: String,
    pub scores: HashMap<String, f64>,
    pub weights: HashMap<String, f64>,
    pub total_score: f64,
    pub decision: MergeDecision,
    pub decision_reason: String,
    pub fallback: bool,
    pub fallback_reason: Option<String>,
    pub content_type: Option<ContentType>,
    pub level: Option<u32>,
}

impl SegmentScore {
    /// 创建新的评分实例
    pub fn new() -> Self {
        Self {
            toc_score: None,
            heading_score: None,
            length_score: None,
            content_score: None,
            position_score: None,
            continuity_score: None,
            total_score: 0.0,
        }
    }

    /// 计算加权总分
    pub fn calculate_total(&mut self, weights: &HashMap<String, f64>) {
        let mut total = 0.0;

        if let Some(score) = self.toc_score {
            if let Some(&weight) = weights.get("toc") {
                total += score * weight;
            }
        }

        if let Some(score) = self.heading_score {
            if let Some(&weight) = weights.get("heading") {
                total += score * weight;
            }
        }

        if let Some(score) = self.length_score {
            if let Some(&weight) = weights.get("length") {
                total += score * weight;
            }
        }

        if let Some(score) = self.content_score {
            if let Some(&weight) = weights.get("content") {
                total += score * weight;
            }
        }

        if let Some(score) = self.position_score {
            if let Some(&weight) = weights.get("position") {
                total += score * weight;
            }
        }

        if let Some(score) = self.continuity_score {
            if let Some(&weight) = weights.get("continuity") {
                total += score * weight;
            }
        }

        // 直接使用加权总分（不需要归一化）
        self.total_score = total;
    }
}

impl Default for SegmentScore {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_segment_score_calculation() {
        let mut score = SegmentScore::new();
        score.toc_score = Some(-3.0);
        score.heading_score = Some(-3.0);
        score.length_score = Some(0.0);
        score.content_score = Some(0.0);
        score.position_score = Some(0.0);
        score.continuity_score = Some(0.0);

        let mut weights = HashMap::new();
        weights.insert("toc".to_string(), 1.5);
        weights.insert("heading".to_string(), 1.2);
        weights.insert("length".to_string(), 1.0);
        weights.insert("content".to_string(), 1.0);
        weights.insert("position".to_string(), 0.8);
        weights.insert("continuity".to_string(), 0.8);

        score.calculate_total(&weights);

        // 总分应该是负数（倾向创建新章节）
        assert!(score.total_score < 0.0);
    }

    #[test]
    fn test_merge_decision_serialization() {
        let decision = MergeDecision::Merge;
        let json = serde_json::to_string(&decision).unwrap();
        assert_eq!(json, "\"merge\"");

        let decision = MergeDecision::CreateNew;
        let json = serde_json::to_string(&decision).unwrap();
        assert_eq!(json, "\"createnew\"");
    }

    #[test]
    fn test_content_type_serialization() {
        let content_type = ContentType::Frontmatter;
        let json = serde_json::to_string(&content_type).unwrap();
        assert_eq!(json, "\"frontmatter\"");
    }
}
