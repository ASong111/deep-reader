import { useState, useEffect, useCallback } from 'react';
import { BookOpen, ArrowLeft, Plus, BarChart3, ChevronLeft, Menu } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Book, ViewMode, ThemeMode } from './types';
import { Note, Category, Tag } from '../../types/notes';
import BookCard from './BookCard';
import ChapterList from './ChapterList';
import ReaderContent from './ReaderContent';
import NoteSidebar from '../notes/NoteSidebar';
import NoteDetailPanel from '../notes/NoteDetailPanel';
import CreateNoteDialog from '../notes/CreateNoteDialog';
import AnalyticsView from '../notes/AnalyticsView';
import { ToastContainer, useToastManager } from '../common/Toast';

// 后端返回的书籍类型
interface BackendBook {
  id: number;
  title: string;
  author: string;
  cover_image: string | null;
}

// 后端返回的章节信息类型
interface BackendChapterInfo {
  title: string;
  id: string;
}

const ImmersiveReader = () => {
  const { toasts, removeToast, showSuccess } = useToastManager();
  const [currentView, setCurrentView] = useState<ViewMode>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [readerTheme, setReaderTheme] = useState<ThemeMode>('light');
  const [loading, setLoading] = useState(false);

  // 笔记相关状态
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isCreateNoteDialogOpen, setIsCreateNoteDialogOpen] = useState(false);
  const [highlightedText, setHighlightedText] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [notesRefreshKey, setNotesRefreshKey] = useState(0);
  const [chapterNotes, setChapterNotes] = useState<Note[]>([]);
  const [jumpToNoteId, setJumpToNoteId] = useState<number | null>(null);
  const [isChapterListVisible, setIsChapterListVisible] = useState<boolean>(true);

  // 将后端书籍数据转换为前端格式
  const convertBackendBookToBook = useCallback((backendBook: BackendBook): Book => {
    // 根据 cover_image 生成 coverColor，始终提供一个后备背景色
    const defaultColors = [
      'bg-gradient-to-br from-slate-700 to-slate-900',
      'bg-gradient-to-br from-blue-700 to-blue-900',
      'bg-gradient-to-br from-purple-700 to-purple-900',
      'bg-gradient-to-br from-green-700 to-green-900',
      'bg-gradient-to-br from-amber-700 to-amber-900',
      'bg-gradient-to-br from-pink-700 to-pink-900',
    ];
    // 即使有封面图片，也提供一个 coverColor 作为后备背景
    const coverColor = defaultColors[backendBook.id % defaultColors.length];

    return {
      id: backendBook.id,
      title: backendBook.title,
      author: backendBook.author,
      coverColor,
      coverImage: backendBook.cover_image,
      progress: 0, // 默认进度为 0，后续可以从本地存储读取
      chapters: [], // 章节数据懒加载
    };
  }, []);

  // 加载书籍列表
  const loadBooks = useCallback(async () => {
    try {
      const backendBooks = await invoke<BackendBook[]>("get_books");
      // 添加详细的调试信息
      console.log("backendBooks raw: ", backendBooks);
      console.log("backendBooks JSON: ", JSON.stringify(backendBooks, null, 2));
      // 检查第一个元素的编码
      if (backendBooks.length > 0) {
        const first = backendBooks[0];
        console.log("First book title (raw):", first.title);
        console.log("First book title (char codes):", 
        Array.from(first.title).map(c => c.charCodeAt(0)));
        console.log("First book author (raw):", first.author);
        console.log("First book author (char codes):", 
        Array.from(first.author).map(c => c.charCodeAt(0)));
      }
      const convertedBooks = backendBooks.map(convertBackendBookToBook);
      console.log("convertedBooks: ", convertedBooks);
      setBooks(convertedBooks);
    } catch (e) {
      console.error("Failed to load books:", e);
    }
  }, [convertBackendBookToBook]);

  // 初始化加载书籍并监听事件
  useEffect(() => {
    loadBooks();
    const unlistenPromise = listen("book-added", () => {
      loadBooks();
    });
    
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [loadBooks]);

  // 主题切换时更新背景色（包括初始挂载）
  useEffect(() => {
    const bgColor = readerTheme === 'dark' ? '#2D2520' : '#F5F1E8';
    
    // 更新全局背景色，使用 setProperty 强制更新
    document.documentElement.style.setProperty('background-color', bgColor, 'important');
    document.body.style.setProperty('background-color', bgColor, 'important');
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.style.setProperty('background-color', bgColor, 'important');
    }
    
    // #region agent log
    const checkMismatchedColors = () => {
      const expectedMainBg = readerTheme === 'dark' ? 'rgb(45, 37, 32)' : 'rgb(245, 241, 232)';
      const mismatchedElements: any[] = [];
      
      // 检查关键元素
      const keyElements = [
        { el: document.documentElement, name: 'HTML' },
        { el: document.body, name: 'BODY' },
        { el: document.getElementById('root'), name: '#root' },
        { el: document.querySelector('main'), name: 'MAIN' }
      ];
      
      keyElements.forEach(({ el, name }) => {
        if (el) {
          const bg = window.getComputedStyle(el).backgroundColor;
          if (bg !== expectedMainBg && bg !== 'rgba(0, 0, 0, 0)') {
            mismatchedElements.push({ name, bg, expected: expectedMainBg });
          }
        }
      });
      
      // 查找所有大元素（>200x200）背景色与主题不符的
      const allElements = document.querySelectorAll('*');
      allElements.forEach((el: any) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 200 && rect.height > 200) {
          const styles = window.getComputedStyle(el);
          const bg = styles.backgroundColor;
          
          // 检查背景色是否与主题不符
          if (bg !== expectedMainBg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            // 检查是否是错误的主题色
            const wrongLightBg = 'rgb(245, 241, 232)';
            const wrongDarkBg = 'rgb(45, 37, 32)';
            const isWrongTheme = (readerTheme === 'dark' && bg === wrongLightBg) || (readerTheme === 'light' && bg === wrongDarkBg);
            
            if (isWrongTheme || Math.abs(rect.width * rect.height) > 100000) {
              mismatchedElements.push({
                tag: el.tagName,
                className: el.className?.substring(0, 40) || 'none',
                id: el.id || 'none',
                bg: bg,
                expected: expectedMainBg,
                isWrongTheme: isWrongTheme,
                size: `${Math.round(rect.width)}x${Math.round(rect.height)}`
              });
            }
          }
        }
      });
      
      if (mismatchedElements.length > 0) {
        fetch('http://127.0.0.1:7242/ingest/74ed1feb-fd97-42b7-bca9-db5b7412fc2c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImmersiveReader.tsx:checkMismatchedColors',message:'Found mismatched background colors',data:{readerTheme:readerTheme,expectedMainBg:expectedMainBg,mismatchedCount:mismatchedElements.length,mismatched:mismatchedElements},timestamp:Date.now(),sessionId:'debug-session',runId:'color-mismatch',hypothesisId:'H2'})}).catch(()=>{});
      }
    };
    
    setTimeout(checkMismatchedColors, 100);
    
    // 监听窗口调整大小
    const handleResize = () => {
      fetch('http://127.0.0.1:7242/ingest/74ed1feb-fd97-42b7-bca9-db5b7412fc2c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImmersiveReader.tsx:window:resize',message:'Window resized',data:{readerTheme:readerTheme,width:window.innerWidth,height:window.innerHeight},timestamp:Date.now(),sessionId:'debug-session',runId:'resize-check',hypothesisId:'H4'})}).catch(()=>{});
      setTimeout(checkMismatchedColors, 50);
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
    // #endregion
  }, [readerTheme, currentView]);


  // 导入书籍功能
  const handleImportBook = useCallback(async () => {
    setLoading(true);
    try {
      const msg = await invoke<string>("upload_epub_file");
      // 导入成功后会自动触发 book-added 事件，loadBooks 会被调用
      console.log(msg);
    } catch (error) {
      console.error("Upload Failed:", error);
      alert(`导入失败: ${error}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载书籍的章节数据
  const loadBookChapters = useCallback(async (bookId: number) => {
    try {
      const chapterInfos = await invoke<BackendChapterInfo[]>("get_book_details", { id: bookId });
      
      // 将章节信息转换为前端格式（先不加载内容，内容在切换章节时懒加载）
      const chapters = chapterInfos.map((info) => ({
        id: info.id,
        title: info.title,
        content: '', // 内容懒加载
      }));

      return chapters;
    } catch (e) {
      console.error("Failed to load book chapters:", e);
      return [];
    }
  }, []);

  // 加载章节内容
  const loadChapterContent = useCallback(async (bookId: number, chapterIndex: number) => {
    try {
      const content = await invoke<string>("get_chapter_content", { 
        bookId, 
        chapterIndex 
      });
      return content;
    } catch (e) {
      console.error("Failed to load chapter content:", e);
      return '';
    }
  }, []);

  // 打开书籍
  const handleBookClick = useCallback(async (book: Book) => {
    // 如果书籍还没有加载章节，先加载章节列表
    if (book.chapters.length === 0) {
      const chapters = await loadBookChapters(book.id);
      // 更新书籍的章节列表
      setBooks(prevBooks => 
        prevBooks.map(b => 
          b.id === book.id ? { ...b, chapters } : b
        )
      );
      // 加载第一个章节的内容
      if (chapters.length > 0) {
        const firstChapterContent = await loadChapterContent(book.id, 0);
        chapters[0].content = firstChapterContent;
        // 更新书籍数据
        const updatedBook = { ...book, chapters };
        setActiveBook(updatedBook);
        setActiveChapterIndex(0);
        setCurrentView('reading');
      } else {
        // 没有章节，直接打开
        setActiveBook({ ...book, chapters });
        setActiveChapterIndex(0);
        setCurrentView('reading');
      }
    } else {
      // 章节已加载，直接打开
      setActiveBook(book);
      setActiveChapterIndex(0);
      setCurrentView('reading');
    }
  }, [loadBookChapters, loadChapterContent]);

  // 返回图书馆
  const handleBackToLibrary = () => {
    setCurrentView('library');
    setActiveBook(null);
    setActiveChapterIndex(0);
  };

  // 切换章节
  const handleChapterClick = useCallback(async (index: number) => {
    if (!activeBook) return;
    
    setActiveChapterIndex(index);
    
    // 如果章节内容还没有加载，则加载它
    if (activeBook.chapters[index] && !activeBook.chapters[index].content) {
      const content = await loadChapterContent(activeBook.id, index);
      // 更新当前书籍的章节内容
      setActiveBook(prev => {
        if (!prev) return null;
        const updatedChapters = [...prev.chapters];
        updatedChapters[index] = { ...updatedChapters[index], content };
        return { ...prev, chapters: updatedChapters };
      });
      // 同时更新 books 列表中的对应书籍
      setBooks(prevBooks => 
        prevBooks.map(b => 
          b.id === activeBook.id 
            ? { ...b, chapters: b.chapters.map((ch, i) => 
                i === index ? { ...ch, content } : ch
              ) }
            : b
        )
      );
    }
  }, [activeBook, loadChapterContent]);

  // 跳转到下一章
  const handleNextChapter = useCallback(() => {
    if (!activeBook) return;
    const nextIndex = activeChapterIndex + 1;
    if (nextIndex < activeBook.chapters.length) {
      handleChapterClick(nextIndex);
    }
  }, [activeBook, activeChapterIndex, handleChapterClick]);

  // 切换阅读主题
  const toggleReaderTheme = () => {
    // #region agent log
    const currentTheme = readerTheme;
    const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    const rootEl = document.getElementById('root');
    const rootBg = rootEl ? window.getComputedStyle(rootEl).backgroundColor : 'null';
    fetch('http://127.0.0.1:7242/ingest/74ed1feb-fd97-42b7-bca9-db5b7412fc2c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImmersiveReader.tsx:toggleReaderTheme:BEFORE',message:'Theme toggle start',data:{currentTheme:currentTheme,htmlBg:htmlBg,bodyBg:bodyBg,rootBg:rootBg},timestamp:Date.now(),sessionId:'debug-session',runId:'theme-check',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    setReaderTheme(prev => prev === 'light' ? 'dark' : 'light');
    // #region agent log
    setTimeout(() => {
      const newTheme = readerTheme === 'light' ? 'dark' : 'light';
      const htmlBgAfter = window.getComputedStyle(document.documentElement).backgroundColor;
      const bodyBgAfter = window.getComputedStyle(document.body).backgroundColor;
      const rootElAfter = document.getElementById('root');
      const rootBgAfter = rootElAfter ? window.getComputedStyle(rootElAfter).backgroundColor : 'null';
      fetch('http://127.0.0.1:7242/ingest/74ed1feb-fd97-42b7-bca9-db5b7412fc2c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ImmersiveReader.tsx:toggleReaderTheme:AFTER',message:'Theme toggle complete',data:{newTheme:newTheme,htmlBgAfter:htmlBgAfter,bodyBgAfter:bodyBgAfter,rootBgAfter:rootBgAfter},timestamp:Date.now(),sessionId:'debug-session',runId:'theme-check',hypothesisId:'H1'})}).catch(()=>{});
    }, 100);
    // #endregion
  };

  // 加载分类和标签
  const loadCategoriesAndTags = useCallback(async () => {
    try {
      const [categoriesData, tagsData] = await Promise.all([
        invoke<Category[]>("get_categories"),
        invoke<Tag[]>("get_tags"),
      ]);
      setCategories(categoriesData);
      setTags(tagsData);
    } catch (error) {
      console.error("加载分类和标签失败:", error);
    }
  }, []);

  useEffect(() => {
    loadCategoriesAndTags();
  }, [loadCategoriesAndTags]);

  // 加载当前章节的笔记
  const loadChapterNotes = useCallback(async () => {
    if (!activeBook) return;
    try {
      const allNotes = await invoke<Note[]>("get_notes", { categoryId: null, tagId: null });
      const filtered = allNotes.filter(n => 
        n.book_id === activeBook.id && n.chapter_index === activeChapterIndex
      );
      setChapterNotes(filtered);
    } catch (error) {
      console.error("加载章节笔记失败:", error);
    }
  }, [activeBook, activeChapterIndex]);

  useEffect(() => {
    loadChapterNotes();
  }, [loadChapterNotes, notesRefreshKey]);

  // 处理标注（高亮/下划线）
  const handleAnnotate = useCallback(async (text: string, type: 'highlight' | 'underline') => {
    if (!activeBook) return;

    try {
      // 自动创建笔记
      const request = {
        title: text.length > 20 ? text.substring(0, 20) + "..." : text,
        content: "", // 默认内容为空
        book_id: activeBook.id,
        chapter_index: activeChapterIndex,
        highlighted_text: text,
        annotation_type: type,
      };

      await invoke("create_note", { request });
      setNotesRefreshKey(prev => prev + 1);
      
      // 显示成功提示
      const annotationType = type === 'highlight' ? '高亮' : '下划线';
      const displayText = text.length > 30 ? text.substring(0, 30) + "..." : text;
      showSuccess(`已添加${annotationType}标注: "${displayText}"`);
    } catch (error) {
      console.error("创建标注失败:", error);
    }
  }, [activeBook, activeChapterIndex, showSuccess]);

  // 处理点击标注
  const handleNoteClick = useCallback(async (noteId: number) => {
    try {
      const note = await invoke<Note>("get_note", { id: noteId });
      setSelectedNote(note);
    } catch (error) {
      console.error("获取笔记失败:", error);
    }
  }, []);

  // 处理文本选择并创建笔记
  const handleTextSelection = useCallback((text: string) => {
    setHighlightedText(text);
    setIsCreateNoteDialogOpen(true);
  }, []);

  // 处理创建笔记成功
  const handleNoteCreated = useCallback(() => {
    setNotesRefreshKey(prev => prev + 1);
    setIsCreateNoteDialogOpen(false);
    
    // 显示成功提示，包含所选文本
    if (highlightedText) {
      const displayText = highlightedText.length > 30 ? highlightedText.substring(0, 30) + "..." : highlightedText;
      showSuccess(`笔记创建成功: "${displayText}"`);
    } else {
      showSuccess("笔记创建成功");
    }
    
    setHighlightedText("");
  }, [highlightedText, showSuccess]);

  // 处理笔记选择
  const handleNoteSelect = useCallback((note: Note) => {
    setSelectedNote(note);
  }, []);

  // 处理笔记更新
  const handleNoteUpdate = useCallback(() => {
    setNotesRefreshKey(prev => prev + 1);
    if (selectedNote) {
      // 重新加载选中的笔记
      invoke<Note[]>("get_notes", { categoryId: null, tagId: null })
      .then(notes => {
        const updatedNote = notes.find(n => n.id === selectedNote.id);
        if (updatedNote) {
          setSelectedNote(updatedNote);
        }
      })
      .catch(console.error);
    }
  }, [selectedNote]);

  // 处理笔记删除
  const handleNoteDelete = useCallback((id: number) => {
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
    setNotesRefreshKey(prev => prev + 1);
  }, [selectedNote]);

  // 处理跳转到章节
  const handleJumpToChapter = useCallback((chapterIndex: number) => {
    if (activeBook) {
      handleChapterClick(chapterIndex);
    }
  }, [activeBook, handleChapterClick]);

  // 处理跳转到笔记位置
  const handleJumpToNote = useCallback((noteId: number) => {
    // 设置跳转目标，触发 ReaderContent 中的滚动逻辑
    setJumpToNoteId(noteId);
    // 清除跳转状态，以便下次点击时可以再次触发
    setTimeout(() => {
      setJumpToNoteId(null);
    }, 500);
  }, []);

  // Analytics View
  if (currentView === 'analytics') {
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
          {/* Header */}
          <header 
            className="h-16 border-b flex items-center justify-between px-8 shadow-lg"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <BarChart3 
                  className="w-8 h-8"
                  style={{ color: readerTheme === 'dark' ? '#D4A574' : '#A67C52' }}
                />
                <h1 
                  className="text-2xl font-bold"
                  style={{ color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530' }}
                >
                  数据分析
                </h1>
              </div>
              <nav className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('library')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#E8DDD0' : '#3E3530';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#B8A895' : '#6B5D52';
                  }}
                >
                  <BookOpen className="w-4 h-4" />
                  图书
                </button>
                <button
                  onClick={() => setCurrentView('analytics')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530',
                    backgroundColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#524439' : '#C9BDAD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                  }}
                >
                  <BarChart3 className="w-4 h-4" />
                  分析
                </button>
              </nav>
            </div>
          </header>

          {/* Analytics Content */}
          <main 
            className="flex-1 overflow-hidden"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8'
            }}
          >
            <AnalyticsView />
          </main>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    );
  }

  // Library View
  if (currentView === 'library') {
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
          {/* Header */}
          <header 
            className="h-16 border-b flex items-center justify-between px-8 shadow-lg"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <BookOpen 
                  className="w-8 h-8"
                  style={{ color: readerTheme === 'dark' ? '#D4A574' : '#A67C52' }}
                />
                <h1 
                  className="text-2xl font-bold"
                  style={{ color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530' }}
                >
                  图书馆
                </h1>
              </div>
              <nav className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('library')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium"
                  style={{
                    color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530',
                    backgroundColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#524439' : '#C9BDAD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                  }}
                >
                  图书
                </button>
                <button
                  onClick={() => setCurrentView('analytics')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#E8DDD0' : '#3E3530';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#B8A895' : '#6B5D52';
                  }}
                >
                  <BarChart3 className="w-4 h-4" />
                  分析
                </button>
              </nav>
            </div>
            <button
              onClick={handleImportBook}
              disabled={loading}
              className={`flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg transition-colors shadow-md ${
                loading ? 'opacity-50 cursor-wait' : ''
              }`}
              style={{
                backgroundColor: readerTheme === 'dark' ? '#8B7355' : '#A67C52',
                color: '#FFFFFF'
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#9A8164' : '#B58A61';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#8B7355' : '#A67C52';
                }
              }}
            >
              <Plus className="w-5 h-5" />
              {loading ? '导入中...' : '导入图书'}
            </button>
          </header>

          {/* Book Grid */}
          <main 
            className="flex-1 overflow-y-auto p-8"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8'
            }}
          >
            {books.length === 0 ? (
              <div 
                className="flex items-center justify-center h-full"
                style={{ color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52' }}
              >
                <p>暂无书籍，请点击上方按钮导入书籍</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                {books.map((book) => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    onClick={handleBookClick}
                    theme={readerTheme}
                  />
                ))}
              </div>
            )}
          </main>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    );
  }

  // Reading View - 修改这部分
  if (currentView === 'reading' && activeBook) {
    const safeChapterIndex = Math.max(
      0, 
      Math.min(activeChapterIndex, activeBook.chapters.length - 1)
    );
    
    if (activeBook.chapters.length === 0) {
      return (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8',
            margin: 0,
            padding: 0,
            overflow: 'hidden'
          }}
        >
          <header 
            className="h-16 border-b flex items-center px-8 shadow-lg"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <button
              onClick={handleBackToLibrary}
              className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8',
                color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#524439' : '#C9BDAD';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
              }}
            >
              <ArrowLeft className="w-5 h-5" />
              返回图书馆
            </button>
            <div className="ml-8 flex-1">
              <h1 
                className="text-xl font-bold"
                style={{ color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530' }}
              >
                {activeBook.title}
              </h1>
              <p 
                className="text-sm"
                style={{ color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52' }}
              >
                {activeBook.author}
              </p>
            </div>
          </header>
          <div 
            className="flex items-center justify-center flex-1"
            style={{ color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52' }}
          >
            <p>此书籍没有可用章节</p>
          </div>
        </div>
      );
    }

    const currentChapter = activeBook.chapters[safeChapterIndex];

    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <header 
          className="h-16 border-b flex items-center px-8 shadow-lg"
          style={{
            backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
            borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
          }}
        >
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8',
              color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#524439' : '#C9BDAD';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
            }}
          >
            <ArrowLeft className="w-5 h-5" />
            返回图书馆
          </button>
          <div className="ml-8 flex-1">
            <h1 
              className="text-xl font-bold"
              style={{ color: readerTheme === 'dark' ? '#E8DDD0' : '#3E3530' }}
            >
              {activeBook.title}
            </h1>
            <p 
              className="text-sm"
              style={{ color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52' }}
            >
              {activeBook.author}
            </p>
          </div>
        </header>

        {/* 三栏布局：笔记侧边栏 + 章节列表 + 阅读内容 + 笔记详情 */}
        <main 
          className="flex flex-1 overflow-hidden"
          style={{
            backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8'
          }}
        >
          {/* 左侧：笔记侧边栏 (20%) */}
          <div 
            className="w-1/5 border-r"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <NoteSidebar
              selectedNoteId={selectedNote?.id || null}
              onSelectNote={handleNoteSelect}
              onCreateNote={() => setIsCreateNoteDialogOpen(true)}
              currentBookId={activeBook.id}
              currentChapterIndex={safeChapterIndex}
              theme={readerTheme}
              key={notesRefreshKey}
            />
          </div>

          {/* 中间左侧：章节列表 (15% / 0%) */}
          <aside 
            className={`border-r overflow-hidden ${
              isChapterListVisible ? 'w-[15%]' : 'w-0'
            }`}
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8',
              transition: 'width 300ms ease-in-out'
            }}
          >
            <div 
              className={`h-full overflow-y-auto ${
                isChapterListVisible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{ transition: 'opacity 300ms' }}
            >
              <div className="relative h-full">
                {/* 收起按钮 */}
                <button
                  onClick={() => setIsChapterListVisible(false)}
                  className="absolute top-4 right-2 z-10 p-1.5 rounded transition-colors"
                  style={{
                    color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#E8DDD0' : '#3E3530';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = readerTheme === 'dark' ? '#B8A895' : '#6B5D52';
                  }}
                  title="收起章节列表"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <ChapterList
                  chapters={activeBook.chapters}
                  activeChapterIndex={safeChapterIndex}
                  onChapterClick={handleChapterClick}
                  theme={readerTheme}
                />
              </div>
            </div>
          </aside>

          {/* 展开按钮（当章节列表收起时显示） */}
          {!isChapterListVisible && (
            <button
              onClick={() => setIsChapterListVisible(true)}
              className="fixed left-[20%] top-1/2 -translate-y-1/2 z-20 p-2 border-r rounded-r-lg transition-all duration-300 shadow-lg"
              style={{
                backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
                color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52',
                borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8';
                e.currentTarget.style.color = readerTheme === 'dark' ? '#E8DDD0' : '#3E3530';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = readerTheme === 'dark' ? '#3A302A' : '#EAE4D8';
                e.currentTarget.style.color = readerTheme === 'dark' ? '#B8A895' : '#6B5D52';
              }}
              title="展开章节列表"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {/* 中间：阅读内容 (40% -> 55% 当章节列表收起时) */}
          <div 
            className={isChapterListVisible ? 'w-2/5' : 'w-[55%]'}
            style={{ transition: 'width 300ms ease-in-out' }}
          >
            <ReaderContent
              chapter={currentChapter}
              theme={readerTheme}
              onThemeToggle={toggleReaderTheme}
              onTextSelection={handleTextSelection}
              bookId={activeBook.id}
              chapterIndex={safeChapterIndex}
              notes={chapterNotes}
              onAnnotate={handleAnnotate}
              onNoteClick={handleNoteClick}
              jumpToNoteId={jumpToNoteId}
              onNextChapter={handleNextChapter}
              hasNextChapter={safeChapterIndex < activeBook.chapters.length - 1}
            />
          </div>

          {/* 右侧：笔记详情面板 (25%) */}
          <div 
            className="w-1/4 border-l"
            style={{
              backgroundColor: readerTheme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: readerTheme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <NoteDetailPanel
              note={selectedNote}
              onUpdate={handleNoteUpdate}
              onDelete={handleNoteDelete}
              categories={categories}
              tags={tags}
              onJumpToChapter={handleJumpToChapter}
              onJumpToNote={handleJumpToNote}
              theme={readerTheme}
            />
          </div>
        </main>

        {/* 创建笔记对话框 */}
        <CreateNoteDialog
          isOpen={isCreateNoteDialogOpen}
          onClose={() => {
            setIsCreateNoteDialogOpen(false);
            setHighlightedText("");
          }}
          onSuccess={handleNoteCreated}
          highlightedText={highlightedText}
          bookId={activeBook.id}
          chapterIndex={safeChapterIndex}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
    );
  }

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: readerTheme === 'dark' ? '#2D2520' : '#F5F1E8',
        color: readerTheme === 'dark' ? '#B8A895' : '#6B5D52',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}
    >
      <p>未知视图</p>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default ImmersiveReader;

