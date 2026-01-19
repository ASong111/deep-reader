import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import zhCNTranslation from './locales/zh-CN/translation.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  'zh-CN': {
    translation: zhCNTranslation,
  },
};

i18n
  .use(LanguageDetector) // 自动检测用户语言
  .use(initReactI18next) // 将 i18n 实例传递给 react-i18next
  .init({
    resources,
    fallbackLng: 'en', // 默认语言为英语
    lng: 'en', // 初始语言为英语
    debug: false,

    interpolation: {
      escapeValue: false, // React 已经处理了 XSS
    },

    detection: {
      // 语言检测顺序
      order: ['localStorage', 'navigator'],
      // 缓存用户语言选择
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
  });

export default i18n;
