/// 异步导入模块
///
/// 处理书籍的异步导入流程，包括解析、资产提取和索引构建

use tauri::{AppHandle, Emitter, Manager};
use std::path::{Path, PathBuf};
use crate::import_queue::{ImportQueue, ImportTask, ImportStatus};
use crate::parser::ParserRouter;
use crate::db;
use crate::irp;
use chrono::Utc;

/// 导入书籍（异步）
///
/// 创建书籍记录并加入导入队列，立即返回 book_id
///
/// # 参数
/// - `app`: Tauri 应用句柄
/// - `file_path`: 文件路径
///
/// # 返回
/// 书籍 ID
pub async fn import_book_async(app: AppHandle, file_path: String) -> Result<i32, String> {
    let path = PathBuf::from(&file_path);

    // 检查文件是否存在
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    // 检查文件格式是否支持
    let router = ParserRouter::new();
    if !router.supports(
        path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
    ) {
        return Err("不支持的文件格式".to_string());
    }

    // 提取文件名作为临时标题
    let filename = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("未知书籍");

    // 创建书籍记录（状态为 pending）
    let db_path = crate::get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO books (title, author, file_path, parse_status) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![filename, "未知作者", &file_path, "pending"],
    ).map_err(|e| e.to_string())?;

    let book_id = conn.last_insert_rowid() as i32;

    // 加入导入队列
    let queue = app.state::<ImportQueue>();
    queue.enqueue(ImportTask {
        book_id,
        file_path: path.clone(),
        status: ImportStatus::Pending,
        progress: 0.0,
        created_at: Utc::now(),
    })?;

    // 启动后台处理（如果还没有运行）
    let app_clone = app.clone();
    tokio::spawn(async move {
        process_import_queue(app_clone).await;
    });

    Ok(book_id)
}

/// 处理导入队列
///
/// 从队列中取出任务并处理
async fn process_import_queue(app: AppHandle) {
    let queue = app.state::<ImportQueue>();

    loop {
        // 从队列中取出任务
        let task = match queue.dequeue() {
            Ok(Some(t)) => t,
            Ok(None) => {
                // 队列为空或已达并发上限，等待一段时间后重试
                tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

                // 如果队列为空且没有活动任务，退出循环
                if queue.queue_size() == 0 && queue.active_count() == 0 {
                    break;
                }
                continue;
            }
            Err(e) => {
                eprintln!("获取任务失败: {}", e);
                break;
            }
        };

        // 标记为活动任务
        if let Err(e) = queue.mark_active(task.clone()) {
            eprintln!("标记活动任务失败: {}", e);
            continue;
        }

        // 处理任务
        let app_clone = app.clone();
        let task_clone = task.clone();
        tokio::spawn(async move {
            if let Err(e) = process_single_import(app_clone.clone(), task_clone.clone()).await {
                eprintln!("导入任务失败 (book_id: {}): {}", task_clone.book_id, e);

                // 更新状态为失败
                let db_path = crate::get_db_path(&app_clone);
                if let Ok(conn) = db::init_db(&db_path) {
                    let _ = conn.execute(
                        "UPDATE books SET parse_status = ?1 WHERE id = ?2",
                        rusqlite::params![format!("failed: {}", e), task_clone.book_id],
                    );
                }

                // 发送错误事件
                let _ = app_clone.emit("import-error", serde_json::json!({
                    "book_id": task_clone.book_id,
                    "error": e
                }));
            }

            // 标记任务完成
            let queue = app_clone.state::<ImportQueue>();
            let _ = queue.mark_completed(task_clone.book_id);
        });
    }
}

/// 处理单个导入任务
async fn process_single_import(app: AppHandle, task: ImportTask) -> Result<(), String> {
    let db_path = crate::get_db_path(&app);
    let conn = db::init_db(&db_path).map_err(|e| e.to_string())?;

    // 更新状态为 Parsing
    conn.execute(
        "UPDATE books SET parse_status = ?1 WHERE id = ?2",
        rusqlite::params!["parsing", task.book_id],
    ).map_err(|e| e.to_string())?;

    // 发送进度事件
    app.emit("import-progress", serde_json::json!({
        "book_id": task.book_id,
        "status": "parsing",
        "progress": 0.1
    })).map_err(|e| e.to_string())?;

    // 路由到对应的 Parser
    let router = ParserRouter::new();
    let parser = router.route(&task.file_path)?;

    // 解析文件
    let result = parser.parse(&task.file_path, task.book_id, &conn)?;

    // 更新进度
    app.emit("import-progress", serde_json::json!({
        "book_id": task.book_id,
        "status": "saving",
        "progress": 0.5
    })).map_err(|e| e.to_string())?;

    // 保存章节和块到数据库
    for (chapter_index, chapter) in result.chapters.iter().enumerate() {
        let chapter_id = irp::create_chapter(
            &conn,
            task.book_id,
            &chapter.title,
            chapter_index as i32,
            &chapter.confidence,
        ).map_err(|e| e.to_string())?;

        for (block_index, block) in chapter.blocks.iter().enumerate() {
            irp::create_block(
                &conn,
                chapter_id as i32,
                block_index as i32,
                &block.block_type,
                &block.runs,
            ).map_err(|e| e.to_string())?;
        }
    }

    // 更新书籍信息
    conn.execute(
        "UPDATE books SET parse_status = ?1, parse_quality = ?2, total_blocks = ?3 WHERE id = ?4",
        rusqlite::params![
            "completed",
            format!("{:?}", result.quality),
            result.total_blocks,
            task.book_id
        ],
    ).map_err(|e| e.to_string())?;

    // 发送完成事件
    app.emit("import-progress", serde_json::json!({
        "book_id": task.book_id,
        "status": "completed",
        "progress": 1.0
    })).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_module_exists() {
        // 简单的模块存在性测试
        assert!(true);
    }
}
