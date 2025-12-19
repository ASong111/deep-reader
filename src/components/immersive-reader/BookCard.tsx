import { memo } from 'react';
import { BookOpen } from 'lucide-react';
import { Book } from './types';

interface BookCardProps {
  book: Book;
  onClick: (book: Book) => void;
}

const BookCard = memo(({ book, onClick }: BookCardProps) => {
  return (
    <div
      onClick={() => onClick(book)}
      // 移除 transform hover:scale-105，改用更轻量的效果
      className="bg-neutral-800 rounded-xl overflow-hidden cursor-pointer transition-shadow duration-200 shadow-lg hover:shadow-2xl border border-neutral-700 hover:border-blue-500"
    >
      {/* Book Cover */}
      <div className={`h-64 ${book.coverColor} flex items-center justify-center relative`}>
        <div className="absolute inset-0 bg-black bg-opacity-20"></div>
        <BookOpen className="w-20 h-20 text-white opacity-40 relative z-10" />
      </div>

      {/* Book Info */}
      <div className="p-5">
        <h3 className="text-lg font-bold text-white mb-1 truncate" title={book.title}>
          {book.title}
        </h3>
        <p className="text-sm text-neutral-400 mb-4">{book.author}</p>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-center text-xs text-neutral-500">
            <span>{book.progress}% Read</span>
          </div>
          <div className="w-full h-2 bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-500"
              style={{ width: `${book.progress}%` }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default BookCard;

