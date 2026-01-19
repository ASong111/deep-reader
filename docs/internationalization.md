# Internationalization (i18n) Implementation Guide

## Overview

Deep Reader has been successfully internationalized to support multiple languages. This document describes the implementation details and how to maintain/extend the i18n system.

## Implementation Summary

### 1. Libraries Used

- **i18next**: Core internationalization framework
- **react-i18next**: React bindings for i18next
- **i18next-browser-languagedetector**: Automatic language detection

### 2. File Structure

```
src/
├── i18n.ts                          # i18n configuration
├── locales/
│   ├── en/
│   │   └── translation.json         # English translations
│   └── zh-CN/
│       └── translation.json         # Chinese translations
└── components/
    └── common/
        └── LanguageSwitcher.tsx     # Language switcher component
```

### 3. Configuration

The i18n system is configured in `src/i18n.ts`:

```typescript
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { /* translation files */ },
    fallbackLng: 'en',
    lng: 'en',
    // ...
  });
```

**Key settings:**
- `fallbackLng: 'en'` - Default language is English
- `lng: 'en'` - Initial language is English
- Language detection order: localStorage → browser navigator
- User language preference is cached in localStorage

### 4. Translation Files

Translation files are organized by namespace and follow a hierarchical structure:

```json
{
  "app": {
    "name": "Deep Reader",
    "version": "v2.0"
  },
  "nav": {
    "library": "Library",
    "importEPUB": "Import EPUB"
  },
  // ...
}
```

**Namespaces:**
- `app` - Application-level strings
- `nav` - Navigation and menu items
- `library` - Library view
- `book` - Book-related strings
- `reader` - Reader interface
- `notes` - Note-taking system
- `ai` - AI assistant
- `settings` - Settings dialog
- `theme` - Theme-related strings
- `debug` - Debug panel
- `common` - Common UI elements
- `errors` - Error messages

### 5. Usage in Components

To use translations in a React component:

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();

  return (
    <div>
      <h1>{t('app.name')}</h1>
      <button>{t('nav.importEPUB')}</button>
    </div>
  );
}
```

**Important notes:**
- Always import `useTranslation` from 'react-i18next'
- Use the `t()` function to translate keys
- Keys use dot notation: `namespace.key`
- Console.log messages are kept in Chinese for debugging

### 6. Language Switcher

The `LanguageSwitcher` component provides a UI for changing languages:

```typescript
<LanguageSwitcher theme={theme} />
```

It's integrated into the GlobalSettingsDialog under the "General" tab.

### 7. App Metadata Updates

The following metadata has been updated for international release:

**Tauri Configuration** (`src-tauri/tauri.conf.json`):
- `productName`: "Deep Reader"
- `identifier`: "com.deepreader.app"
- `title`: "Deep Reader - Immersive Reading & Knowledge Management"

**Cargo.toml** (`src-tauri/Cargo.toml`):
- `description`: "Deep Reader - Immersive Reading & Knowledge Management Tool"
- `authors`: ["Deep Reader Team"]

**Package.json**:
- `version`: "1.0.0"
- `description`: "Deep Reader - Immersive Reading & Knowledge Management Tool"
- `author`: "Deep Reader Team"

## Adding a New Language

To add support for a new language (e.g., Spanish):

### Step 1: Create Translation File

Create `src/locales/es/translation.json`:

```json
{
  "app": {
    "name": "Deep Reader",
    "version": "v2.0"
  },
  // ... translate all keys
}
```

### Step 2: Update i18n Configuration

Edit `src/i18n.ts`:

```typescript
import esTranslation from './locales/es/translation.json';

const resources = {
  en: { translation: enTranslation },
  'zh-CN': { translation: zhCNTranslation },
  es: { translation: esTranslation }, // Add this
};
```

### Step 3: Update Language Switcher

Edit `src/components/common/LanguageSwitcher.tsx`:

```typescript
const languages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' }, // Add this
];
```

### Step 4: Test

1. Run the app: `pnpm tauri dev`
2. Open Settings → General
3. Select the new language from the dropdown
4. Verify all UI elements are translated correctly

## Best Practices

### 1. Translation Keys

- Use descriptive, hierarchical keys: `notes.createNote` not `cn`
- Group related keys under the same namespace
- Keep keys consistent across languages

### 2. Pluralization

For strings that need pluralization, use i18next's plural feature:

```json
{
  "items": "{{count}} item",
  "items_plural": "{{count}} items"
}
```

Usage:
```typescript
t('items', { count: 1 })  // "1 item"
t('items', { count: 5 })  // "5 items"
```

### 3. Interpolation

For dynamic values, use interpolation:

```json
{
  "welcome": "Welcome, {{name}}!"
}
```

Usage:
```typescript
t('welcome', { name: 'John' })  // "Welcome, John!"
```

### 4. Context

For context-specific translations:

```json
{
  "delete": "Delete",
  "delete_confirm": "Are you sure you want to delete?"
}
```

### 5. Debugging

To see missing translation keys in the console:

```typescript
i18n.init({
  debug: true,  // Enable in development
  // ...
});
```

## Testing

### Manual Testing Checklist

- [ ] All UI text is translated correctly
- [ ] Language switcher works in all views
- [ ] Language preference persists after app restart
- [ ] Fallback to English works for missing keys
- [ ] No hardcoded strings remain in the UI
- [ ] Console logs remain in Chinese (for debugging)
- [ ] Error messages are user-friendly in all languages

### Automated Testing

Add tests for i18n functionality:

```typescript
import { renderHook } from '@testing-library/react';
import { useTranslation } from 'react-i18next';

test('translation works', () => {
  const { result } = renderHook(() => useTranslation());
  expect(result.current.t('app.name')).toBe('Deep Reader');
});
```

## Troubleshooting

### Issue: Translations not loading

**Solution:** Check that:
1. Translation files are in the correct location
2. Files are imported in `i18n.ts`
3. JSON syntax is valid
4. The app is restarted after changes

### Issue: Language not persisting

**Solution:** Check localStorage:
```javascript
localStorage.getItem('i18nextLng')
```

Clear if needed:
```javascript
localStorage.removeItem('i18nextLng')
```

### Issue: Missing translations showing keys

**Solution:**
1. Check if the key exists in the translation file
2. Verify the key path is correct
3. Check for typos in the key name
4. Ensure fallback language (English) has the key

## Future Enhancements

Potential improvements for the i18n system:

1. **Lazy Loading**: Load translation files on demand to reduce initial bundle size
2. **Translation Management**: Use a service like Crowdin or Lokalise for collaborative translation
3. **RTL Support**: Add right-to-left language support (Arabic, Hebrew)
4. **Date/Time Formatting**: Use i18next with date-fns for locale-aware date formatting
5. **Number Formatting**: Add locale-aware number formatting
6. **Backend i18n**: Internationalize Rust error messages and notifications

## Resources

- [i18next Documentation](https://www.i18next.com/)
- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Best Practices](https://www.i18next.com/principles/best-practices)
- [Language Codes (ISO 639-1)](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)

## Conclusion

The internationalization system is now fully implemented and ready for use. The app defaults to English and supports Chinese (Simplified). Users can easily switch languages through the Settings dialog, and their preference is saved for future sessions.

For questions or issues, please open an issue on GitHub or contact the development team.
