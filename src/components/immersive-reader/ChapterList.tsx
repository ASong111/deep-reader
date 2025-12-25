import { memo } from 'react';
import { Chapter, ThemeMode } from './types';

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterIndex: number;
  onChapterClick: (index: number) => void;
  theme?: ThemeMode;
}

const ChapterList = memo(({ chapters, activeChapterIndex, onChapterClick, theme = 'light' }: ChapterListProps) => {
  const isDark = theme === 'dark';
  
  return (
    <div className="p-6">
      <h2 
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
      >
        章节目录
      </h2>
      <ul className="space-y-1">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            onClick={() => onChapterClick(index)}
            className="px-4 py-3 rounded-lg cursor-pointer transition-all text-sm font-medium shadow-md"
            style={{
              backgroundColor: index === activeChapterIndex 
                ? (isDark ? '#8B7355' : '#A67C52')
                : 'transparent',
              color: index === activeChapterIndex
                ? '#FFFFFF'
                : (isDark ? '#E8DDD0' : '#3E3530')
            }}
            onMouseEnter={(e) => {
              if (index !== activeChapterIndex) {
                e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
              }
            }}
            onMouseLeave={(e) => {
              if (index !== activeChapterIndex) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {chapter.title}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default ChapterList;

