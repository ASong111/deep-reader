import { useState } from 'react';
import { BookOpen, ArrowLeft, Plus } from 'lucide-react';
import { Book, ViewMode, ThemeMode } from './types';
import { MOCK_BOOKS } from './mockData';
import BookCard from './BookCard';
import ChapterList from './ChapterList';
import ReaderContent from './ReaderContent';

const ImmersiveReader = () => {
  const [currentView, setCurrentView] = useState<ViewMode>('library');
  const [books, setBooks] = useState<Book[]>(MOCK_BOOKS);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [readerTheme, setReaderTheme] = useState<ThemeMode>('light');

  // 模拟导入书籍功能
  const handleImportBook = () => {
    const randomTitles = ['Beyond the Stars', 'Whispers in Time', 'The Silent Garden', 'Fragments of Tomorrow'];
    const randomAuthors = ['by James Morrison', 'by Sarah Chen', 'by David Kumar', 'by Maria Santos'];
    const randomColors = [
      'bg-gradient-to-br from-purple-700 to-purple-900',
      'bg-gradient-to-br from-green-700 to-green-900',
      'bg-gradient-to-br from-amber-700 to-amber-900',
      'bg-gradient-to-br from-pink-700 to-pink-900'
    ];

    const newBook: Book = {
      id: books.length + 1,
      title: randomTitles[Math.floor(Math.random() * randomTitles.length)],
      author: randomAuthors[Math.floor(Math.random() * randomAuthors.length)],
      coverColor: randomColors[Math.floor(Math.random() * randomColors.length)],
      progress: Math.floor(Math.random() * 100),
      chapters: [
        {
          id: 'ch1',
          title: 'Chapter 1',
          content: '<h1>Chapter 1</h1><p>This is a newly imported book. Content will be loaded soon...</p>'
        }
      ]
    };

    setBooks([...books, newBook]);
  };

  // 打开书籍
  const handleBookClick = (book: Book) => {
    setActiveBook(book);
    setActiveChapterIndex(0);
    setCurrentView('reading');
  };

  // 返回图书馆
  const handleBackToLibrary = () => {
    setCurrentView('library');
    setActiveBook(null);
    setActiveChapterIndex(0);
  };

  // 切换章节
  const handleChapterClick = (index: number) => {
    setActiveChapterIndex(index);
  };

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
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Import Book
          </button>
        </header>

        {/* Book Grid */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {books.map((book) => (
              <BookCard 
                key={book.id} 
                book={book} 
                onClick={handleBookClick} 
              />
            ))}
          </div>
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

