import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { BookOpen, ArrowLeft, Plus, BarChart3, Settings } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Book, ViewMode, ThemeMode, Chapter } from './types';
import { Note, Category, Tag } from '../../types/notes';
import BookCard from './BookCard';
import ChapterList from './ChapterList';
import ReaderContent, { ReaderContentHandle } from './ReaderContent';
import NoteSidebar from '../notes/NoteSidebar';
import NoteDetailPanel from '../notes/NoteDetailPanel';
import CreateNoteDialog from '../notes/CreateNoteDialog';
import AnalyticsView from '../notes/AnalyticsView';
import { ToastContainer, useToastManager } from '../common/Toast';
import GlobalSettingsDialog from '../common/GlobalSettingsDialog';

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
  heading_level?: number | null;
}

interface ImmersiveReaderProps {
  theme: ThemeMode;
}

const ImmersiveReader = ({ theme }: ImmersiveReaderProps) => {
  const { t } = useTranslation();
  const { toasts, removeToast, showSuccess, showError } = useToastManager();
  const [currentView, setCurrentView] = useState<ViewMode>('library');
  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  // ReaderContent 的 ref，用于获取和设置滚动位置
  const readerContentRef = useRef<ReaderContentHandle>(null);

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

  // AI 助手相关状态（用于触发释义）
  const [aiSelectedText, setAiSelectedText] = useState<string>('');

  // 全局设置对话框状态
  const [isGlobalSettingsOpen, setIsGlobalSettingsOpen] = useState(false);

  // 阅读模式状态
  const [isReadingMode, setIsReadingMode] = useState(false);

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
      console.log('📚 加载书籍列表:', backendBooks.length, '本书');

      // 为每本书加载阅读进度并计算百分比
      const booksWithProgress = await Promise.all(
        backendBooks.map(async (backendBook) => {
          const book = convertBackendBookToBook(backendBook);

          try {
            // 获取章节列表以计算总章节数
            const chapters = await invoke<BackendChapterInfo[]>("get_book_details", {
              id: backendBook.id
            });
            console.log(`📖 书籍 "${backendBook.title}" 章节数:`, chapters.length);

            // 获取阅读进度
            const progress = await invoke<{ chapter_index: number; scroll_offset: number } | null>(
              'get_reading_progress',
              { bookId: backendBook.id }
            );
            console.log(`📍 书籍 "${backendBook.title}" 阅读进度:`, progress);

            // 计算进度百分比
            let progressPercentage = 0;
            if (progress && chapters.length > 0) {
              // 基于章节索引计算进度
              // 使用 (chapter_index + 1) 因为索引从0开始，这样第一章会显示一定进度
              progressPercentage = Math.round(((progress.chapter_index + 1) / chapters.length) * 100);
              // 确保进度在 0-100 之间
              progressPercentage = Math.max(0, Math.min(100, progressPercentage));
              console.log(`📊 书籍 "${backendBook.title}" 进度百分比:`, progressPercentage, '%');
            }

            return {
              ...book,
              progress: progressPercentage
            };
          } catch (error) {
            console.error(`❌ 加载书籍 "${backendBook.title}" 进度失败:`, error);
            return book; // 返回默认进度为 0 的书籍
          }
        })
      );

      console.log('✅ 所有书籍进度加载完成:', booksWithProgress);
      setBooks(booksWithProgress);
    } catch (e) {
      console.error("Failed to load books:", e);
    }
  }, [convertBackendBookToBook]);

  // 初始化加载书籍并监听事件
  useEffect(() => {
    loadBooks();

    // 监听书籍添加事件
    const unlistenBookAdded = listen("book-added", () => {
      loadBooks();
    });

    // 监听导入进度事件
    const unlistenProgress = listen<{book_id: number, status: string, progress: number}>("import-progress", (event) => {
      const { status } = event.payload;

      // 如果导入完成，刷新书籍列表
      if (status === "completed") {
        loadBooks();
        showSuccess(t('nav.processing') + ' ' + t('common.success'));
      }
    });

    // 监听导入错误事件
    const unlistenError = listen<{book_id: number, error: string}>("import-error", (event) => {
      console.error("导入错误:", event.payload);
      showError(`${t('errors.uploadFailed')}: ${event.payload.error}`);
      loadBooks(); // 刷新列表以显示失败状态
    });

    return () => {
      unlistenBookAdded.then((unlisten) => unlisten());
      unlistenProgress.then((unlisten) => unlisten());
      unlistenError.then((unlisten) => unlisten());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // F11 键监听 - 切换阅读模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 只在阅读视图中响应 F11
      if (e.key === 'F11' && currentView === 'reading') {
        e.preventDefault();
        setIsReadingMode(prev => {
          const newMode = !prev;
          if (newMode) {
            showSuccess(t('reader.readingMode') + ' - F11 ' + t('reader.exitReadingMode'));
          } else {
            showSuccess(t('reader.exitReadingMode'));
          }
          return newMode;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentView, showSuccess]);


  // 导入书籍功能
  const handleImportBook = useCallback(async () => {
    setLoading(true);
    try {
      await invoke<string>("upload_epub_file");
      showSuccess(t('nav.processing'));
    } catch (error) {
      console.error("Upload Failed:", error);
      showError(`${t('errors.uploadFailed')}: ${error}`);
    } finally {
      setLoading(false);
    }
  }, [showSuccess, showError, t]);

  // 加载书籍的章节数据
  const loadBookChapters = useCallback(async (bookId: number) => {
    try {
      const chapterInfos = await invoke<BackendChapterInfo[]>("get_book_details", { id: bookId });
      
      // 将章节信息转换为前端格式（先不加载内容，内容在切换章节时懒加载）
      const chapters = chapterInfos.map((info) => ({
        id: info.id,
        title: info.title,
        content: '', // 内容懒加载
        renderMode: '' as string | undefined, // 渲染模式在加载内容时设置
        headingLevel: info.heading_level ?? undefined,
      }));

      return chapters;
    } catch (e) {
      console.error("Failed to load book chapters:", e);
      return [];
    }
  }, []);

  // 加载章节内容
  const loadChapterContent = useCallback(async (bookId: number, chapterId: string) => {
    try {
      const response = await invoke<{content: string, render_mode: string}>("get_chapter_content", {
        bookId: bookId,
        chapterId: parseInt(chapterId)
      });
      return response;
    } catch (e) {
      console.error("❌ 前端: 加载章节内容失败:", e);
      return { content: '', render_mode: 'irp' };
    }
  }, []);

  // 打开书籍
  const handleBookClick = useCallback(async (book: Book) => {
    // 获取阅读进度
    let savedProgress: { chapter_index: number; scroll_offset: number } | null = null;
    try {
      savedProgress = await invoke<{ chapter_index: number; scroll_offset: number } | null>(
        'get_reading_progress',
        { bookId: book.id }
      );
      console.log('📖 打开书籍，已保存的进度:', savedProgress);
    } catch (error) {
      console.error('获取阅读进度失败:', error);
    }

    // 如果书籍还没有加载章节，先加载章节列表
    if (book.chapters.length === 0) {
      const chapters = await loadBookChapters(book.id);
      // 更新书籍的章节列表
      setBooks(prevBooks =>
        prevBooks.map(b =>
          b.id === book.id ? { ...b, chapters } : b
        )
      );

      // 确定要打开的章节索引
      const targetChapterIndex = savedProgress ? savedProgress.chapter_index : 0;
      console.log('🎯 目标章节索引:', targetChapterIndex);

      // 加载目标章节的内容
      if (chapters.length > 0 && targetChapterIndex < chapters.length) {
        const response = await loadChapterContent(book.id, chapters[targetChapterIndex].id);
        chapters[targetChapterIndex] = {
          ...chapters[targetChapterIndex],
          content: response.content,
          renderMode: response.render_mode as string | undefined
        };
        // 更新书籍数据
        const updatedBook = { ...book, chapters };
        setActiveBook(updatedBook);
        setActiveChapterIndex(targetChapterIndex);
        setCurrentView('reading');

        // 恢复滚动位置
        if (savedProgress && savedProgress.scroll_offset > 0) {
          console.log('⏳ 准备恢复滚动位置到:', savedProgress.scroll_offset);
          setTimeout(() => {
            console.log('📜 执行滚动到:', savedProgress.scroll_offset);
            readerContentRef.current?.setScrollPosition(savedProgress.scroll_offset);
            // 验证滚动是否成功
            setTimeout(() => {
              const currentScroll = readerContentRef.current?.getScrollPosition() || 0;
              console.log('✅ 当前滚动位置:', currentScroll, '目标:', savedProgress.scroll_offset);
            }, 500);
          }, 300); // 增加延迟到300ms
        }
      } else {
        // 没有章节，直接打开
        setActiveBook({ ...book, chapters });
        setActiveChapterIndex(0);
        setCurrentView('reading');
      }
    } else {
      // 章节已加载，直接打开
      const targetChapterIndex = savedProgress ? savedProgress.chapter_index : 0;
      console.log('🎯 目标章节索引:', targetChapterIndex);
      setActiveBook(book);
      setActiveChapterIndex(targetChapterIndex);
      setCurrentView('reading');

      // 恢复滚动位置
      if (savedProgress && savedProgress.scroll_offset > 0) {
        console.log('⏳ 准备恢复滚动位置到:', savedProgress.scroll_offset);
        setTimeout(() => {
          console.log('📜 执行滚动到:', savedProgress.scroll_offset);
          window.scrollTo({
            top: savedProgress.scroll_offset,
            behavior: 'smooth'
          });
          // 验证滚动是否成功
          setTimeout(() => {
            const currentScroll = window.scrollY || document.documentElement.scrollTop;
            console.log('✅ 当前滚动位置:', currentScroll, '目标:', savedProgress.scroll_offset);
          }, 500);
        }, 300); // 增加延迟到300ms
      }
    }
  }, [loadBookChapters, loadChapterContent]);

  // 返回图书馆
  const handleBackToLibrary = async () => {
    // 保存当前阅读进度
    if (activeBook && activeChapterIndex !== undefined) {
      try {
        const scrollOffset = readerContentRef.current?.getScrollPosition() || 0;
        console.log('💾 返回图书馆前保存进度:', {
          bookId: activeBook.id,
          chapterIndex: activeChapterIndex,
          scrollOffset
        });

        await invoke('save_reading_progress', {
          bookId: activeBook.id,
          chapterIndex: activeChapterIndex,
          scrollOffset: Math.round(scrollOffset),
        });
        console.log('✅ 阅读进度保存成功');
      } catch (error) {
        console.error('❌ 保存阅读进度失败:', error);
      }
    }

    setCurrentView('library');
    setActiveBook(null);
    setActiveChapterIndex(0);
    // 重新加载书籍列表以更新阅读进度
    loadBooks();
  };

  // 切换章节
  const handleChapterClick = useCallback(async (index: number) => {
    if (!activeBook) return;

    // 保存当前章节的阅读进度
    if (activeChapterIndex !== undefined && activeChapterIndex !== index) {
      try {
        const scrollOffset = readerContentRef.current?.getScrollPosition() || 0;
        console.log('💾 切换章节前保存进度:', {
          bookId: activeBook.id,
          chapterIndex: activeChapterIndex,
          scrollOffset
        });

        await invoke('save_reading_progress', {
          bookId: activeBook.id,
          chapterIndex: activeChapterIndex,
          scrollOffset: Math.round(scrollOffset),
        });
        console.log('✅ 阅读进度保存成功');
      } catch (error) {
        console.error('❌ 保存阅读进度失败:', error);
      }
    }

    setActiveChapterIndex(index);

    // 检查是否是 Markdown 格式
    const isMarkdown = activeBook.chapters[index]?.renderMode === 'markdown' ||
                       (activeBook.chapters[0]?.renderMode === 'markdown');

    if (isMarkdown) {
      // Markdown 格式：如果第一个章节已加载，所有章节共享同一份内容
      if (activeBook.chapters[0]?.content) {
        // 内容已加载，只需滚动到对应锚点
        // 使用章节标题生成锚点 ID
        const chapterTitle = activeBook.chapters[index].title;
        const anchorId = `heading-${chapterTitle.replace(/\s+/g, '-').toLowerCase()}`;

        setTimeout(() => {
          const element = document.getElementById(anchorId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);

        // 确保所有章节都有内容引用
        if (!activeBook.chapters[index].content) {
          setActiveBook(prev => {
            if (!prev) return null;
            const updatedChapters = prev.chapters.map(ch => ({
              ...ch,
              content: prev.chapters[0].content,
              renderMode: prev.chapters[0].renderMode
            }));
            return { ...prev, chapters: updatedChapters };
          });
        }
      } else {
        // 第一次加载 Markdown 内容
        const response = await loadChapterContent(activeBook.id, activeBook.chapters[0].id);
        // 将内容分配给所有章节
        setActiveBook(prev => {
          if (!prev) return null;
          const updatedChapters = prev.chapters.map(ch => ({
            ...ch,
            content: response.content,
            renderMode: response.render_mode as string | undefined
          }));
          return { ...prev, chapters: updatedChapters };
        });
        // 同时更新 books 列表
        setBooks(prevBooks =>
          prevBooks.map(b =>
            b.id === activeBook.id
              ? { ...b, chapters: b.chapters.map(ch => ({
                  ...ch,
                  content: response.content,
                  renderMode: response.render_mode as string | undefined
                })) }
              : b
          )
        );

        // 加载完成后滚动到对应锚点
        const chapterTitle = activeBook.chapters[index].title;
        const anchorId = `heading-${chapterTitle.replace(/\s+/g, '-').toLowerCase()}`;

        setTimeout(() => {
          const element = document.getElementById(anchorId);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);
      }
    } else {
      // 非 Markdown 格式：按原有逻辑加载章节
      if (activeBook.chapters[index] && !activeBook.chapters[index].content) {
        const response = await loadChapterContent(activeBook.id, activeBook.chapters[index].id);
        // 更新当前书籍的章节内容
        setActiveBook(prev => {
          if (!prev) return null;
          const updatedChapters = [...prev.chapters];
          updatedChapters[index] = {
            ...updatedChapters[index],
            content: response.content,
            renderMode: response.render_mode as string | undefined
          };
          return { ...prev, chapters: updatedChapters };
        });
        // 同时更新 books 列表中的对应书籍
        setBooks(prevBooks =>
          prevBooks.map(b =>
            b.id === activeBook.id
              ? { ...b, chapters: b.chapters.map((ch, i) =>
                  i === index ? { ...ch, content: response.content, renderMode: response.render_mode as string | undefined } : ch
                ) }
              : b
          )
        );
      }
    }
  }, [activeBook, loadChapterContent, activeChapterIndex]);

  // 检查章节是否应该被跳过（有子节的章本身应该被跳过）
  const shouldSkipChapter = useCallback((index: number, chapters: Chapter[]): boolean => {
    if (index >= chapters.length) return false;

    const chapter = chapters[index];
    // 判断是否是一级章节
    const isLevel1 = /^(第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+|卷[一二三四五六七八九十\d]+)/i.test(chapter.title);

    if (!isLevel1) return false;

    // 查找下一个一级章节的位置
    const nextLevel1Index = chapters.findIndex((c, i) => {
      if (i <= index) return false;
      return /^(第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+|卷[一二三四五六七八九十\d]+)/i.test(c.title);
    });

    const endIndex = nextLevel1Index === -1 ? chapters.length : nextLevel1Index;

    // 如果这个章节后面有子节，则应该跳过这个章节本身
    return chapters.slice(index + 1, endIndex).some(c =>
      /^(第[一二三四五六七八九十百千\d]+节|Section\s+\d+|\d+\.|[一二三四五六七八九十]+、)/i.test(c.title)
    );
  }, []);

  // 跳转到下一章（跳过有子节的章本身）
  const handleNextChapter = useCallback(() => {
    if (!activeBook) return;
    let nextIndex = activeChapterIndex + 1;

    // 跳过有子节的章本身（因为这些章不应该被直接阅读）
    while (nextIndex < activeBook.chapters.length && shouldSkipChapter(nextIndex, activeBook.chapters)) {
      nextIndex++;
    }

    if (nextIndex < activeBook.chapters.length) {
      handleChapterClick(nextIndex);
    }
  }, [activeBook, activeChapterIndex, handleChapterClick, shouldSkipChapter]);

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

  // 处理 AI 释义请求（触发 NoteDetailPanel 中的释义功能）
  const handleExplainText = useCallback((text: string) => {
    // 先清除，然后设置新值，确保能触发 useEffect
    setAiSelectedText('');
    setTimeout(() => {
      setAiSelectedText(text);
    }, 0);
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
          backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
          {/* Header */}
          <header 
            className="h-16 border-b flex items-center justify-between px-8 shadow-lg"
            style={{
              backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <BarChart3 
                  className="w-8 h-8"
                  style={{ color: theme === 'dark' ? '#D4A574' : '#A67C52' }}
                />
                <h1
                  className="text-2xl font-bold"
                  style={{ color: theme === 'dark' ? '#E8DDD0' : '#3E3530' }}
                >
                  {t('notes.analytics')}
                </h1>
              </div>
              <nav className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('library')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: theme === 'dark' ? '#B8A895' : '#6B5D52',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                    e.currentTarget.style.color = theme === 'dark' ? '#E8DDD0' : '#3E3530';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = theme === 'dark' ? '#B8A895' : '#6B5D52';
                  }}
                >
                  <BookOpen className="w-4 h-4" />
                  {t('nav.library')}
                </button>
                <button
                  onClick={() => setCurrentView('analytics')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: theme === 'dark' ? '#E8DDD0' : '#3E3530',
                    backgroundColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#524439' : '#C9BDAD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                  }}
                >
                  <BarChart3 className="w-4 h-4" />
                  {t('notes.analytics')}
                </button>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsGlobalSettingsOpen(true)}
                className="p-2 rounded-lg transition-colors"
                style={{
                  color: theme === 'dark' ? '#B8A895' : '#6B5D52',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="全局设置"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </header>

          {/* Analytics Content */}
          <main 
            className="flex-1 overflow-hidden"
            style={{
              backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8'
            }}
          >
            <AnalyticsView />
          </main>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <GlobalSettingsDialog
          isOpen={isGlobalSettingsOpen}
          onClose={() => setIsGlobalSettingsOpen(false)}
          theme={theme}
        />
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
          backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
          {/* Header */}
          <header 
            className="h-16 border-b flex items-center justify-between px-8 shadow-lg"
            style={{
              backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <BookOpen 
                  className="w-8 h-8"
                  style={{ color: theme === 'dark' ? '#D4A574' : '#A67C52' }}
                />
                <h1
                  className="text-2xl font-bold"
                  style={{ color: theme === 'dark' ? '#E8DDD0' : '#3E3530' }}
                >
                  {t('nav.library')}
                </h1>
              </div>
              <nav className="flex items-center gap-4">
                <button
                  onClick={() => setCurrentView('library')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium"
                  style={{
                    color: theme === 'dark' ? '#E8DDD0' : '#3E3530',
                    backgroundColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#524439' : '#C9BDAD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                  }}
                >
                  {t('nav.library')}
                </button>
                <button
                  onClick={() => setCurrentView('analytics')}
                  className="px-4 py-2 rounded-lg transition-colors font-medium flex items-center gap-2"
                  style={{
                    color: theme === 'dark' ? '#B8A895' : '#6B5D52',
                    backgroundColor: 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                    e.currentTarget.style.color = theme === 'dark' ? '#E8DDD0' : '#3E3530';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = theme === 'dark' ? '#B8A895' : '#6B5D52';
                  }}
                >
                  <BarChart3 className="w-4 h-4" />
                  {t('notes.analytics')}
                </button>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsGlobalSettingsOpen(true)}
                className="p-2 rounded-lg transition-colors"
                style={{
                  color: theme === 'dark' ? '#B8A895' : '#6B5D52',
                  backgroundColor: 'transparent'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title="全局设置"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button
                onClick={handleImportBook}
                disabled={loading}
                className={`flex items-center gap-2 px-5 py-2.5 font-medium rounded-lg transition-colors shadow-md ${
                  loading ? 'opacity-50 cursor-wait' : ''
                }`}
                style={{
                  backgroundColor: theme === 'dark' ? '#8B7355' : '#A67C52',
                  color: '#FFFFFF'
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#9A8164' : '#B58A61';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = theme === 'dark' ? '#8B7355' : '#A67C52';
                  }
                }}
              >
                <Plus className="w-5 h-5" />
                {loading ? t('nav.processing') : t('nav.importEPUB')}
              </button>
            </div>
          </header>

          {/* Book Grid */}
          <main 
            className="flex-1 overflow-y-auto p-8"
            style={{
              backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8'
            }}
          >
            {books.length === 0 ? (
              <div
                className="flex items-center justify-center h-full"
                style={{ color: theme === 'dark' ? '#B8A895' : '#6B5D52' }}
              >
                <p>{t('library.noBooks')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
                {books.map((book) => (
                  <BookCard 
                    key={book.id} 
                    book={book} 
                    onClick={handleBookClick}
                    theme={theme}
                  />
                ))}
              </div>
            )}
          </main>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <GlobalSettingsDialog
          isOpen={isGlobalSettingsOpen}
          onClose={() => setIsGlobalSettingsOpen(false)}
          theme={theme}
        />
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
            backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8',
            margin: 0,
            padding: 0,
            overflow: 'hidden'
          }}
        >
          <header 
            className="h-16 border-b flex items-center px-8 shadow-lg"
            style={{
              backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <button
              onClick={handleBackToLibrary}
              className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8',
                color: theme === 'dark' ? '#E8DDD0' : '#3E3530'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#524439' : '#C9BDAD';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
              }}
            >
              <ArrowLeft className="w-5 h-5" />
              {t('nav.backToLibrary')}
            </button>
            <div className="ml-8 flex-1">
              <h1 
                className="text-xl font-bold"
                style={{ color: theme === 'dark' ? '#E8DDD0' : '#3E3530' }}
              >
                {activeBook.title}
              </h1>
              <p 
                className="text-sm"
                style={{ color: theme === 'dark' ? '#B8A895' : '#6B5D52' }}
              >
                {activeBook.author}
              </p>
            </div>
          </header>
          <div 
            className="flex items-center justify-center flex-1"
            style={{ color: theme === 'dark' ? '#B8A895' : '#6B5D52' }}
          >
            <p>{t('reader.noContent')}</p>
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
          backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8',
          margin: 0,
          padding: 0,
          overflow: 'hidden'
        }}
      >
        {/* Header - 阅读模式下隐藏 */}
        {!isReadingMode && (
          <header
            className="h-16 border-b flex items-center px-8 shadow-lg"
            style={{
              backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
              borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <button
              onClick={handleBackToLibrary}
              className="flex items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8',
                color: theme === 'dark' ? '#E8DDD0' : '#3E3530'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#524439' : '#C9BDAD';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
              }}
            >
              <ArrowLeft className="w-5 h-5" />
              {t('nav.backToLibrary')}
            </button>
            <div className="ml-8 flex-1">
              <h1
                className="text-xl font-bold"
                style={{ color: theme === 'dark' ? '#E8DDD0' : '#3E3530' }}
              >
                {activeBook.title}
              </h1>
              <p
                className="text-sm"
                style={{ color: theme === 'dark' ? '#B8A895' : '#6B5D52' }}
              >
                {activeBook.author}
              </p>
            </div>
            <button
              onClick={() => setIsGlobalSettingsOpen(true)}
              className="p-2 rounded-lg transition-colors"
              style={{
                color: theme === 'dark' ? '#B8A895' : '#6B5D52',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme === 'dark' ? '#4A3D35' : '#D4C8B8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="全局设置"
            >
              <Settings className="w-5 h-5" />
            </button>
          </header>
        )}

        {/* 三栏布局：笔记侧边栏 + 章节列表 + 阅读内容 + 笔记详情 */}
        <main 
          className="flex flex-1 overflow-hidden"
          style={{
            backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8'
          }}
        >
          {/* 左侧：笔记侧边栏 (20%) - 阅读模式下隐藏 */}
          {!isReadingMode && (
            <div
              className="w-1/5 border-r"
              style={{
                backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
                borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
              }}
            >
              <NoteSidebar
                selectedNoteId={selectedNote?.id || null}
                onSelectNote={handleNoteSelect}
                onCreateNote={() => setIsCreateNoteDialogOpen(true)}
                currentBookId={activeBook.id}
                currentChapterIndex={safeChapterIndex}
                theme={theme}
                key={notesRefreshKey}
              />
            </div>
          )}

          {/* 中间：阅读内容 - 包含章节列表和内容区域 */}
          <div
            className={isReadingMode ? 'w-full flex justify-center' : 'w-3/5'}
            style={{ position: 'relative' }}
          >
            {/* 阅读模式下的居中容器 */}
            <div
              className={isReadingMode ? 'w-3/5 h-full' : 'w-full h-full'}
              style={{ position: 'relative' }}
            >
              {/* 章节列表 - 悬停展开 - 相对于阅读区定位 */}
              <aside
                className={`border-r overflow-hidden absolute left-0 top-0 h-full z-30 ${
                  isChapterListVisible ? 'w-64' : 'w-0'
                }`}
                style={{
                  backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
                  borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8',
                  transition: 'width 300ms ease-in-out',
                  boxShadow: isChapterListVisible ? '2px 0 8px rgba(0,0,0,0.1)' : 'none'
                }}
                onMouseLeave={() => setIsChapterListVisible(false)}
              >
                <div
                  className={`h-full overflow-y-auto ${
                    isChapterListVisible ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ transition: 'opacity 300ms' }}
                >
                  <ChapterList
                    chapters={activeBook.chapters}
                    activeChapterIndex={safeChapterIndex}
                    onChapterClick={handleChapterClick}
                    theme={theme}
                  />
                </div>
              </aside>

              {/* 悬停触发按钮（相对于阅读区左边缘） */}
              <div
                className="absolute left-0 top-0 h-full w-8 z-20 flex items-center"
                onMouseEnter={() => setIsChapterListVisible(true)}
              >
                <div
                  className="w-1 h-20 rounded-r-full transition-all duration-300"
                  style={{
                    backgroundColor: isChapterListVisible
                      ? (theme === 'dark' ? '#8B7355' : '#A67C52')
                      : (theme === 'dark' ? '#4A3D35' : '#D4C8B8'),
                    opacity: isChapterListVisible ? 1 : 0.5
                  }}
                />
              </div>

              {/* 阅读内容 */}
              <div className="w-full h-full">
                <ReaderContent
                  ref={readerContentRef}
                  chapter={currentChapter}
                  theme={theme}
                  onTextSelection={handleTextSelection}
                  bookId={activeBook.id}
                  chapterIndex={safeChapterIndex}
                  notes={chapterNotes}
                  onAnnotate={handleAnnotate}
                  onNoteClick={handleNoteClick}
                  jumpToNoteId={jumpToNoteId}
                  onNextChapter={handleNextChapter}
                  hasNextChapter={safeChapterIndex < activeBook.chapters.length - 1}
                  onExplainText={handleExplainText}
                  isReadingMode={isReadingMode}
                />
              </div>
            </div>
          </div>

          {/* 右侧：笔记详情面板 (20% - 与左侧对称) - 阅读模式下隐藏 */}
          {!isReadingMode && (
            <div
              className="w-1/5 border-l"
              style={{
                backgroundColor: theme === 'dark' ? '#3A302A' : '#EAE4D8',
                borderColor: theme === 'dark' ? '#4A3D35' : '#D4C8B8'
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
                theme={theme}
                bookId={activeBook.id}
                chapterIndex={safeChapterIndex}
                onExplainText={handleExplainText}
                selectedTextForExplain={aiSelectedText}
              />
            </div>
          )}
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
        <GlobalSettingsDialog
          isOpen={isGlobalSettingsOpen}
          onClose={() => setIsGlobalSettingsOpen(false)}
          theme={theme}
        />
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
        backgroundColor: theme === 'dark' ? '#2D2520' : '#F5F1E8',
        color: theme === 'dark' ? '#B8A895' : '#6B5D52',
        margin: 0,
        padding: 0,
        overflow: 'hidden'
      }}
    >
      <p>{t('common.error')}</p>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};

export default ImmersiveReader;

