import { X, Keyboard, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FirstTimeHintProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

export default function FirstTimeHint({ isOpen, onClose, theme = 'light' }: FirstTimeHintProps) {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-lg shadow-xl w-full max-w-md p-6 relative animate-fadeIn"
        style={{
          backgroundColor: isDark ? '#2D2520' : '#FFFFFF',
          animation: 'fadeIn 0.3s ease-out'
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md transition-colors"
          style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <X className="w-5 h-5" />
        </button>

        {/* 标题 */}
        <h3
          className="text-xl font-bold mb-6"
          style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
        >
          {t('reader.firstTimeHint.title')}
        </h3>

        {/* 提示内容 */}
        <div className="space-y-4 mb-6">
          {/* F11 全屏提示 */}
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{
                backgroundColor: isDark ? '#4A3D35' : '#EAE4D8'
              }}
            >
              <Keyboard
                className="w-5 h-5"
                style={{ color: isDark ? '#D4A574' : '#A67C52' }}
              />
            </div>
            <div className="flex-1">
              <p
                className="text-sm font-medium mb-1"
                style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
              >
                {t('reader.firstTimeHint.fullscreen')}
              </p>
              <p
                className="text-xs"
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              >
                {t('reader.firstTimeHint.fullscreenDesc')}
              </p>
            </div>
          </div>

          {/* AI 释义提示 */}
          <div className="flex items-start gap-3">
            <div
              className="p-2 rounded-lg flex-shrink-0"
              style={{
                backgroundColor: isDark ? '#4A3D35' : '#EAE4D8'
              }}
            >
              <Sparkles
                className="w-5 h-5"
                style={{ color: isDark ? '#D4A574' : '#A67C52' }}
              />
            </div>
            <div className="flex-1">
              <p
                className="text-sm font-medium mb-1"
                style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
              >
                {t('reader.firstTimeHint.aiExplain')}
              </p>
              <p
                className="text-xs"
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              >
                {t('reader.firstTimeHint.aiExplainDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* 确认按钮 */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg font-medium transition-colors"
          style={{
            backgroundColor: isDark ? '#8B7355' : '#A67C52',
            color: '#FFFFFF'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
          }}
        >
          {t('reader.firstTimeHint.gotIt')}
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
