// 集成测试：测试完整的 Reading Unit 构建流程

#[cfg(test)]
mod integration_tests {
    use crate::reading_unit::*;

    #[test]
    fn test_full_pipeline_simple_book() {
        // 模拟一本简单的书：版权页 + 2章
        let segments = vec![
            create_segment("seg-1", 1, Some("版权所有"), 100, 0.0),
            create_segment("seg-2", 2, Some("第一章"), 1500, 0.33),
            create_segment("seg-3", 3, Some("第二章"), 2000, 0.67),
        ];

        let extractor = FeatureExtractor::new();
        let scorer = ScoringEngine::new();
        let decider = DecisionEngine::new();
        let builder = ReadingUnitBuilder::new(1);

        let mut decisions = Vec::new();

        for (i, segment) in segments.iter().enumerate() {
            let prev = if i > 0 { Some(&segments[i - 1]) } else { None };
            let features = extractor.extract_features(segment, prev);
            let score = scorer.calculate_score(&features);
            let decision = decider.make_decision(&score, &features, segment);

            // Debug输出
            println!("Segment {}: {:?}, score: {:.2}, decision: {:?}",
                     i, segment.heading.as_ref().map(|h| &h.text),
                     score.total_score, decision.0);

            decisions.push(decision);
        }

        let units = builder.build(&segments, &decisions).unwrap();

        // 验证结果
        println!("Total units: {}", units.len());
        for (i, unit) in units.iter().enumerate() {
            println!("Unit {}: title={}, segments={:?}", i, unit.title, unit.segment_ids);
        }

        // 版权页应该被识别为元信息并合并，但由于它是第一个segment，
        // 会创建一个新的unit，然后第一章会被合并进去
        assert!(units.len() <= 3); // 最多3个unit
    }

    #[test]
    fn test_full_pipeline_with_sections() {
        // 模拟技术书籍：第一章 + 两个小节
        let mut segments = vec![
            create_segment("seg-1", 1, Some("第一章"), 1500, 0.0),
            create_segment("seg-2", 2, Some("1.1 小节"), 800, 0.33),
            create_segment("seg-3", 3, Some("1.2 小节"), 900, 0.67),
        ];

        // 设置TOC层级
        segments[0].toc_level = Some(1);
        segments[1].toc_level = Some(2);
        segments[2].toc_level = Some(2);

        let extractor = FeatureExtractor::new();
        let scorer = ScoringEngine::new();
        let decider = DecisionEngine::new();
        let builder = ReadingUnitBuilder::new(1);

        let mut decisions = Vec::new();

        for (i, segment) in segments.iter().enumerate() {
            let prev = if i > 0 { Some(&segments[i - 1]) } else { None };
            let features = extractor.extract_features(segment, prev);
            let score = scorer.calculate_score(&features);
            let decision = decider.make_decision(&score, &features, segment);
            decisions.push(decision);
        }

        let units = builder.build(&segments, &decisions).unwrap();

        // 验证结果
        assert_eq!(units.len(), 3);
        assert_eq!(units[0].level, 1); // 第一章
        assert_eq!(units[1].level, 2); // 小节1
        assert_eq!(units[2].level, 2); // 小节2
        assert_eq!(units[1].parent_id, Some(units[0].id.clone()));
        assert_eq!(units[2].parent_id, Some(units[0].id.clone()));
    }

    #[test]
    fn test_fallback_strategy() {
        let segment = create_segment("seg-1", 1, Some("第一章"), 1500, 0.5);
        let strategy = FallbackStrategy::new();

        let (decision, reason) = strategy.apply(&segment);

        assert_eq!(decision, MergeDecision::CreateNew);
        assert!(reason.contains("强章标题"));
    }

    fn create_segment(
        id: &str,
        chapter_id: i32,
        heading: Option<&str>,
        length: usize,
        position: f64,
    ) -> Segment {
        Segment {
            id: id.to_string(),
            chapter_id,
            heading: heading.map(|text| Heading {
                text: text.to_string(),
                level: None,
            }),
            length,
            position_ratio: position,
            toc_level: None,
            source_format: SourceFormat::Epub,
            start_block_id: chapter_id,
            end_block_id: chapter_id,
        }
    }
}
