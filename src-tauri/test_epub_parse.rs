/// 测试 EPUB 解析功能
///
/// 用于验证 epub_parser 是否能正确解析章节内容

use std::path::Path;

fn main() {
    let epub_path = Path::new("../一只特立独行的猪.epub");

    if !epub_path.exists() {
        eprintln!("错误: 找不到文件 {:?}", epub_path);
        return;
    }

    println!("正在解析 EPUB 文件: {:?}", epub_path);

    // 使用 epub crate 直接测试
    match epub::doc::EpubDoc::new(epub_path) {
        Ok(mut doc) => {
            println!("✓ EPUB 文件打开成功");

            // 获取元数据
            if let Some(title) = doc.mdata("title") {
                println!("  标题: {}", title.value);
            }
            if let Some(author) = doc.mdata("creator") {
                println!("  作者: {}", author.value);
            }

            // 获取章节数量
            let num_chapters = doc.get_num_chapters();
            println!("  章节数量: {}", num_chapters);

            // 遍历前几个章节
            for i in 0..num_chapters.min(5) {
                if doc.set_current_chapter(i) {
                    if let Some((content, _mime)) = doc.get_current_str() {
                        let preview = content.chars().take(100).collect::<String>();
                        println!("\n  章节 {}: {} 字符", i, content.len());
                        println!("  预览: {}...", preview.replace('\n', " "));
                    }
                }
            }

            if num_chapters == 0 {
                println!("\n⚠ 警告: 没有找到任何章节！");
            }
        }
        Err(e) => {
            eprintln!("✗ EPUB 解析失败: {}", e);
        }
    }
}
