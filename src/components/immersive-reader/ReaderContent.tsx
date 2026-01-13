import { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Highlighter, Underline, StickyNote, X, ChevronRight, Sparkles } from 'lucide-react';
import DOMPurify from 'dompurify';
// import ReactMarkdown from 'react-markdown';
// import remarkGfm from 'remark-gfm';
import { Chapter, ThemeMode } from './types';
import { Note } from '../../types/notes';

interface ReaderContentProps {
  chapter: Chapter;
  theme: ThemeMode;
  onTextSelection?: (text: string) => void;
  bookId?: number;
  chapterIndex?: number;
  notes?: Note[];
  onAnnotate?: (text: string, type: 'highlight' | 'underline') => void;
  onNoteClick?: (noteId: number) => void;
  jumpToNoteId?: number | null;
  onNextChapter?: () => void;
  hasNextChapter?: boolean;
  onExplainText?: (text: string) => void;
}

// 独立的content组件，使用React.memo防止重新渲染导致DOM节点替换
const MemoizedContent = memo<{
  htmlContent: string;
  isDark: boolean;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onNoteClick?: (noteId: number) => void;
}>(({ htmlContent, isDark, contentRef, onNoteClick }) => {
  return (
    <div
      ref={contentRef}
      className="leading-relaxed reader-content"
      style={{
        color: isDark ? '#E8DDD0' : '#3E3530'
      }}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        const noteId = target.getAttribute('data-note-id');
        if (noteId && onNoteClick) {
          onNoteClick(parseInt(noteId));
        }
      }}
    />
  );
}, (prevProps, nextProps) => {
  // 只有htmlContent或isDark变化时才重新渲染，保持DOM节点稳定
  return prevProps.htmlContent === nextProps.htmlContent && 
         prevProps.isDark === nextProps.isDark;
});

