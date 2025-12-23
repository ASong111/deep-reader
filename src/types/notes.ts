export interface Note {
  id: number;
  title: string;
  content: string | null;
  category_id: number | null;
  category_name: string | null;
  book_id: number | null;
  chapter_index: number | null;
  highlighted_text: string | null;
  annotation_type: 'highlight' | 'underline' | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string | null;
}

export interface CreateNoteRequest {
  title: string;
  content?: string;
  category_id?: number;
  book_id?: number;
  chapter_index?: number;
  highlighted_text?: string;
  annotation_type?: 'highlight' | 'underline';
  position_start?: number;
  position_end?: number;
  tag_ids?: number[];
}

export interface UpdateNoteRequest {
  id: number;
  title?: string;
  content?: string;
  category_id?: number;
  tag_ids?: number[];
}

export interface SearchNotesRequest {
  query: string;
  category_id?: number;
  tag_id?: number;
  tag_ids?: number[]; // 多标签筛选
  start_date?: string; // 开始日期 (YYYY-MM-DD)
  end_date?: string; // 结束日期 (YYYY-MM-DD)
  sort_by?: 'created_at' | 'updated_at' | 'title'; // 排序字段
  sort_order?: 'ASC' | 'DESC'; // 排序顺序
  limit?: number; // 分页限制
  offset?: number; // 分页偏移
}

export interface NoteStatistics {
  total_notes: number;
  today_created: number;
  week_created: number;
  avg_daily_created: number;
  total_duration_seconds: number;
  avg_session_duration_seconds: number;
}

export interface CategoryStatistics {
  category_id: number | null;
  category_name: string | null;
  note_count: number;
}

export interface TagStatistics {
  tag_id: number;
  tag_name: string;
  note_count: number;
}
