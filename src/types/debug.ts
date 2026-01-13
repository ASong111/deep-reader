// Debug 面板相关类型定义

export interface DebugSegmentScore {
  segment_id: string;
  scores: Record<string, number>;
  weights: Record<string, number>;
  total_score: number;
  decision: 'merge' | 'createnew';
  decision_reason: string;
  fallback: boolean;
  fallback_reason?: string;
  content_type?: 'frontmatter' | 'body' | 'backmatter';
  level?: number;
}

export interface ReadingUnit {
  id: string;
  book_id: number;
  title: string;
  level: number;
  parent_id?: string;
  segment_ids: string[];
  start_block_id: number;
  end_block_id: number;
  source: string;
  content_type?: 'frontmatter' | 'body' | 'backmatter';
}

export interface Segment {
  id: string;
  chapter_id: number;
  heading?: {
    text: string;
    level?: number;
  };
  length: number;
  position_ratio: number;
  toc_level?: number;
  source_format: 'epub' | 'pdf' | 'txt' | 'md' | 'html';
  start_block_id: number;
  end_block_id: number;
}
