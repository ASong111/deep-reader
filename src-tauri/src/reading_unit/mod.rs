// Reading Unit Builder 模块
// 用于构建符合人类阅读节奏的章节结构

pub mod types;
pub mod segment_builder;
pub mod feature_extractor;
pub mod scoring_engine;
pub mod decision_engine;
pub mod reading_unit_builder;
pub mod fallback_strategy;

#[cfg(test)]
mod integration_tests;

// 重新导出主要类型
pub use types::*;
pub use segment_builder::SegmentBuilder;
pub use feature_extractor::FeatureExtractor;
pub use scoring_engine::ScoringEngine;
pub use decision_engine::DecisionEngine;
pub use reading_unit_builder::ReadingUnitBuilder;
pub use fallback_strategy::FallbackStrategy;
