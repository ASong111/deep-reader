import { useState, useCallback, useMemo } from "react";
// V2 核心 API 导入路径变更
import { invoke } from "@tauri-apps/api/core";
import DOMPurify from "dompurify";
// 导入沉浸式阅读器组件
import ImmersiveReader from "./components/immersive-reader/ImmersiveReader";

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
  const [books] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentContent, setCurrentContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  // 添加状态来切换 UI 模式
  const [useImmersiveUI, setUseImmersiveUI] = useState(true);

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
    if(confirm("确定移除这本书吗?")) {
        await invoke("remove_book", { id });
        // loadBooks();
        if (selectedBookId === id) {
            setSelectedBookId(null);
            setChapters([]);
            setCurrentContent("");
        }
    }
  }, [ selectedBookId]);

  // 如果使用沉浸式 UI，直接返回新组件
  if (useImmersiveUI) {
    // 直接返回 ImmersiveReader，让它自己管理背景色
    return <ImmersiveReader />;
  }

  return (
    <div className="flex flex-col h-screen bg-neutral-50 text-gray-800 font-sans overflow-hidden">
      
      {/* 顶部导航栏 */}
      <nav className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm z-20">
        <div className="font-bold text-xl text-indigo-600 flex items-center gap-2">
           📚 DeepReader <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">v2.0</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setUseImmersiveUI(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-md transition-colors shadow-sm"
          >
            🎨 尝试沉浸式 UI
          </button>
        <button
          onClick={handleUpload}
          disabled={loading}
          className={`px-4 py-2 rounded-md text-sm font-medium text-white transition-all shadow-sm ${
            loading ? "bg-indigo-300 cursor-wait" : "bg-indigo-600 hover:bg-indigo-700 hover:shadow"
          }`}
        >
            {loading ? "Processing..." : "Import EPUB"}
          </button>
        </div>
      </nav>

      <div className="flex flex-1 overflow-hidden">
        
        {/* 左侧窗格: 目录/列表 */}
        <aside className="w-[300px] border-r border-gray-200 bg-gray-50 flex flex-col flex-shrink-0 transition-all">
          {!selectedBookId ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Library</h2>
                  <span className="text-xs text-gray-400">{books.length} items</span>
              </div>
              <div className="space-y-3">
                {books.map((book) => (
                  <div
                    key={book.id}
                    onClick={() => handleBookClick(book.id)}
                    className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm cursor-pointer hover:shadow-md hover:border-indigo-100 transition-all flex items-start group"
                  >
                    <div className="w-10 h-14 bg-gray-200 rounded flex-shrink-0 overflow-hidden">
                        {book.cover_image ? <img src={book.cover_image} className="w-full h-full object-cover" alt="cover" /> : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">N/A</div>}
                    </div>
                    <div className="ml-3 flex-1 min-w-0 flex flex-col justify-between h-14">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 truncate" title={book.title}>{book.title}</h3>
                        <p className="text-xs text-gray-500 truncate">{book.author}</p>
                      </div>
                    </div>
                    <button 
                        onClick={(e) => handleRemove(e, book.id)}
                        className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 p-1">
                        &times;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-gray-50">
               <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center">
                 <button 
                   onClick={() => setSelectedBookId(null)}
                   className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                 >
                   <span>&larr;</span> 返回图书馆
                 </button>
               </div>
               <div className="p-4 overflow-y-auto flex-1">
                 <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Table of Contents</h2>
                 <ul className="space-y-1">
                   {chapters.map((chapter, idx) => (
                     <li 
                       key={idx}
                       onClick={() => selectedBookId && handleChapterClick(selectedBookId, idx)}
                       className="text-sm text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 px-3 py-2 rounded-md cursor-pointer truncate transition-colors"
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
        <main className="flex-1 bg-white overflow-hidden relative flex flex-col h-full border-l border-gray-200">
          {selectedBookId ? (
            <div className="flex-1 overflow-y-auto px-12 py-10 w-full mx-auto">
                <article className="prose prose-slate prose-lg max-w-3xl mx-auto">
                    {/* 阅读器内容 */}
                    <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
                </article>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 select-none">
              <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              <p className="text-sm font-medium">Select a book to start reading</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;