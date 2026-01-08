// 最小irp数据结构体定义
struct Book {
    id: String,
    title: String,
    source_type: String, // pdf
}

struct Chapter {
    id: String,
    book_id: String,
    order_index: i32,
    title: Option<String>,
}

struct Block {
    id: String,
    chapter_id: String,
    order_index: i32,
    block_type: String, // paragraph
    text: String,
}
