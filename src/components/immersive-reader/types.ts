export interface Chapter {
  id: string;
  title: string;
  content: string;
}

export interface Book {
  id: number;
  title: string;
  author: string;
  coverColor: string;
  coverImage?: string | null; // 可选的封面图片（base64）
  progress: number;
  chapters: Chapter[];
}

export type ViewMode = 'library' | 'reading' | 'analytics';
export type ThemeMode = 'light' | 'dark';

