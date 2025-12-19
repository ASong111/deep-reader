use rusqlite::{Connection, Result};
use std::path::Path;

pub fn init_db<P: AsRef<Path>>(path: P) -> Result<Connection> {
    let conn = Connection::open(path)?;

    conn.execute("PRAGMA encoding = 'UTF-8'", [])?;
    
    conn.execute(
        "CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            author TEXT,
            file_path TEXT NOT NULL UNIQUE,
            cover_image TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    Ok(conn)
}