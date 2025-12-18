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
  progress: number;
  chapters: Chapter[];
}

export type ViewMode = 'library' | 'reading';
export type ThemeMode = 'light' | 'dark';

