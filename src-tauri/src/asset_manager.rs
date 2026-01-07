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
}
