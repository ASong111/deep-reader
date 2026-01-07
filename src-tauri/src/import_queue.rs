use std::collections::{VecDeque, HashMap};
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;
use chrono::{DateTime, Utc};

/// 导入状态枚举
///
/// 表示导入任务的各个阶段
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum ImportStatus {
    /// 等待处理
    Pending,
    /// 正在解析文件
    Parsing,
    /// 正在提取资源（图片等）
    ExtractingAssets,
    /// 正在构建索引
    BuildingIndex,
    /// 完成
    Completed,
    /// 失败（包含错误信息）
    Failed(String),
}

/// 导入任务
///
/// 表示一个待处理或正在处理的书籍导入任务
#[derive(Clone, Debug)]
pub struct ImportTask {
    /// 书籍 ID
    pub book_id: i32,
    /// 文件路径
    pub file_path: PathBuf,
    /// 当前状态
    pub status: ImportStatus,
    /// 进度（0.0 - 1.0）
    pub progress: f32,
    /// 创建时间
    pub created_at: DateTime<Utc>,
}

/// 导入队列
///
/// 管理所有导入任务的队列，支持并发控制
pub struct ImportQueue {
    /// 待处理任务队列
    tasks: Arc<Mutex<VecDeque<ImportTask>>>,
    /// 正在处理的任务（book_id -> task）
    active_tasks: Arc<Mutex<HashMap<i32, ImportTask>>>,
    /// 最大并发任务数
    max_concurrent: usize,
}

impl ImportQueue {
    /// 创建新的导入队列
    ///
    /// # 参数
    /// - `max_concurrent`: 最大并发任务数
    pub fn new(max_concurrent: usize) -> Self {
        Self {
            tasks: Arc::new(Mutex::new(VecDeque::new())),
            active_tasks: Arc::new(Mutex::new(HashMap::new())),
            max_concurrent,
        }
    }

    /// 将任务加入队列
    ///
    /// # 参数
    /// - `task`: 要加入的任务
    ///
    /// # 返回
    /// 成功返回 Ok(())，失败返回错误信息
    pub fn enqueue(&self, task: ImportTask) -> Result<(), String> {
        let mut tasks = self.tasks.lock()
            .map_err(|e| format!("锁定任务队列失败: {}", e))?;
        tasks.push_back(task);
        Ok(())
    }

    /// 从队列中取出任务
    ///
    /// 如果当前活动任务数已达上限，返回 None
    ///
    /// # 返回
    /// - Ok(Some(task)): 成功取出任务
    /// - Ok(None): 队列为空或已达并发上限
    /// - Err(msg): 发生错误
    pub fn dequeue(&self) -> Result<Option<ImportTask>, String> {
        let mut tasks = self.tasks.lock()
            .map_err(|e| format!("锁定任务队列失败: {}", e))?;
        let active = self.active_tasks.lock()
            .map_err(|e| format!("锁定活动任务失败: {}", e))?;

        // 检查是否已达并发上限
        if active.len() >= self.max_concurrent {
            return Ok(None);
        }

        Ok(tasks.pop_front())
    }

    /// 标记任务为活动状态
    ///
    /// # 参数
    /// - `task`: 要标记的任务
    pub fn mark_active(&self, task: ImportTask) -> Result<(), String> {
        let mut active = self.active_tasks.lock()
            .map_err(|e| format!("锁定活动任务失败: {}", e))?;
        active.insert(task.book_id, task);
        Ok(())
    }

    /// 标记任务为完成
    ///
    /// # 参数
    /// - `book_id`: 书籍 ID
    pub fn mark_completed(&self, book_id: i32) -> Result<(), String> {
        let mut active = self.active_tasks.lock()
            .map_err(|e| format!("锁定活动任务失败: {}", e))?;
        active.remove(&book_id);
        Ok(())
    }

    /// 获取任务状态
    ///
    /// # 参数
    /// - `book_id`: 书籍 ID
    ///
    /// # 返回
    /// 如果任务存在，返回任务的克隆；否则返回 None
    pub fn get_status(&self, book_id: i32) -> Option<ImportTask> {
        let active = self.active_tasks.lock().ok()?;
        active.get(&book_id).cloned()
    }

    /// 更新任务进度和状态
    ///
    /// # 参数
    /// - `book_id`: 书籍 ID
    /// - `progress`: 新的进度值（0.0 - 1.0）
    /// - `status`: 新的状态
    pub fn update_progress(&self, book_id: i32, progress: f32, status: ImportStatus) -> Result<(), String> {
        let mut active = self.active_tasks.lock()
            .map_err(|e| format!("锁定活动任务失败: {}", e))?;

        if let Some(task) = active.get_mut(&book_id) {
            task.progress = progress;
            task.status = status;
        }

        Ok(())
    }

    /// 获取队列中的任务数量
    pub fn queue_size(&self) -> usize {
        self.tasks.lock().map(|t| t.len()).unwrap_or(0)
    }

    /// 获取活动任务数量
    pub fn active_count(&self) -> usize {
        self.active_tasks.lock().map(|t| t.len()).unwrap_or(0)
    }

