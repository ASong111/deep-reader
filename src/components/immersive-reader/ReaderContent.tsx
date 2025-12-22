import { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Moon, Sun, Highlighter, Underline, StickyNote, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { Chapter, ThemeMode } from './types';
import { Note } from '../../types/notes';

interface ReaderContentProps {
  chapter: Chapter;
  theme: ThemeMode;
  onThemeToggle: () => void;
  onTextSelection?: (text: string) => void;
  bookId?: number;
  chapterIndex?: number;
  notes?: Note[];
  onAnnotate?: (text: string, type: 'highlight' | 'underline') => void;
  onNoteClick?: (noteId: number) => void;
}

const ReaderContent = memo(({ 
  chapter, 
  theme, 
  onThemeToggle,
  onTextSelection,
  notes = [],
  onAnnotate,
  onNoteClick
}: ReaderContentProps) => {
  const isDark = theme === 'dark';
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  
  // 清除选择
  const handleClearSelection = useCallback(() => {
    setSelectedText("");
    setSelectionPosition(null);
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  // 使用 useMemo 处理标注渲染
  const renderedContent = useMemo(() => {
    let content = DOMPurify.sanitize(chapter.content);
    if (!notes || notes.length === 0) return content;

    // 按文本长度降序排序，防止短匹配破坏长匹配的 HTML 结构
    const sortedNotes = [...notes].sort((a, b) => 
      (b.highlighted_text?.length || 0) - (a.highlighted_text?.length || 0)
    );

    sortedNotes.forEach(note => {
      if (!note.highlighted_text) return;
      
      const type = note.annotation_type || 'highlight';
      const className = type === 'highlight' 
        ? 'text-highlight bg-yellow-200 dark:bg-yellow-800/50 px-0.5 rounded cursor-pointer transition-colors duration-200'
        : 'text-underline underline decoration-2 decoration-blue-500/50 dark:decoration-blue-400/50 cursor-pointer hover:decoration-blue-500 transition-all duration-200';
      
      // 改进匹配逻辑：转义正则特殊字符，并允许灵活的空白字符匹配
      const escapedText = note.highlighted_text
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\s+/g, '\\s+');
      
      // 匹配不在标签属性中的文本（防止破坏 HTML 标签）
      const regex = new RegExp(`(?![^<]*>)(${escapedText})`, 'g');
      
      content = content.replace(regex, `<span class="${className}" data-note-id="${note.id}" title="查看笔记">$1</span>`);
    });

    return content;
  }, [chapter.content, notes]);

  // 处理文本选择
  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectedText("");
        setSelectionPosition(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        setSelectedText("");
        setSelectionPosition(null);
        return;
      }

      // 检查选择是否在内容区域内
      const range = selection.getRangeAt(0);
      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setSelectedText("");
        setSelectionPosition(null);
        return;
      }

      setSelectedText(text);

    // 获取选择文本的位置
      const rect = range.getBoundingClientRect();
      
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    };

    // 点击其他地方时清除选择
    const handleClick = (e: MouseEvent) => {
      if (selectionPosition && contentRef.current) {
        const target = e.target as Node;
        if (!contentRef.current.contains(target)) {
          handleClearSelection();
        }
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
    };
  }, [selectionPosition]);

  // 应用高亮标注
  const applyHighlight = useCallback(() => {
    if (!selectedText || !onAnnotate) return;
    onAnnotate(selectedText, 'highlight');
    handleClearSelection();
  }, [selectedText, onAnnotate, handleClearSelection]);

  // 应用下划线标注
  const applyUnderline = useCallback(() => {
    if (!selectedText || !onAnnotate) return;
    onAnnotate(selectedText, 'underline');
    handleClearSelection();
  }, [selectedText, onAnnotate, handleClearSelection]);

  // 创建笔记
  const handleCreateNote = useCallback(() => {
    if (selectedText && onTextSelection) {
      onTextSelection(selectedText);
      handleClearSelection();
    }
  }, [selectedText, onTextSelection, handleClearSelection]);

  return (
    <section className={`w-2/5 overflow-y-auto transition-colors duration-300 relative ${
      isDark ? 'bg-neutral-900' : 'bg-neutral-50'
    }`}>
      {/* Theme Toggle Button */}
      <button
        onClick={onThemeToggle}
        className={`fixed bottom-8 right-8 p-4 rounded-full shadow-2xl transition-all duration-300 z-40 hover:scale-110 ${
          isDark 
            ? 'bg-yellow-500 hover:bg-yellow-400 text-neutral-900' 
            : 'bg-neutral-800 hover:bg-neutral-700 text-white'
        }`}
        title={isDark ? '切换到日间模式' : '切换到夜间模式'}
      >
        {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {/* 文本选择工具栏 */}
      {selectedText && selectionPosition && (
        <div
          className="fixed z-50 flex items-center gap-1 p-1.5 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-gray-200 dark:border-neutral-700 animate-in fade-in slide-in-from-bottom-2"
          style={{
            left: `${Math.min(selectionPosition.x, window.innerWidth - 200)}px`,
            top: `${Math.max(10, selectionPosition.y - 50)}px`,
            transform: 'translateX(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={applyHighlight}
            className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded transition-colors group"
            title="高亮"
          >
            <Highlighter className="w-4 h-4 text-yellow-600 dark:text-yellow-400 group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={applyUnderline}
            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-colors group"
            title="下划线"
          >
            <Underline className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform" />
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-neutral-600 mx-1"></div>
          <button
            onClick={handleCreateNote}
            className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded transition-colors group"
            title="创建笔记"
          >
            <StickyNote className="w-4 h-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" />
          </button>
          <button
            onClick={handleClearSelection}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors group"
            title="取消"
          >
            <X className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:scale-110 transition-transform" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="max-w-4xl mx-auto px-12 py-16" ref={contentRef}>
        <article className={`prose prose-lg max-w-none select-text ${
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

          {/* Chapter Content */}
          <div
            className={`leading-relaxed ${
              isDark ? 'text-neutral-300' : 'text-neutral-700'
            }`}
            dangerouslySetInnerHTML={{ __html: renderedContent }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const noteId = target.getAttribute('data-note-id');
              if (noteId && onNoteClick) {
                onNoteClick(parseInt(noteId));
              }
            }}
          />
        </article>
      </div>

      {/* 添加样式以支持标注的悬停效果 */}
      <style>{`
        .text-highlight:hover {
          background-color: rgba(251, 191, 36, 0.4) !important;
        }
        .text-underline:hover {
          text-decoration-thickness: 3px !important;
        }
      `}</style>
    </section>
  );
});

ReaderContent.displayName = 'ReaderContent';

export default ReaderContent;