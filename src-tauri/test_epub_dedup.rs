/// 测试 EPUB 去重功能
///
/// 验证重复的 spine_index 是否被正确过滤

use std::path::Path;
use epub::doc::EpubDoc;

fn main() {
    let epub_path = Path::new("../docs/Xing Xin Li Xue  (Yi Yi Shi Jie - [Ai Li Shi ].epub");

    if !epub_path.exists() {
        eprintln!("错误: 找不到文件 {:?}", epub_path);
        return;
    }

    println!("正在测试 EPUB 去重功能: {:?}\n", epub_path);

    let mut doc = match EpubDoc::new(epub_path) {
        Ok(doc) => doc,
        Err(e) => {
            eprintln!("✗ 打开 EPUB 失败: {}", e);
            return;
        }
    };

    let toc = doc.toc.clone();
    let mut toc_entries = Vec::new();
    collect_toc_entries(&toc, &mut toc_entries);

    // 建立映射
    let mut path_to_id = std::collections::HashMap::new();
    for (id, resource) in doc.resources.iter() {
        let path_str = resource.path.to_string_lossy().to_string();
        path_to_id.insert(path_str, id.clone());
    }

    let mut id_to_spine_index = std::collections::HashMap::new();
    for (spine_idx, spine_item) in doc.spine.iter().enumerate() {
        id_to_spine_index.insert(spine_item.idref.clone(), spine_idx);
    }

    // 统计 spine_index 的使用情况
    let mut spine_usage = std::collections::HashMap::new();
    let mut processed_spine_indices = std::collections::HashSet::new();

    println!("=== TOC 条目分析 ===");
    for (idx, nav_point) in toc_entries.iter().enumerate() {
        let content_str = nav_point.content.to_string_lossy();
        let content_path = content_str.split('#').next().unwrap_or(&content_str);

        if let Some(resource_id) = path_to_id.get(content_path) {
            if let Some(&spine_index) = id_to_spine_index.get(resource_id) {
                // 记录使用情况
                spine_usage.entry(spine_index)
                    .or_insert_with(Vec::new)
                    .push((idx, nav_point.label.clone()));

                // 检查是否重复
                if processed_spine_indices.contains(&spine_index) {
                    println!("[{}] ✗ 重复: \"{}\" -> Spine[{}] (将被跳过)",
                        idx, nav_point.label, spine_index);
                } else {
                    println!("[{}] ✓ 保留: \"{}\" -> Spine[{}]",
                        idx, nav_point.label, spine_index);
                    processed_spine_indices.insert(spine_index);
                }
            }
        }
    }

    println!("\n=== 统计结果 ===");
    println!("TOC 总条目数: {}", toc_entries.len());
    println!("去重后章节数: {}", processed_spine_indices.len());
    println!("重复条目数: {}", toc_entries.len() - processed_spine_indices.len());

    println!("\n=== 重复的 Spine 索引 ===");
    let mut duplicates: Vec<_> = spine_usage.iter()
        .filter(|(_, entries)| entries.len() > 1)
        .collect();
    duplicates.sort_by_key(|(spine_idx, _)| *spine_idx);

    for (spine_idx, entries) in duplicates {
        println!("\nSpine[{}] 被 {} 个 TOC 条目引用:", spine_idx, entries.len());
        for (idx, title) in entries {
            println!("  [{}] {}", idx, title);
        }
    }
}

fn collect_toc_entries(toc: &[epub::doc::NavPoint], entries: &mut Vec<epub::doc::NavPoint>) {
    for nav_point in toc {
        entries.push(nav_point.clone());
        if !nav_point.children.is_empty() {
            collect_toc_entries(&nav_point.children, entries);
        }
    }
}
