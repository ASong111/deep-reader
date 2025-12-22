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
}