    /// 检查是否有空闲槽位
    pub fn has_capacity(&self) -> bool {
        self.active_count() < self.max_concurrent
    }
}

impl Default for ImportQueue {
    fn default() -> Self {
        Self::new(3) // 默认最多 3 个并发任务
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_task(book_id: i32) -> ImportTask {
        ImportTask {
            book_id,
            file_path: PathBuf::from(format!("/test/book{}.epub", book_id)),
            status: ImportStatus::Pending,
            progress: 0.0,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn test_queue_creation() {
        let queue = ImportQueue::new(3);
        assert_eq!(queue.queue_size(), 0);
        assert_eq!(queue.active_count(), 0);
        assert!(queue.has_capacity());
    }

    #[test]
    fn test_enqueue_dequeue() {
        let queue = ImportQueue::new(3);
        let task = create_test_task(1);

        // 入队
        assert!(queue.enqueue(task.clone()).is_ok());
        assert_eq!(queue.queue_size(), 1);

        // 出队
        let dequeued = queue.dequeue().unwrap();
        assert!(dequeued.is_some());
        assert_eq!(dequeued.unwrap().book_id, 1);
        assert_eq!(queue.queue_size(), 0);
    }

    #[test]
    fn test_concurrent_limit() {
        let queue = ImportQueue::new(2);

        // 添加 3 个任务
        for i in 1..=3 {
            queue.enqueue(create_test_task(i)).unwrap();
        }
        assert_eq!(queue.queue_size(), 3);

        // 取出第一个任务并标记为活动
        let task1 = queue.dequeue().unwrap().unwrap();
        queue.mark_active(task1).unwrap();
        assert_eq!(queue.active_count(), 1);

        // 取出第二个任务并标记为活动
        let task2 = queue.dequeue().unwrap().unwrap();
        queue.mark_active(task2).unwrap();
        assert_eq!(queue.active_count(), 2);

        // 尝试取出第三个任务，应该返回 None（已达上限）
        let task3 = queue.dequeue().unwrap();
        assert!(task3.is_none());
        assert_eq!(queue.queue_size(), 1); // 第三个任务还在队列中
    }

    #[test]
    fn test_mark_completed() {
        let queue = ImportQueue::new(3);
        let task = create_test_task(1);

        queue.enqueue(task.clone()).unwrap();
        let dequeued = queue.dequeue().unwrap().unwrap();
        queue.mark_active(dequeued).unwrap();
        assert_eq!(queue.active_count(), 1);

        // 标记完成
        queue.mark_completed(1).unwrap();
        assert_eq!(queue.active_count(), 0);
    }

    #[test]
    fn test_get_status() {
        let queue = ImportQueue::new(3);
        let task = create_test_task(1);

        queue.enqueue(task.clone()).unwrap();
        let dequeued = queue.dequeue().unwrap().unwrap();
        queue.mark_active(dequeued).unwrap();

        // 获取状态
        let status = queue.get_status(1);
        assert!(status.is_some());
        assert_eq!(status.unwrap().book_id, 1);

        // 获取不存在的任务
        let status2 = queue.get_status(999);
        assert!(status2.is_none());
    }

    #[test]
    fn test_update_progress() {
        let queue = ImportQueue::new(3);
        let task = create_test_task(1);

        queue.enqueue(task.clone()).unwrap();
        let dequeued = queue.dequeue().unwrap().unwrap();
        queue.mark_active(dequeued).unwrap();

        // 更新进度
        queue.update_progress(1, 0.5, ImportStatus::Parsing).unwrap();

        let status = queue.get_status(1).unwrap();
        assert_eq!(status.progress, 0.5);
        assert_eq!(status.status, ImportStatus::Parsing);
    }

    #[test]
    fn test_import_status_equality() {
        assert_eq!(ImportStatus::Pending, ImportStatus::Pending);
        assert_eq!(ImportStatus::Parsing, ImportStatus::Parsing);
        assert_ne!(ImportStatus::Pending, ImportStatus::Parsing);
        assert_eq!(
            ImportStatus::Failed("error".to_string()),
            ImportStatus::Failed("error".to_string())
        );
    }

    #[test]
    fn test_has_capacity() {
        let queue = ImportQueue::new(2);
        assert!(queue.has_capacity());

        // 添加两个活动任务
        for i in 1..=2 {
            let task = create_test_task(i);
            queue.enqueue(task.clone()).unwrap();
            let dequeued = queue.dequeue().unwrap().unwrap();
            queue.mark_active(dequeued).unwrap();
        }

        assert!(!queue.has_capacity());

        // 完成一个任务
        queue.mark_completed(1).unwrap();
        assert!(queue.has_capacity());
    }

    #[test]
    fn test_multiple_enqueue_dequeue() {
        let queue = ImportQueue::new(3);

        // 添加多个任务
        for i in 1..=5 {
            queue.enqueue(create_test_task(i)).unwrap();
        }
        assert_eq!(queue.queue_size(), 5);

        // 按顺序取出
        for i in 1..=5 {
            let task = queue.dequeue().unwrap().unwrap();
            assert_eq!(task.book_id, i);
        }
        assert_eq!(queue.queue_size(), 0);
    }
}
