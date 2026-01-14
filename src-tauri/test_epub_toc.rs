/// 测试 EPUB 章节标题提取
///
/// 用于探索如何正确获取章节标题

use std::path::Path;
use epub::doc::EpubDoc;

fn main() {
    let epub_path = Path::new("../一只特立独行的猪.epub");

    if !epub_path.exists() {
        eprintln!("错误: 找不到文件 {:?}", epub_path);
        return;
    }

    println!("正在解析 EPUB 文件: {:?}\n", epub_path);

    match EpubDoc::new(epub_path) {
        Ok(mut doc) => {
            println!("✓ EPUB 文件打开成功\n");

            // 获取章节数量
            let num_chapters = doc.get_num_chapters();
            println!("章节数量: {}\n", num_chapters);

            println!("=== 章节详情 ===");
            // 遍历所有章节
            for i in 0..num_chapters.min(15) {
                if doc.set_current_chapter(i) {
                    let id = doc.get_current_id().unwrap_or("无ID".to_string());
                    let path = doc.get_current_path()
                        .map(|p| p.display().to_string())
                        .unwrap_or("无路径".to_string());

                    // 尝试从内容中提取标题
                    let title_from_content = if let Some((content, _)) = doc.get_current_str() {
                        extract_title_from_html(&content)
                    } else {
                        None
                    };

                    println!("章节 {}:", i);
                    println!("  ID: {}", id);
                    println!("  路径: {}", path);
                    println!("  从内容提取的标题: {:?}", title_from_content);
                    println!();
                }
            }
        }
        Err(e) => {
            eprintln!("✗ EPUB 解析失败: {}", e);
        }
    }
}

/// 从 HTML 内容中提取标题
fn extract_title_from_html(html: &str) -> Option<String> {
    use scraper::{Html, Selector};

    let document = Html::parse_document(html);

    // 尝试查找 h1-h6 标题
    for tag in &["h1", "h2", "h3", "h4", "h5", "h6"] {
        if let Ok(selector) = Selector::parse(tag) {
            if let Some(element) = document.select(&selector).next() {
                let text = element.text().collect::<String>().trim().to_string();
                if !text.is_empty() {
                    return Some(text);
                }
            }
        }
    }

    // 尝试查找 title 标签
    if let Ok(selector) = Selector::parse("title") {
        if let Some(element) = document.select(&selector).next() {
            let text = element.text().collect::<String>().trim().to_string();
            if !text.is_empty() {
                return Some(text);
            }
        }
    }

    None
}
