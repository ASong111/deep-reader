/// 测试修改后的 EPUB 解析器
///
/// 验证只解析 TOC 中的章节

use std::path::Path;
use epub::doc::EpubDoc;

fn main() {
    // 使用项目中的测试 EPUB 文件
    let epub_path = Path::new("../docs/Xing Xin Li Xue  (Yi Yi Shi Jie - [Ai Li Shi ].epub");

    if !epub_path.exists() {
        eprintln!("错误: 找不到文件 {:?}", epub_path);
        return;
    }

    println!("正在测试 EPUB 解析器: {:?}\n", epub_path);

    // 打开 EPUB 文件
    let mut doc = match EpubDoc::new(epub_path) {
        Ok(doc) => doc,
        Err(e) => {
            eprintln!("✗ 打开 EPUB 失败: {}", e);
            return;
        }
    };

    println!("✓ EPUB 文件打开成功");

    // 获取 TOC
    let toc = doc.toc.clone();
    println!("TOC 条目数: {}", toc.len());

    // 收集所有 TOC 条目（包括子节点）
    let mut toc_entries = Vec::new();
    collect_toc_entries(&toc, &mut toc_entries);

    println!("总 TOC 条目数（包括子节点）: {}", toc_entries.len());

    // 建立 path -> resource_id 的映射
    let mut path_to_id = std::collections::HashMap::new();
    for (id, resource) in doc.resources.iter() {
        let path_str = resource.path.to_string_lossy().to_string();
        path_to_id.insert(path_str, id.clone());
    }

    // 建立 resource_id -> spine_index 的映射
    let mut id_to_spine_index = std::collections::HashMap::new();
    for (spine_idx, spine_item) in doc.spine.iter().enumerate() {
        id_to_spine_index.insert(spine_item.idref.clone(), spine_idx);
    }

    println!("\n=== 解析章节 ===");
    let mut parsed_count = 0;
    let mut skipped_count = 0;

    for (idx, nav_point) in toc_entries.iter().enumerate() {
        // 从 content 中提取资源路径（去掉 # 后面的锚点）
        let content_str = nav_point.content.to_string_lossy();
        let content_path = content_str.split('#').next().unwrap_or(&content_str);

        // 通过 path 查找 resource_id
        let resource_id = match path_to_id.get(content_path) {
            Some(id) => id,
            None => {
                println!("[{}] ✗ 找不到资源: {} - {}", idx, nav_point.label, content_path);
                skipped_count += 1;
                continue;
            }
        };

        // 通过 resource_id 查找 spine_index
        let spine_index = match id_to_spine_index.get(resource_id) {
            Some(&idx) => idx,
            None => {
                println!("[{}] ✗ 不在 Spine 中: {} - {}", idx, nav_point.label, resource_id);
                skipped_count += 1;
                continue;
            }
        };

        println!("[{}] ✓ {} -> Spine[{}]", idx, nav_point.label, spine_index);
        parsed_count += 1;
    }

    println!("\n=== 统计 ===");
    println!("成功解析: {}", parsed_count);
    println!("跳过: {}", skipped_count);
    println!("总计: {}", toc_entries.len());

    if parsed_count == 62 {
        println!("\n✓ 解析数量正确（62 个 TOC 条目）");
    } else {
        println!("\n✗ 解析数量不正确，期望 62，实际 {}", parsed_count);
    }
}

/// 递归收集所有 TOC 条目（包括子节点）
fn collect_toc_entries(toc: &[epub::doc::NavPoint], entries: &mut Vec<epub::doc::NavPoint>) {
    for nav_point in toc {
        entries.push(nav_point.clone());
        // 递归收集子节点
        if !nav_point.children.is_empty() {
            collect_toc_entries(&nav_point.children, entries);
        }
    }
}
