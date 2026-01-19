import { useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from 'react-i18next';
import AIConfigDialog from "../ai/AIConfigDialog";
import LanguageSwitcher from "./LanguageSwitcher";

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
  const { t } = useTranslation();
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
              {t('settings.title')}
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
              {t('ai.config')}
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
              {t('settings.general')}
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
                  Configure AI assistant API keys and parameters for text explanation and chapter dialogue features.
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
                  {t('ai.config')}
                </button>
              </div>
            )}

            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <h4
                    className="text-sm font-semibold mb-3"
                    style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                  >
                    {t('settings.language')}
                  </h4>
                  <LanguageSwitcher theme={theme} />
                </div>

                <div>
                  <h4
                    className="text-sm font-semibold mb-3"
                    style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                  >
                    {t('settings.appearance')}
                  </h4>
                  <p
                    className="text-sm"
                    style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                  >
                    Use the theme toggle button in the bottom right corner to switch between light and dark modes.
                  </p>
                </div>
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