const ReaderContent = memo(({ 
  chapter, 
  theme, 
  onTextSelection,
  notes = [],
  onAnnotate,
  onNoteClick,
  jumpToNoteId,
  onNextChapter,
  hasNextChapter = false,
  onExplainText,
}: ReaderContentProps) => {
  const isDark = theme === 'dark';
  
  const contentRef = useRef<HTMLDivElement>(null);
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const selectionMonitorRef = useRef<number | null>(null);
  const savedRangeRef = useRef<Range | null>(null);
  
  // 在组件挂载时立即注入CSS选择样式，确保在任何选择发生前样式就存在
  useEffect(() => {
    
    let styleEl = document.getElementById('reader-selection-style');    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'reader-selection-style';
      document.head.appendChild(styleEl);
    }
    const bgColor = isDark ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.3)';
    const textColor = isDark ? '#ffffff' : 'inherit';
    styleEl.textContent = `
      *::selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      *::-moz-selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      .prose ::selection,
      .prose *::selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      .prose ::-moz-selection,
      .prose *::-moz-selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      .reader-content ::selection,
      .reader-content *::selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
      .reader-content ::-moz-selection,
      .reader-content *::-moz-selection {
        background-color: ${bgColor} !important;
        color: ${textColor} !important;
      }
    `;
    
    
  }, [isDark]); // 当主题变化时重新注入CSS
  
  // 清除选择
  const handleClearSelection = useCallback(() => {
    
    // 停止selection监控
    if (selectionMonitorRef.current) {
      cancelAnimationFrame(selectionMonitorRef.current);
      selectionMonitorRef.current = null;
    }
    
    setSelectedText("");
    setSelectionPosition(null);
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  // 使用 useMemo 处理标注渲染
  const renderedContent = useMemo(() => {
    // 如果是 Markdown 模式，不处理标注（Markdown 会自己渲染）
    if (chapter.renderMode === 'markdown') {
      return chapter.content;
    }

    let content = DOMPurify.sanitize(chapter.content);
    if (!notes || notes.length === 0) {
      return content;
    }

    // 按文本长度降序排序，防止短匹配破坏长匹配的 HTML 结构
    const sortedNotes = [...notes].sort((a, b) =>
      (b.highlighted_text?.length || 0) - (a.highlighted_text?.length || 0)
    );

    let replacedCount = 0;
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
      const beforeReplace = content;
      content = content.replace(regex, `<span class="${className}" data-note-id="${note.id}" title="查看笔记">$1</span>`);
      if (content !== beforeReplace) {
        replacedCount++;
      }
    });

    return content;
  }, [chapter.content, chapter.renderMode, notes]);

  // 自动滚动到指定笔记位置
  useEffect(() => {
    if (jumpToNoteId && contentRef.current) {
      // 等待 DOM 更新完成
      setTimeout(() => {
        const noteElement = contentRef.current?.querySelector(
          `[data-note-id="${jumpToNoteId}"]`
        ) as HTMLElement;
        
        if (noteElement) {
          // 滚动到笔记位置，并添加高亮效果
          noteElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          
          // 添加临时高亮效果
          noteElement.classList.add('annotation-success');
          setTimeout(() => {
            noteElement.classList.remove('annotation-success');
          }, 1000);
        }
      }, 100);
    }
  }, [jumpToNoteId]);

  // 处理文本选择
  useEffect(() => {
    let selectionTimeout: number | null = null;
    let lastMouseUpTime = 0;

    // 处理文本选择完成事件
    const handleSelection = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        setSelectedText("");
        setSelectionPosition(null);
        return;
      }

      const text = selection.toString().trim();
      if (text.length === 0) {
        // 如果 mouseup 刚刚发生（100ms内），不清除选择，因为选择可能还在进行中
        if (Date.now() - lastMouseUpTime > 100) {
          setSelectedText("");
          setSelectionPosition(null);
        }
        return;
      }

      // 检查选择是否在内容区域内
      const range = selection.getRangeAt(0);      if (!contentRef.current?.contains(range.commonAncestorContainer)) {
        setSelectedText("");
        setSelectionPosition(null);
        return;
      }

      // 在更新状态前保存当前range
      const rangeToRestore = range.cloneRange();
      
      setSelectedText(text);

      // 获取选择文本的位置
      const rect = range.getBoundingClientRect();
      
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
      
      // React更新后，延迟恢复selection并持续监控
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && rangeToRestore) {
          try {
            sel.removeAllRanges();
            sel.addRange(rangeToRestore);            // 启动长期RAF监控以保持selection
            savedRangeRef.current = rangeToRestore.cloneRange();
            const startTime = Date.now();
            let monitorFrameCount = 0;
            
            const longTermMonitor = () => {
              monitorFrameCount++;
              const currentSel = window.getSelection();
              const elapsed = Date.now() - startTime;
              const currentType = currentSel?.type || 'none';
              
              // 每50帧或检测到问题时记录日志
              if (monitorFrameCount % 50 === 1 || currentType === 'Caret' || currentType === 'None') {
              }
              
              // 监控10秒
              if (elapsed > 10000) {
                selectionMonitorRef.current = null;
                return;
              }
              
              // 如果selection变成Caret，恢复它
              if (currentSel && savedRangeRef.current && currentSel.type === 'Caret') {
                try {
                  currentSel.removeAllRanges();
                  currentSel.addRange(savedRangeRef.current.cloneRange());                } catch (_err) {
                }
              }
              
              selectionMonitorRef.current = requestAnimationFrame(longTermMonitor);
            };
            
            // 取消之前的监控
            if (selectionMonitorRef.current) {
              cancelAnimationFrame(selectionMonitorRef.current);
            }
            selectionMonitorRef.current = requestAnimationFrame(longTermMonitor);
          } catch (_err) {
          }
        }
      }, 50);
      
      const isCollapsed = range.collapsed;      // CSS样式已在组件挂载时注入，这里不再重复注入
      // 只需确保选择范围保持活动状态
      if (isCollapsed) {
        return;
      }
      
      
    };

    // 处理鼠标抬起事件 - 延迟检查选择，确保浏览器完成选择
    const handleMouseUp = (_e: MouseEvent) => {
      lastMouseUpTime = Date.now();
      
      // 立即保存选择范围到ref中，避免useEffect重新运行时丢失
      const immediateSelection = window.getSelection();
      const immediateText = immediateSelection?.toString() || '';
      if (immediateSelection && immediateSelection.rangeCount > 0) {
        savedRangeRef.current = immediateSelection.getRangeAt(0).cloneRange();
        
        // 立即验证cloneRange是否成功        // 启动持续监控，防止selection被转换成Caret
        if (immediateText.length > 0) {
          
          const startTime = Date.now();
          let frameCount = 0;
          let lastRestoreTime = 0;
          const monitorSelection = () => {
            frameCount++;
            const sel = window.getSelection();
            const elapsed = Date.now() - startTime;
            const selType = sel?.type || 'none';            const rangeCount = sel?.rangeCount || 0;
            
            // 每10帧记录一次，避免日志过多
            if (frameCount % 10 === 1 || selType === 'Caret' || selType === 'None') {
            }
            
            // 只监控200ms（足够长以防止初始的Caret转换）
            if (elapsed > 200) {
              selectionMonitorRef.current = null;
              return;
            }
            
            // 如果selection变成了Caret或被清除，恢复它（但不要过于频繁）
            if (sel && savedRangeRef.current && Date.now() - lastRestoreTime > 5) {
              if (sel.type === 'Caret' || sel.rangeCount === 0 || (sel.toString().trim().length === 0 && rangeCount > 0)) {
                try {
                  // 检查savedRange状态                  sel.removeAllRanges();
                  sel.addRange(savedRangeRef.current.cloneRange());
                  lastRestoreTime = Date.now();                } catch (_err) {
                }
              }
            }
            
            // 继续监控 - 确保RAF持续运行
            selectionMonitorRef.current = requestAnimationFrame(monitorSelection);
          };
          
          // 停止之前的监控
          if (selectionMonitorRef.current) {
            cancelAnimationFrame(selectionMonitorRef.current);
          }
          
          // 开始监控
          selectionMonitorRef.current = requestAnimationFrame(monitorSelection);
        }
      } else {
        savedRangeRef.current = null;
      }
      
      // 延迟handleSelection到RAF监控结束后（150ms），避免React重新渲染导致Range失效
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
      }
      selectionTimeout = window.setTimeout(() => {
        handleSelection();
        selectionTimeout = null;
      }, 150);
    };

    // 添加mousedown监听用于调试
    const handleMouseDown = (_e: MouseEvent) => {
    };

    // 点击其他地方时清除选择
    const handleClick = (e: MouseEvent) => {
      
      // 如果点击在内容区域内，且有保存的选择范围，阻止默认行为并恢复selection
      if (contentRef.current && contentRef.current.contains(e.target as Node) && savedRangeRef.current) {
        // 阻止click事件的默认行为，防止浏览器清除selection
        e.preventDefault();
        // 立即恢复选择范围，防止click事件将其collapse成Caret
        const currentSelection = window.getSelection();
        if (currentSelection) {
          // 如果selection被collapse了（type是Caret），恢复Range
          if (currentSelection.type === 'Caret' || currentSelection.rangeCount === 0) {
            try {
              currentSelection.removeAllRanges();
              currentSelection.addRange(savedRangeRef.current.cloneRange());
            } catch (_err) {
              // 忽略错误
            }
          }
        }
        
        // 再次延迟检查，确保恢复成功
        setTimeout(() => {
          const selectionAfterDelay = window.getSelection();          // 如果还是被清除了，再次尝试恢复
          if (selectionAfterDelay && (selectionAfterDelay.type === 'Caret' || selectionAfterDelay.rangeCount === 0) && savedRangeRef.current) {
            try {
              selectionAfterDelay.removeAllRanges();
              selectionAfterDelay.addRange(savedRangeRef.current.cloneRange());
            } catch (_err) {
              // 忽略错误
            }
          }
        }, 10);
      }
      
      // 延迟处理清除逻辑，确保 mouseup 事件的处理已经完成
      setTimeout(() => {
        if (selectionPosition && contentRef.current) {
          const target = e.target as Node;
          const isInContent = contentRef.current.contains(target);
          
          if (!isInContent) {
            handleClearSelection();
            savedRangeRef.current = null;
          }
        }
      }, 100);
    };

    // 监听鼠标事件
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('click', handleClick);
    
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('click', handleClick);
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
      }
      // 不在cleanup中取消RAF监控 - RAF有自己的超时机制
      // RAF只在特定情况下取消：handleClearSelection或500ms超时
    };
  }, [selectionPosition, handleClearSelection, isDark]);

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

  // AI 释义
  const handleExplainText = useCallback(() => {
    if (selectedText && onExplainText) {
      onExplainText(selectedText);
      handleClearSelection();
    }
  }, [selectedText, onExplainText, handleClearSelection]);

  return (
    <section 
      className="w-full h-full overflow-y-auto relative"
      style={{
        backgroundColor: isDark ? '#2D2520' : '#F5F1E8'
      }}
    >
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
            className="p-2 hover:bg-yellow-100 dark:hover:bg-yellow-900 rounded transition-all duration-200 group active:scale-95"
            title="高亮"
          >
            <Highlighter className="w-4 h-4 text-yellow-600 dark:text-yellow-400 group-hover:scale-110 transition-transform duration-200" />
          </button>
          <button
            onClick={applyUnderline}
            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900 rounded transition-all duration-200 group active:scale-95"
            title="下划线"
          >
            <Underline className="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform duration-200" />
          </button>
          <div className="w-px h-6 bg-gray-300 dark:bg-neutral-600 mx-1"></div>
          <button
            onClick={handleExplainText}
            className="p-2 hover:bg-purple-100 dark:hover:bg-purple-900 rounded transition-all duration-200 group active:scale-95"
            title="AI 释义"
          >
            <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform duration-200" />
          </button>
          <button
            onClick={handleCreateNote}
            className="p-2 hover:bg-indigo-100 dark:hover:bg-indigo-900 rounded transition-all duration-200 group active:scale-95"
            title="创建笔记"
          >
            <StickyNote className="w-4 h-4 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-200" />
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
            <h1 
              className="text-4xl font-bold mb-2"
              style={{
                color: isDark ? '#E8DDD0' : '#3E3530'
              }}
            >
              {chapter.title}
            </h1>
            <div 
              className="h-1 w-20 rounded"
              style={{
                backgroundColor: isDark ? '#8B7355' : '#A67C52'
              }}
            ></div>
          </div>

          {/* Chapter Content - 根据 renderMode 选择渲染方式 */}
          {chapter.renderMode === 'markdown' ? (
            <div className="markdown-content">
              {/* TODO: 安装 react-markdown 后启用 Markdown 渲染 */}
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContent) }} />
            </div>
          ) : (
            <MemoizedContent
              htmlContent={renderedContent}
              isDark={isDark}
              contentRef={contentRef}
              onNoteClick={onNoteClick}
            />
          )}
        </article>

        {/* 下一章按钮 */}
        {hasNextChapter && onNextChapter && (
          <div className="mt-16 mb-12 flex justify-center border-t pt-8" style={{
            borderColor: isDark ? 'rgba(184, 168, 149, 0.2)' : 'rgba(107, 93, 82, 0.2)'
          }}>
            <button
              onClick={onNextChapter}
              className="group flex items-center gap-2 px-8 py-3 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
              style={{
                backgroundColor: isDark ? '#8B7355' : '#A67C52',
                color: isDark ? '#F5F1E8' : '#FFFFFF'
              }}
            >
              <span>下一章</span>
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-200" />
            </button>
          </div>
        )}
      </div>

      {/* 添加样式以支持标注的悬停效果 */}
      {/* 注意：::selection 样式已在 useEffect 中动态注入到 <head>，这里不再重复定义 */}
      <style>{`
        .reader-content {
          font-family: Arial, sans-serif !important;
        }
        .text-highlight:hover {
          background-color: rgba(251, 191, 36, 0.4) !important;
        }
        .text-underline:hover {
          text-decoration-thickness: 3px !important;
        }
        @keyframes successPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .annotation-success {
          animation: successPulse 0.3s ease-in-out;
        }

        /* EPUB 内容样式 */
        .reader-content p {
          margin-bottom: 1em;
          line-height: 1.8;
        }
        .reader-content h1, .reader-content h2, .reader-content h3,
        .reader-content h4, .reader-content h5, .reader-content h6 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: bold;
        }
        .reader-content h1 { font-size: 2em; }
        .reader-content h2 { font-size: 1.5em; }
        .reader-content h3 { font-size: 1.17em; }
        .reader-content img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 1em auto;
        }
        .reader-content blockquote {
          margin: 1em 2em;
          padding-left: 1em;
          border-left: 3px solid ${isDark ? '#8B7355' : '#A67C52'};
          font-style: italic;
        }
        .reader-content code {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: monospace;
        }
        .reader-content pre {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          padding: 1em;
          border-radius: 5px;
          overflow-x: auto;
        }
        .reader-content ul, .reader-content ol {
          margin: 1em 0;
          padding-left: 2em;
        }
        .reader-content li {
          margin: 0.5em 0;
        }

        /* Markdown 内容样式 */
        .markdown-content {
          font-family: Arial, sans-serif;
          line-height: 1.8;
          color: ${isDark ? '#E8DDD0' : '#3E3530'};
        }
        .markdown-content p {
          margin-bottom: 1em;
        }
        .markdown-content h1, .markdown-content h2, .markdown-content h3,
        .markdown-content h4, .markdown-content h5, .markdown-content h6 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: bold;
          color: ${isDark ? '#E8DDD0' : '#3E3530'};
        }
        .markdown-content h1 { font-size: 2em; }
        .markdown-content h2 { font-size: 1.5em; }
        .markdown-content h3 { font-size: 1.17em; }
        .markdown-content img {
          max-width: 100%;
          height: auto;
          display: block;
          margin: 1em auto;
        }
        .markdown-content blockquote {
          margin: 1em 2em;
          padding-left: 1em;
          border-left: 3px solid ${isDark ? '#8B7355' : '#A67C52'};
          font-style: italic;
          color: ${isDark ? '#B8A895' : '#6B5D52'};
        }
        .markdown-content code {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'};
          padding: 0.2em 0.4em;
          border-radius: 3px;
          font-family: monospace;
          font-size: 0.9em;
        }
        .markdown-content pre {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          padding: 1em;
          border-radius: 5px;
          overflow-x: auto;
          margin: 1em 0;
        }
        .markdown-content pre code {
          background-color: transparent;
          padding: 0;
        }
        .markdown-content ul, .markdown-content ol {
          margin: 1em 0;
          padding-left: 2em;
        }
        .markdown-content li {
          margin: 0.5em 0;
        }
        .markdown-content a {
          color: ${isDark ? '#8B7355' : '#A67C52'};
          text-decoration: underline;
        }
        .markdown-content a:hover {
          color: ${isDark ? '#9A8164' : '#B58A61'};
        }
        .markdown-content table {
          border-collapse: collapse;
          width: 100%;
          margin: 1em 0;
        }
        .markdown-content th, .markdown-content td {
          border: 1px solid ${isDark ? '#4A3D35' : '#D4C8B8'};
          padding: 0.5em;
          text-align: left;
        }
        .markdown-content th {
          background-color: ${isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
          font-weight: bold;
        }
      `}</style>
    </section>
  );
});

ReaderContent.displayName = 'ReaderContent';

export default ReaderContent;