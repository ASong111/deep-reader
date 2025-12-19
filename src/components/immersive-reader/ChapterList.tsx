import { memo } from 'react';
import { Chapter } from './types';

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterIndex: number;
  onChapterClick: (index: number) => void;
}

const ChapterList = memo(({ chapters, activeChapterIndex, onChapterClick }: ChapterListProps) => {
  return (
    <div className="p-6">
      <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-4">
        Chapters
      </h2>
      <ul className="space-y-1">
        {chapters.map((chapter, index) => (
          <li
            key={chapter.id}
            onClick={() => onChapterClick(index)}
            className={`px-4 py-3 rounded-lg cursor-pointer transition-all text-sm ${
              index === activeChapterIndex
                ? 'bg-blue-600 text-white font-medium shadow-md'
                : 'text-neutral-300 hover:bg-neutral-700 hover:text-white'
            }`}
          >
            {chapter.title}
          </li>
        ))}
      </ul>
    </div>
  );
});

export default ChapterList;

