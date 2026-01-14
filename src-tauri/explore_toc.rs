/// 探索 EPUB TOC API
///
/// 用于了解如何获取和使用 EPUB 的目录结构

use std::path::Path;
use epub::doc::EpubDoc;

fn main() {
    // 使用项目中的测试 EPUB 文件
    let epub_path = Path::new("../docs/Xing Xin Li Xue  (Yi Yi Shi Jie - [Ai Li Shi ].epub");

    if !epub_path.exists() {
        eprintln!("错误: 找不到文件 {:?}", epub_path);
        eprintln!("请提供一个有效的 EPUB 文件路径");
        return;
    }

    println!("正在解析 EPUB 文件: {:?}\n", epub_path);

    match EpubDoc::new(epub_path) {
        Ok(mut doc) => {
            println!("✓ EPUB 文件打开成功\n");

            // 1. 获取 spine（章节顺序）
            println!("=== Spine (章节顺序) ===");
            println!("Spine 长度: {}", doc.spine.len());
            for (i, spine_item) in doc.spine.iter().enumerate().take(10) {
                println!("  [{}] ID: {:?}", i, spine_item);
            }
            println!();

            // 2. 获取 TOC（目录）
            println!("=== TOC (目录结构) ===");
            let toc = doc.toc.clone();
            println!("TOC 条目数: {}", toc.len());

            for (i, nav_point) in toc.iter().enumerate() {
                print_nav_point(nav_point, 0, i);
            }
            println!();

            // 3. 获取所有资源
            println!("=== Resources (所有资源) ===");
            println!("资源总数: {}", doc.resources.len());

            // 打印前20个资源，特别关注 HTML 文件
            let mut html_count = 0;
            for (id, resource) in doc.resources.iter() {
                if resource.mime == "application/xhtml+xml" {
                    println!("  ID: {} -> Path: {}", id, resource.path.display());
                    html_count += 1;
                    if html_count >= 20 {
                        break;
                    }
                }
            }
            println!();

            // 4. 建立 path -> idref 映射
            println!("=== Path -> ID 映射 ===");
            let mut path_to_id = std::collections::HashMap::new();
            for (id, resource) in doc.resources.iter() {
                let path_str = resource.path.to_string_lossy().to_string();
                path_to_id.insert(path_str.clone(), id.clone());
            }
            println!("映射条目数: {}", path_to_id.len());

            // 打印几个示例
            for (path, id) in path_to_id.iter().take(10) {
                println!("  {} -> {}", path, id);
            }
            println!();

            // 5. 对比 spine 和 TOC
            println!("=== 对比分析 ===");
            println!("Spine 中的章节数: {}", doc.spine.len());
            println!("TOC 中的条目数: {}", count_toc_entries(&toc));

            // 检查 TOC 中的每个条目是否在 spine 中
            println!("\nTOC 条目在 Spine 中的位置:");
            for nav_point in &toc {
                check_nav_in_spine_with_mapping(nav_point, &doc.spine, &doc.resources, 0);
            }
        }
        Err(e) => {
            eprintln!("✗ EPUB 解析失败: {}", e);
        }
    }
}

/// 递归打印 NavPoint 结构
fn print_nav_point(nav: &epub::doc::NavPoint, level: usize, index: usize) {
    let indent = "  ".repeat(level);
    println!("{}[{}] 标题: \"{}\"", indent, index, nav.label);
    println!("{}    内容: {}", indent, nav.content.display());
    println!("{}    Play Order: {:?}", indent, nav.play_order);

    // 递归打印子节点
    for (i, child) in nav.children.iter().enumerate() {
        print_nav_point(child, level + 1, i);
    }
}

/// 统计 TOC 中的总条目数（包括子节点）
fn count_toc_entries(toc: &[epub::doc::NavPoint]) -> usize {
    let mut count = toc.len();
    for nav in toc {
        count += count_toc_entries(&nav.children);
    }
    count
}

/// 检查 NavPoint 是否在 spine 中（使用 resources 映射）
fn check_nav_in_spine_with_mapping(
    nav: &epub::doc::NavPoint,
    spine: &[epub::doc::SpineItem],
    resources: &std::collections::HashMap<String, epub::doc::ResourceItem>,
    level: usize
) {
    let indent = "  ".repeat(level);

    // 从 content 中提取资源路径（去掉 # 后面的锚点）
    let content_str = nav.content.to_string_lossy();
    let content_path = content_str.split('#').next().unwrap_or(&content_str);

    // 通过 resources 查找对应的 ID
    let resource_id = resources.iter()
        .find(|(_, res)| res.path.to_string_lossy() == content_path)
        .map(|(id, _)| id.as_str());

    // 查找在 spine 中的位置
    if let Some(id) = resource_id {
        if let Some(pos) = spine.iter().position(|item| item.idref == id) {
            println!("{}\"{}\" -> Spine[{}] (path: {} -> id: {})", indent, nav.label, pos, content_path, id);
        } else {
            println!("{}\"{}\" -> 不在 Spine 中 (path: {} -> id: {}, 但 id 不在 spine 中)", indent, nav.label, content_path, id);
        }
    } else {
        println!("{}\"{}\" -> 找不到资源 (path: {})", indent, nav.label, content_path);
    }

    // 递归检查子节点
    for child in &nav.children {
        check_nav_in_spine_with_mapping(child, spine, resources, level + 1);
    }
}

/// 检查 NavPoint 是否在 spine 中
fn check_nav_in_spine(nav: &epub::doc::NavPoint, spine: &[epub::doc::SpineItem], level: usize) {
    let indent = "  ".repeat(level);

    // 从 content 中提取资源路径（去掉 # 后面的锚点）
    let content_str = nav.content.to_string_lossy();
    let content_path = content_str.split('#').next().unwrap_or(&content_str);

    // 查找在 spine 中的位置（通过 idref 匹配）
    if let Some(pos) = spine.iter().position(|item| {
        item.idref == content_path
    }) {
        println!("{}\"{}\" -> Spine[{}] (idref: {})", indent, nav.label, pos, content_path);
    } else {
        println!("{}\"{}\" -> 不在 Spine 中 (path: {})", indent, nav.label, content_path);
    }

    // 递归检查子节点
    for child in &nav.children {
        check_nav_in_spine(child, spine, level + 1);
    }
}
