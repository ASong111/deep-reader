use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EncryptionError {
    #[error("加密失败: {0}")]
    EncryptionFailed(String),
    #[error("解密失败: {0}")]
    DecryptionFailed(String),
    #[error("密钥管理错误: {0}")]
    KeyManagementError(String),
    #[error("IO错误: {0}")]
    IoError(#[from] std::io::Error),
}

const KEY_SIZE: usize = 32; // 256 bits
const NONCE_SIZE: usize = 12; // 96 bits for GCM

/// 生成256位加密密钥
pub fn generate_key() -> Vec<u8> {
    let mut key = vec![0u8; KEY_SIZE];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut key);
    key
}

/// 从文件读取密钥，如果不存在则生成并保存
pub fn get_or_create_key(key_path: &PathBuf) -> Result<Vec<u8>, EncryptionError> {
    if key_path.exists() {
        // 读取现有密钥
        let key_data = fs::read(key_path)?;
        if key_data.len() == KEY_SIZE {
            Ok(key_data)
        } else {
            Err(EncryptionError::KeyManagementError(
                "密钥文件大小不正确".to_string(),
            ))
        }
    } else {
        // 生成新密钥并保存
        let key = generate_key();
        // 确保目录存在
        if let Some(parent) = key_path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(key_path, &key)?;
        Ok(key)
    }
}

/// 加密内容
pub fn encrypt_content(content: &str, key: &[u8]) -> Result<String, EncryptionError> {
    if key.len() != KEY_SIZE {
        return Err(EncryptionError::EncryptionFailed(
            "密钥长度不正确".to_string(),
        ));
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| EncryptionError::EncryptionFailed(format!("初始化加密器失败: {}", e)))?;

    // 生成随机nonce
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    // 加密内容
    let ciphertext = cipher
        .encrypt(&nonce, content.as_bytes())
        .map_err(|e| EncryptionError::EncryptionFailed(format!("加密失败: {}", e)))?;

    // 将nonce和密文组合：nonce(12字节) + ciphertext
    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);

    // Base64编码
    Ok(general_purpose::STANDARD.encode(&combined))
}

/// 解密内容
pub fn decrypt_content(encrypted: &str, key: &[u8]) -> Result<String, EncryptionError> {
    if key.len() != KEY_SIZE {
        return Err(EncryptionError::DecryptionFailed(
            "密钥长度不正确".to_string(),
        ));
    }

    // Base64解码
    let combined = general_purpose::STANDARD
        .decode(encrypted)
        .map_err(|e| EncryptionError::DecryptionFailed(format!("Base64解码失败: {}", e)))?;

    if combined.len() < NONCE_SIZE {
        return Err(EncryptionError::DecryptionFailed(
            "加密数据格式不正确".to_string(),
        ));
    }

    // 分离nonce和密文
    let nonce = Nonce::from_slice(&combined[..NONCE_SIZE]);
    let ciphertext = &combined[NONCE_SIZE..];

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| EncryptionError::DecryptionFailed(format!("初始化解密器失败: {}", e)))?;

    // 解密
    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| EncryptionError::DecryptionFailed(format!("解密失败: {}", e)))?;

    String::from_utf8(plaintext)
        .map_err(|e| EncryptionError::DecryptionFailed(format!("UTF-8解码失败: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let key = generate_key();
        let content = "这是测试内容";

        let encrypted = encrypt_content(content, &key).unwrap();
        assert_ne!(encrypted, content);

        let decrypted = decrypt_content(&encrypted, &key).unwrap();
        assert_eq!(decrypted, content);
    }

    #[test]
    fn test_encrypt_decrypt_empty() {
        let key = generate_key();
        let content = "";

        let encrypted = encrypt_content(content, &key).unwrap();
        let decrypted = decrypt_content(&encrypted, &key).unwrap();
        assert_eq!(decrypted, content);
    }

    #[test]
    fn test_encrypt_decrypt_long_content() {
        let key = generate_key();
        let content = "这是一个很长的测试内容。".repeat(100);

        let encrypted = encrypt_content(&content, &key).unwrap();
        let decrypted = decrypt_content(&encrypted, &key).unwrap();
        assert_eq!(decrypted, content);
    }

    #[test]
    fn test_wrong_key() {
        let key1 = generate_key();
        let key2 = generate_key();
        let content = "测试内容";

        let encrypted = encrypt_content(content, &key1).unwrap();
        let result = decrypt_content(&encrypted, &key2);
        assert!(result.is_err());
    }
}

