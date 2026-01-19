import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { useState } from 'react';

interface LanguageSwitcherProps {
  theme?: 'light' | 'dark';
}

const LanguageSwitcher = ({ theme = 'light' }: LanguageSwitcherProps) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  ];

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const changeLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  const isDark = theme === 'dark';

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          isDark
            ? 'bg-[#4A3D35] hover:bg-[#524439] text-[#E8DDD0]'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }`}
        title="Change Language"
      >
        <Globe className="w-4 h-4" />
        <span className="text-sm font-medium">{currentLanguage.nativeName}</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div
            className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg z-50 border ${
              isDark
                ? 'bg-[#3A302A] border-[#4A3D35]'
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="py-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => changeLanguage(lang.code)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    i18n.language === lang.code
                      ? isDark
                        ? 'bg-[#4A3D35] text-[#D4A574]'
                        : 'bg-indigo-50 text-indigo-600'
                      : isDark
                      ? 'text-[#B8A895] hover:bg-[#4A3D35]'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium">{lang.nativeName}</div>
                  <div className={`text-xs ${
                    i18n.language === lang.code
                      ? isDark ? 'text-[#B8A895]' : 'text-indigo-500'
                      : isDark ? 'text-[#8B7355]' : 'text-gray-500'
                  }`}>
                    {lang.name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LanguageSwitcher;
