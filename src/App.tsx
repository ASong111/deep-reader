import { useState, useCallback, useMemo, useEffect } from "react";
// V2 核心 API 导入路径变更
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import DOMPurify from "dompurify";
import { Sun, Moon, Bug } from "lucide-react";
import { useTranslation } from 'react-i18next';
// 导入沉浸式阅读器组件
import ImmersiveReader from "./components/immersive-reader/ImmersiveReader";
import { ThemeMode } from "./components/immersive-reader/types";
// 导入 Debug 面板
import ReadingUnitDebugger from "./components/debug/ReadingUnitDebugger";

interface Book {
  id: number;
  title: string;
  author: string;
  cover_image: string | null;
}

interface Chapter {
  title: string;
  id: string;
}

function App() {
  const { t } = useTranslation();
  const [books] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // 添加状态来切换 UI 模式
  const [useImmersiveUI, setUseImmersiveUI] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>('light');
  // Debug 模式状态
  const [debugMode, setDebugMode] = useState(false);
  const [debugBookId, setDebugBookId] = useState<number | null>(null);

  const isDark = theme === 'dark';

  // 主题切换时更新背景色
  useEffect(() => {
    const bgColor = theme === 'dark' ? '#2D2520' : '#F5F1E8';
    document.documentElement.style.setProperty('background-color', bgColor, 'important');
    document.body.style.setProperty('background-color', bgColor, 'important');
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.style.setProperty('background-color', bgColor, 'important');
    }
  }, [theme]);

  // 添加全屏切换监听
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        try {
          const appWindow = getCurrentWindow();
          const isFullscreen = await appWindow.isFullscreen();
          await appWindow.setFullscreen(!isFullscreen);
        } catch (error: any) {
          console.error('Fullscreen API error:', error);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  // 使用 useMemo 缓存清洗后的内容
  const sanitizedContent = useMemo(
    () => DOMPurify.sanitize(currentContent),
    [currentContent]
  );

  // const loadBooks = useCallback(async () => {
  //   try {
  //     const list = await invoke<Book[]>("get_books");
  //     setBooks(list);
  //   } catch (e) {
  //     console.error("Failed to load books:", e);
  //   }
  // }, []);

  // useEffect(() => {
  //   loadBooks();
  //   const unlistenPromise = listen("book-added", () => {
  //     loadBooks();
  //   });
    
  //   return () => {
  //     unlistenPromise.then((unlisten) => unlisten());
  //   };
  // }, [loadBooks]);

  const handleUpload = useCallback(async () => {
    setLoading(true);
    try {
      // 调用 Rust 指令，该指令会打开原生文件对话框
      const msg = await invoke("upload_epub_file");
      alert(msg);
    } catch (error) {
      alert(`Upload Failed: ${error}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBookClick = useCallback(async (id: number) => {
    setSelectedBookId(id);
    try {
      const toc = await invoke<Chapter[]>("get_book_details", { id });
      setChapters(toc);
      if (toc.length > 0) {
        handleChapterClick(id, 0);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleChapterClick = useCallback(async (bookId: number, index: number) => {
    try {
      const html = await invoke<string>("get_chapter_content", { bookId, chapterIndex: index });
      setCurrentContent(html); // 不在这里 sanitize，移到 useMemo
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleRemove = useCallback(async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if(confirm(t('book.confirmRemove'))) {
        await invoke("remove_book", { id });
        // loadBooks();
        if (selectedBookId === id) {
            setSelectedBookId(null);
            setChapters([]);
            setCurrentContent("");
        }
    }
  }, [t, selectedBookId]);

  // 根据 UI 模式选择内容
  const mainContent = useImmersiveUI ? (
    <ImmersiveReader theme={theme} />
  ) : (
    <div 
      className={`flex flex-col h-screen font-sans overflow-hidden transition-colors duration-300 ${
        isDark ? 'bg-[#2D2520] text-[#B8A895]' : 'bg-neutral-50 text-gray-800'
      }`}
    >
      
      {/* 顶部导航栏 */}
      <nav className={`h-14 border-b flex items-center justify-between px-6 shadow-sm z-20 ${
        isDark ? 'bg-[#3A302A] border-[#4A3D35]' : 'bg-white border-gray-200'
      }`}>
        <div className={`font-bold text-xl flex items-center gap-2 ${
          isDark ? 'text-[#D4A574]' : 'text-indigo-600'
        }`}>
           📚 {t('app.name')} <span className={`text-xs px-2 py-0.5 rounded ${
             isDark ? 'bg-[#4A3D35] text-[#B8A895]' : 'bg-gray-100 text-gray-500'
           }`}>{t('app.version')}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseImmersiveUI(true)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors shadow-sm ${
              isDark ? 'bg-[#4A3D35] hover:bg-[#524439] text-[#E8DDD0]' : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            🎨 {t('nav.tryImmersiveUI')}
          </button>
        <button
          onClick={handleUpload}
          disabled={loading}
          className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-all shadow-sm ${
            loading
              ? (isDark ? "bg-[#4A3D35] cursor-wait" : "bg-indigo-300 cursor-wait")
              : (isDark ? "bg-[#8B7355] hover:bg-[#9A8164]" : "bg-indigo-600 hover:bg-indigo-700")
          }`}
        >
            {loading ? t('nav.processing') : t('nav.importEPUB')}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        
        {/* 左侧窗格: 目录/列表 */}
        <aside className={`w-[300px] border-r flex flex-col flex-shrink-0 transition-all ${
          isDark ? 'bg-[#3A302A] border-[#4A3D35]' : 'bg-gray-50 border-gray-200'
        }`}>
          {!selectedBookId ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-xs font-semibold uppercase tracking-wider ${
                    isDark ? 'text-[#8B7355]' : 'text-gray-500'
                  }`}>{t('nav.library')}</h2>
                  <span className="text-xs text-gray-400">{books.length} {t('library.items')}</span>
              </div>
              <div className="space-y-3">
                {books.map((book) => (
                  <div
                    key={book.id}
                    onClick={() => handleBookClick(book.id)}
                    className={`p-3 rounded-lg border shadow-sm cursor-pointer transition-all flex items-start group ${
                      isDark
                        ? 'bg-[#4A3D35] border-[#524439] hover:shadow-md hover:border-[#8B7355]'
                        : 'bg-white border-gray-100 hover:shadow-md hover:border-indigo-100'
                    }`}
                  >
                    <div className="w-10 h-14 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
                        {book.cover_image ? <img src={book.cover_image} className="w-full h-full object-cover" alt="cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">N/A</div>}
                    </div>
                    <div className="ml-3 flex-1 min-w-0 flex flex-col justify-between h-14">
                      <div>
                        <h3 className={`text-sm font-medium truncate ${
                          isDark ? 'text-[#E8DDD0]' : 'text-gray-900'
                        }`} title={book.title}>{book.title}</h3>
                        <p className={`text-xs truncate ${
                          isDark ? 'text-[#B8A895]' : 'text-gray-500'
                        }`}>{book.author}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDebugBookId(book.id);
                          setDebugMode(true);
                        }}
                        className={`p-1 hover:text-blue-500 ${
                          isDark ? 'text-[#8B7355]' : 'text-gray-300'
                        }`}
                        title={t('book.debug')}
                      >
                        <Bug className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleRemove(e, book.id)}
                        className={`hover:text-red-500 p-1 ${
                          isDark ? 'text-[#8B7355]' : 'text-gray-300'
                        }`}
                      >
                        &times;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`flex flex-col h-full ${isDark ? 'bg-[#3A302A]' : 'bg-gray-50'}`}>
               <div className={`p-3 border-b flex items-center ${
                 isDark ? 'bg-[#3A302A] border-[#4A3D35]' : 'bg-gray-50 border-gray-200'
               }`}>
                 <button
                   onClick={() => setSelectedBookId(null)}
                   className={`text-xs font-medium flex items-center gap-1 transition-colors ${
                     isDark ? 'text-[#D4A574] hover:text-[#E8DDD0]' : 'text-indigo-600 hover:text-indigo-800'
                   }`}
                 >
                   <span>&larr;</span> {t('nav.backToLibrary')}
                 </button>
               </div>
               <div className="p-4 overflow-y-auto flex-1">
                 <h2 className={`text-xs font-semibold uppercase tracking-wider mb-4 ${
                   isDark ? 'text-[#8B7355]' : 'text-gray-500'
                 }`}>{t('nav.tableOfContents')}</h2>
                 <ul className="space-y-1">
                   {chapters.map((chapter, idx) => (
                     <li 
                       key={idx}
                       onClick={() => selectedBookId && handleChapterClick(selectedBookId, idx)}
                       className={`text-sm px-3 py-2 rounded-md cursor-pointer truncate transition-colors ${
                         isDark 
                           ? 'text-[#B8A895] hover:bg-[#4A3D35] hover:text-[#E8DDD0]' 
                           : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                       }`}
                     >
                       {chapter.title}
                     </li>
                   ))}
                 </ul>
               </div>
            </div>
          )}
        </aside>

        {/* 右侧窗格: 阅读器 (65%+) */}
        <main className={`flex-1 overflow-hidden relative flex flex-col h-full border-l ${
          isDark ? 'bg-[#2D2520] border-[#4A3D35]' : 'bg-white border-gray-200'
        }`}>
          {selectedBookId ? (
            <div className="flex-1 overflow-y-auto px-12 py-10 w-full mx-auto">
                <article className={`prose prose-lg max-w-3xl mx-auto ${
                  isDark ? 'prose-invert' : 'prose-slate'
                }`}>
                    {/* 阅读器内容 */}
                    <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
                </article>
            </div>
          ) : (
            <div className={`flex flex-col items-center justify-center h-full select-none ${
              isDark ? 'text-[#4A3D35]' : 'text-gray-300'
            }`}>
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              <p className="text-sm font-medium">{t('library.selectBook')}</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );

  return (
    <>
      {debugMode && debugBookId ? (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="absolute top-4 left-4 z-10">
            <button
              onClick={() => {
                setDebugMode(false);
                setDebugBookId(null);
              }}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
            >
              <span>&larr;</span> {t('debug.back')}
            </button>
          </div>
          <ReadingUnitDebugger bookId={debugBookId} />
        </div>
      ) : (
        mainContent
      )}
      {/* 全局主题切换按钮 */}
      <button
        onClick={toggleTheme}
        className="fixed bottom-8 right-8 p-4 rounded-full shadow-2xl transition-all duration-300 z-[9999] hover:scale-110"
        style={{
          backgroundColor: theme === 'dark' ? '#D4A574' : '#5A4A3A',
          color: theme === 'dark' ? '#2D2520' : '#F5F1E8'
        }}
        title={theme === 'dark' ? t('theme.switchToLight') : t('theme.switchToDark')}
      >
        {theme === 'dark' ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>
    </>
  );
}

export default App;