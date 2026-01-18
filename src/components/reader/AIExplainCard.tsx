import { useState, useEffect } from 'react';
import { X, Loader2, Sparkles } from 'lucide-react';
import { invoke } from "@tauri-apps/api/core";

interface AIExplainCardProps {
  selectedText: string;
  position: { x: number; y: number };
  bookId: number;
  chapterIndex: number;
  theme?: 'light' | 'dark';
  onClose: () => void;
}

export default function AIExplainCard({
  selectedText,
  position,
  bookId,
  chapterIndex,
  theme = 'light',
  onClose,
}: AIExplainCardProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const isDark = theme === 'dark';

  useEffect(() => {
    const fetchExplanation = async () => {
      setLoading(true);
      setError('');

      try {
        const explanation = await invoke<string>('explain_text', {
          selectedText,
          bookId,
          chapterIndex,
        });
        setResult(explanation);
      } catch (err) {
        console.error('AI 释义失败:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchExplanation();
  }, [selectedText, bookId, chapterIndex]);

  // 计算卡片位置，确保不超出视口
  const getCardStyle = () => {
    const maxWidth = 400;
    const maxHeight = 300;
    const padding = 16;

    let left = position.x;
    let top = position.y + 10; // 在选中文本下方10px

    // 确保不超出右边界
    if (left + maxWidth > window.innerWidth - padding) {
      left = window.innerWidth - maxWidth - padding;
    }

    // 确保不超出左边界
    if (left < padding) {
      left = padding;
    }

    // 如果下方空间不足，显示在上方
    if (top + maxHeight > window.innerHeight - padding) {
      top = position.y - maxHeight - 10;
    }

    // 确保不超出上边界
    if (top < padding) {
      top = padding;
    }

    return {
      position: 'fixed' as const,
      left: `${left}px`,
      top: `${top}px`,
      maxWidth: `${maxWidth}px`,
      maxHeight: `${maxHeight}px`,
      zIndex: 1000,
    };
  };

  return (
    <div
      style={getCardStyle()}
      className="rounded-lg shadow-2xl border overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex flex-col"
        style={{
          backgroundColor: isDark ? '#2D2520' : '#FFFFFF',
          borderColor: isDark ? '#4A3D35' : '#D4C8B8',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{
            backgroundColor: isDark ? '#3A302A' : '#F5F1E8',
            borderColor: isDark ? '#4A3D35' : '#D4C8B8',
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles
              className="w-4 h-4"
              style={{ color: isDark ? '#D4A574' : '#A67C52' }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
            >
              AI 释义
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div
          className="p-4 overflow-y-auto"
          style={{
            maxHeight: '250px',
            backgroundColor: isDark ? '#2D2520' : '#FFFFFF',
          }}
        >
          {/* Selected Text */}
          <div
            className="mb-3 p-2 rounded text-sm italic border-l-2"
            style={{
              backgroundColor: isDark ? '#3A302A' : '#FEF3C7',
              borderColor: isDark ? '#D4A574' : '#F59E0B',
              color: isDark ? '#E8DDD0' : '#92400E',
            }}
          >
            "{selectedText}"
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-6">
              <Loader2
                className="w-5 h-5 animate-spin"
                style={{ color: isDark ? '#D4A574' : '#A67C52' }}
              />
              <span
                className="ml-2 text-sm"
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              >
                AI 正在思考...
              </span>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div
              className="p-3 rounded text-sm"
              style={{
                backgroundColor: isDark ? '#3A302A' : '#FEE2E2',
                color: isDark ? '#FCA5A5' : '#DC2626',
              }}
            >
              <p className="font-medium mb-1">释义失败</p>
              <p>{error}</p>
            </div>
          )}

          {/* Result */}
          {result && !loading && !error && (
            <div
              className="text-sm whitespace-pre-wrap leading-relaxed"
              style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
            >
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
