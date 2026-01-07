use rusqlite::{Connection, Result};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

/// 资产管理器
/// 负责提取、存储和管理书籍资产（主要是图片）
pub struct AssetManager {
    app_handle: AppHandle,
}

impl AssetManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }

    /// 提取图片并保存到本地
    ///
    /// # 参数
    /// - `book_id`: 书籍 ID
    /// - `image_data`: 图片二进制数据
    /// - `original_path`: 原始路径（用于提取扩展名）
    ///
    /// # 返回
    /// 相对路径（格式：assets/{book_id}/{hash}.{ext}）
    pub fn extract_image(
        &self,
        book_id: i32,
        image_data: &[u8],
        original_path: &str,
    ) -> Result<String, String> {
        // 1. 生成唯一文件名 (SHA256 hash + 扩展名)
        let mut hasher = Sha256::new();
        hasher.update(image_data);
        let hash = format!("{:x}", hasher.finalize());

        let ext = Path::new(original_path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");

        let filename = format!("{}.{}", &hash[..16], ext);

        // 2. 保存到 app_data_dir/assets/{book_id}/
        let app_data_dir = self
            .app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let asset_dir = app_data_dir.join("assets").join(book_id.to_string());
        fs::create_dir_all(&asset_dir).map_err(|e| e.to_string())?;

        let file_path = asset_dir.join(&filename);
        fs::write(&file_path, image_data).map_err(|e| e.to_string())?;

        // 3. 返回相对路径
        let relative_path = format!("assets/{}/{}", book_id, filename);
        Ok(relative_path)
    }

    /// 获取资产的完整路径
    pub fn get_asset_full_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let app_data_dir = self
            .app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        Ok(app_data_dir.join(relative_path))
    }

    /// 清理书籍的所有资产
    pub fn cleanup_book_assets(&self, book_id: i32) -> Result<(), String> {
        let app_data_dir = self
            .app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let asset_dir = app_data_dir.join("assets").join(book_id.to_string());

        if asset_dir.exists() {
            fs::remove_dir_all(&asset_dir).map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    /// 清理孤立的资产（没有对应书籍的资产）
    pub fn cleanup_orphaned_assets(&self, conn: &Connection) -> Result<u32, String> {
        // 获取所有有效的 book_id
        let mut stmt = conn
            .prepare("SELECT id FROM books")
            .map_err(|e| e.to_string())?;
        let valid_book_ids: Vec<i32> = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        // 扫描 assets 目录
        let app_data_dir = self
            .app_handle
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?;
        let assets_dir = app_data_dir.join("assets");

        let mut cleaned_count = 0;

        if assets_dir.exists() {
            for entry in fs::read_dir(&assets_dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                if let Ok(book_id) = entry.file_name().to_string_lossy().parse::<i32>() {
                    if !valid_book_ids.contains(&book_id) {
                        fs::remove_dir_all(entry.path()).map_err(|e| e.to_string())?;
                        cleaned_count += 1;
                    }
                }
            }
        }

        Ok(cleaned_count)
    }
}

// ==================== 数据库操作 ====================

/// 保存资产映射到数据库
pub fn save_asset_mapping(
    conn: &Connection,
    book_id: i32,
    original_path: &str,
    local_path: &str,
    asset_type: &str,
) -> Result<i64> {
    conn.execute(
        "INSERT INTO asset_mappings (book_id, original_path, local_path, asset_type)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![book_id, original_path, local_path, asset_type],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 获取资产的本地路径
pub fn get_local_path(
    conn: &Connection,
    book_id: i32,
    original_path: &str,
) -> Result<Option<String>> {
    let result = conn.query_row(
        "SELECT local_path FROM asset_mappings
         WHERE book_id = ?1 AND original_path = ?2",
        rusqlite::params![book_id, original_path],
        |row| row.get(0),
    );

    match result {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

/// 获取书籍的所有资产映射
pub fn get_book_assets(conn: &Connection, book_id: i32) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare(
        "SELECT original_path, local_path FROM asset_mappings WHERE book_id = ?1",
    )?;

    let assets = stmt
        .query_map([book_id], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(assets)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_hash_generation() {
        let data = b"test image data";
        let mut hasher = Sha256::new();
        hasher.update(data);
        let hash = format!("{:x}", hasher.finalize());

        assert_eq!(hash.len(), 64); // SHA256 产生 64 个十六进制字符
    }

    #[test]
    fn test_extract_extension() {
        let path = "images/cover.png";
        let ext = Path::new(path)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("png");

        assert_eq!(ext, "png");
    }

    #[test]
    fn test_save_and_get_asset_mapping() {
        use crate::db;

        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = db::init_db(&db_path).unwrap();

        // 创建测试书籍
        conn.execute(
            "INSERT INTO books (title, author, file_path) VALUES (?1, ?2, ?3)",
            rusqlite::params!["测试书籍", "测试作者", "/test/path"],
        )
        .unwrap();
        let book_id = conn.last_insert_rowid() as i32;

        // 保存资产映射
        let original_path = "images/cover.png";
        let local_path = "assets/1/abc123.png";
        save_asset_mapping(&conn, book_id, original_path, local_path, "image").unwrap();

        // 获取资产映射
        let result = get_local_path(&conn, book_id, original_path).unwrap();
        assert_eq!(result, Some(local_path.to_string()));

        // 测试不存在的映射
        let result = get_local_path(&conn, book_id, "nonexistent.png").unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn test_get_book_assets() {
        use crate::db;

        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = db::init_db(&db_path).unwrap();

        // 创建测试书籍
        conn.execute(
            "INSERT INTO books (title, author, file_path) VALUES (?1, ?2, ?3)",
            rusqlite::params!["测试书籍", "测试作者", "/test/path"],
        )
        .unwrap();
        let book_id = conn.last_insert_rowid() as i32;

        // 保存多个资产映射
        save_asset_mapping(&conn, book_id, "images/cover.png", "assets/1/abc123.png", "image").unwrap();
        save_asset_mapping(&conn, book_id, "images/page1.jpg", "assets/1/def456.jpg", "image").unwrap();

        // 获取所有资产
        let assets = get_book_assets(&conn, book_id).unwrap();
        assert_eq!(assets.len(), 2);
        assert!(assets.iter().any(|(orig, _)| orig == "images/cover.png"));
        assert!(assets.iter().any(|(orig, _)| orig == "images/page1.jpg"));
    }

    #[test]
    fn test_hash_deduplication() {
        // 测试相同数据生成相同哈希
        let data1 = b"test image data";
        let data2 = b"test image data";

        let mut hasher1 = Sha256::new();
        hasher1.update(data1);
        let hash1 = format!("{:x}", hasher1.finalize());

        let mut hasher2 = Sha256::new();
        hasher2.update(data2);
        let hash2 = format!("{:x}", hasher2.finalize());

        assert_eq!(hash1, hash2);

        // 测试不同数据生成不同哈希
        let data3 = b"different image data";
        let mut hasher3 = Sha256::new();
        hasher3.update(data3);
        let hash3 = format!("{:x}", hasher3.finalize());

        assert_ne!(hash1, hash3);
    }
}
