import { memo } from 'react';
import { BookOpen } from 'lucide-react';
import { Book, ThemeMode } from './types';

interface BookCardProps {
  book: Book;
  onClick: (book: Book) => void;
  theme?: ThemeMode;
}

const BookCard = memo(({ book, onClick, theme = 'light' }: BookCardProps) => {
  const isDark = theme === 'dark';
  
  return (
    <div
      onClick={() => onClick(book)}
      className="rounded-xl overflow-hidden cursor-pointer transition-all duration-200 shadow-lg border"
      style={{
        backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
        borderColor: isDark ? '#4A3D35' : '#D4C8B8'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.14)';
        e.currentTarget.style.borderColor = isDark ? '#8B7355' : '#A67C52';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
        e.currentTarget.style.borderColor = isDark ? '#4A3D35' : '#D4C8B8';
      }}
    >
      {/* Book Cover */}
      <div className={`h-64 ${book.coverColor} flex items-center justify-center relative overflow-hidden`}>
        {book.coverImage ? (
          <img 
            src={book.coverImage} 
            alt={book.title}
            className="w-full h-full object-cover absolute inset-0"
          />
        ) : (
          <>
            <div className="absolute inset-0 bg-black bg-opacity-20"></div>
            <BookOpen className="w-20 h-20 text-white opacity-40 relative z-10" />
          </>
        )}
      </div>

      {/* Book Info */}
      <div className="p-5">
        <h3 
          className="text-lg font-bold mb-1 truncate" 
          title={book.title}
          style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
        >
          {book.title}
        </h3>
        <p 
          className="text-sm mb-4"
          style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
        >
          {book.author}
        </p>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div 
            className="flex justify-between items-center text-xs"
            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
          >
            <span>{book.progress}% Read</span>
          </div>
          <div 
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ backgroundColor: isDark ? '#4A3D35' : '#D4C8B8' }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{ 
                width: `${book.progress}%`,
                background: isDark 
                  ? 'linear-gradient(to right, #8B7355, #A67C52)' 
                  : 'linear-gradient(to right, #A67C52, #C9A06E)'
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default BookCard;

