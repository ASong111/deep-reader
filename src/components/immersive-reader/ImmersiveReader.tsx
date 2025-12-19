import { useState, useEffect, useCallback } from 'react';
import { BookOpen, ArrowLeft, Plus } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Book, ViewMode, ThemeMode } from './types';
import BookCard from './BookCard';
import ChapterList from './ChapterList';
import ReaderContent from './ReaderContent';

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
  const [currentView, setCurrentView] = useState<ViewMode>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [readerTheme, setReaderTheme] = useState<ThemeMode>('light');
  const [loading, setLoading] = useState(false);

  // 将后端书籍数据转换为前端格式
  const convertBackendBookToBook = useCallback((backendBook: BackendBook): Book => {
    // 根据 cover_image 生成 coverColor，如果没有封面则使用默认渐变色
    const defaultColors = [
      'bg-gradient-to-br from-slate-700 to-slate-900',
      'bg-gradient-to-br from-blue-700 to-blue-900',
      'bg-gradient-to-br from-purple-700 to-purple-900',
      'bg-gradient-to-br from-green-700 to-green-900',
      'bg-gradient-to-br from-amber-700 to-amber-900',
      'bg-gradient-to-br from-pink-700 to-pink-900',
    ];
    const coverColor = backendBook.cover_image 
      ? '' // 如果有封面图片，coverColor 可以为空，BookCard 组件会使用图片
      : defaultColors[backendBook.id % defaultColors.length];

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

  // 切换阅读主题
  const toggleReaderTheme = () => {
    setReaderTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // Library View
  if (currentView === 'library') {
    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        {/* Header */}
        <header className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center justify-between px-8 shadow-lg">
          <div className="flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-bold text-white">Library View</h1>
          </div>
          <button
            onClick={handleImportBook}
            disabled={loading}
            className={`flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md ${
              loading ? 'opacity-50 cursor-wait' : ''
            }`}
          >
            <Plus className="w-5 h-5" />
            {loading ? '导入中...' : 'Import Book'}
          </button>
        </header>

        {/* Book Grid */}
        <main className="flex-1 overflow-y-auto p-8">
          {books.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-400">
              <p>暂无书籍，请点击上方按钮导入书籍</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
              {books.map((book) => (
                <BookCard 
                  key={book.id} 
                  book={book} 
                  onClick={handleBookClick} 
                />
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // Reading View
  if (currentView === 'reading' && activeBook) {
    // 防御性验证：确保章节索引在有效范围内
    const safeChapterIndex = Math.max(
      0, 
      Math.min(activeChapterIndex, activeBook.chapters.length - 1)
    );
    
    // 如果没有章节，显示错误状态
    if (activeBook.chapters.length === 0) {
      return (
        <div className="flex flex-col h-screen bg-neutral-900">
          <header className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center px-8 shadow-lg">
            <button
              onClick={handleBackToLibrary}
              className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-medium rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Back to Library
            </button>
            <div className="ml-8 flex-1">
              <h1 className="text-xl font-bold text-white">{activeBook.title}</h1>
              <p className="text-sm text-neutral-400">{activeBook.author}</p>
            </div>
          </header>
          <div className="flex items-center justify-center flex-1 text-neutral-400">
            <p>此书籍没有可用章节</p>
          </div>
        </div>
      );
    }

    const currentChapter = activeBook.chapters[safeChapterIndex];

    return (
      <div className="flex flex-col h-screen bg-neutral-900">
        {/* Header */}
        <header className="h-16 bg-neutral-800 border-b border-neutral-700 flex items-center px-8 shadow-lg">
          <button
            onClick={handleBackToLibrary}
            className="flex items-center gap-2 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white font-medium rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Library
          </button>
          <div className="ml-8 flex-1">
            <h1 className="text-xl font-bold text-white">{activeBook.title}</h1>
            <p className="text-sm text-neutral-400">{activeBook.author}</p>
          </div>
        </header>

        {/* Split Layout: Chapters + Content */}
        <main className="flex flex-1 overflow-hidden">
          {/* Left Sidebar: Chapters (20% / 1/5) */}
          <aside className="w-1/5 bg-neutral-800 border-r border-neutral-700 overflow-y-auto">
            <ChapterList
              chapters={activeBook.chapters}
              activeChapterIndex={safeChapterIndex}
              onChapterClick={handleChapterClick}
            />
          </aside>

          {/* Right Content: Chapter Text (80% / 4/5) */}
          <ReaderContent
            chapter={currentChapter}
            theme={readerTheme}
            onThemeToggle={toggleReaderTheme}
          />
        </main>
      </div>
    );
  }

  return null;
};

export default ImmersiveReader;

