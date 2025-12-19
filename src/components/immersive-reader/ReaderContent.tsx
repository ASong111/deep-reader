import { memo, useMemo } from 'react';
import { Moon, Sun } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Chapter, ThemeMode } from './types';

interface ReaderContentProps {
  chapter: Chapter;
  theme: ThemeMode;
  onThemeToggle: () => void;
}

const ReaderContent = memo(({ chapter, theme, onThemeToggle }: ReaderContentProps) => {
  const isDark = theme === 'dark';
  
  // 使用 useMemo 缓存清洗后的 HTML
  const sanitizedContent = useMemo(
    () => DOMPurify.sanitize(chapter.content),
    [chapter.content]
  );

  return (
    <section className={`w-4/5 overflow-y-auto transition-colors duration-300 relative ${
      isDark ? 'bg-neutral-900' : 'bg-neutral-50'
    }`}>
      {/* Theme Toggle Button - Fixed Position */}
      <button
        onClick={onThemeToggle}
        className={`fixed bottom-8 right-8 p-4 rounded-full shadow-2xl transition-all duration-300 z-50 hover:scale-110 ${
          isDark 
            ? 'bg-yellow-500 hover:bg-yellow-400 text-neutral-900' 
            : 'bg-neutral-800 hover:bg-neutral-700 text-white'
        }`}
        title={isDark ? '切换到日间模式' : '切换到夜间模式'}
      >
        {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-12 py-16">
        <article className={`prose prose-lg max-w-none ${
          isDark ? 'prose-invert' : 'prose-slate'
        }`}>
          {/* Chapter Title */}
          <div className="mb-8">
            <h1 className={`text-4xl font-bold mb-2 ${
              isDark ? 'text-white' : 'text-neutral-900'
            }`}>
              {chapter.title}
            </h1>
            <div className={`h-1 w-20 rounded ${
              isDark ? 'bg-blue-400' : 'bg-blue-600'
            }`}></div>
          </div>

          {/* Chapter Content - 使用清洗后的 HTML */}
          <div
            className={`leading-relaxed ${
              isDark ? 'text-neutral-300' : 'text-neutral-700'
            }`}
            dangerouslySetInnerHTML={{ __html: sanitizedContent }}
          />
        </article>
      </div>
    </section>
  );
});

ReaderContent.displayName = 'ReaderContent';

export default ReaderContent;

