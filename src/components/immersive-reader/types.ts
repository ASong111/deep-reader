export interface Chapter {
  id: string;
  title: string;
  content: string;
  renderMode?: string | undefined; // "html", "markdown", "irp"
  headingLevel?: number | null; // 标题层级（1-6），用于 Markdown 等格式
  anchorId?: string | null; // 锚点 ID，用于 Markdown 格式的目录跳转
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

