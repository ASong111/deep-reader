import { useState } from "react";
import { X } from "lucide-react";
import AIConfigDialog from "../ai/AIConfigDialog";

interface GlobalSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: 'light' | 'dark';
}

type SettingsTab = 'ai' | 'general';

export default function GlobalSettingsDialog({
  isOpen,
  onClose,
  theme = 'light',
}: GlobalSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div
          className="rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
          style={{
            backgroundColor: isDark ? '#2D2520' : '#FFFFFF'
          }}
        >
          {/* Header */}
          <div
            className="p-4 border-b flex items-center justify-between"
            style={{
              borderColor: isDark ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <h3
              className="text-lg font-semibold"
              style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
            >
              全局设置
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md transition-colors"
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
          </div>

          {/* Tabs */}
          <div
            className="flex border-b"
            style={{
              borderColor: isDark ? '#4A3D35' : '#D4C8B8'
            }}
          >
            <button
              onClick={() => setActiveTab('ai')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'ai' ? 'border-b-2' : ''
              }`}
              style={{
                color: activeTab === 'ai'
                  ? (isDark ? '#D4A574' : '#A67C52')
                  : (isDark ? '#B8A895' : '#6B5D52'),
                borderColor: activeTab === 'ai'
                  ? (isDark ? '#D4A574' : '#A67C52')
                  : 'transparent',
                backgroundColor: activeTab === 'ai'
                  ? (isDark ? '#3A302A' : '#F5F1E8')
                  : 'transparent'
              }}
            >
              AI 助手配置
            </button>
            <button
              onClick={() => setActiveTab('general')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'general' ? 'border-b-2' : ''
              }`}
              style={{
                color: activeTab === 'general'
                  ? (isDark ? '#D4A574' : '#A67C52')
                  : (isDark ? '#B8A895' : '#6B5D52'),
                borderColor: activeTab === 'general'
                  ? (isDark ? '#D4A574' : '#A67C52')
                  : 'transparent',
                backgroundColor: activeTab === 'general'
                  ? (isDark ? '#3A302A' : '#F5F1E8')
                  : 'transparent'
              }}
            >
              通用设置
            </button>
          </div>

          {/* Content */}
          <div
            className="p-6 overflow-y-auto flex-1"
            style={{
              backgroundColor: isDark ? '#2D2520' : '#F5F1E8'
            }}
          >
            {activeTab === 'ai' && (
              <div className="space-y-4">
                <p
                  className="text-sm mb-4"
                  style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                >
                  配置 AI 助手的 API 密钥和参数，用于文字释义和章节对话功能。
                </p>
                <button
                  onClick={() => setIsAIConfigOpen(true)}
                  className="px-4 py-2 rounded-lg font-medium transition-colors"
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
                  打开 AI 配置
                </button>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-4">
                <p
                  className="text-sm"
                  style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                >
                  通用设置功能即将推出...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Config Dialog */}
      <AIConfigDialog
        isOpen={isAIConfigOpen}
        onClose={() => setIsAIConfigOpen(false)}
        onSuccess={() => {
          setIsAIConfigOpen(false);
        }}
      />
    </>
  );
}
