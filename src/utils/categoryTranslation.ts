// 默认分类名称映射
const DEFAULT_CATEGORIES: Record<string, { en: string; 'zh-CN': string }> = {
  '概念': { en: 'Concept', 'zh-CN': '概念' },
  '观点': { en: 'Opinion', 'zh-CN': '观点' },
  '疑问': { en: 'Question', 'zh-CN': '疑问' },
  '行动': { en: 'Action', 'zh-CN': '行动' },
};

/**
 * 翻译分类名称
 * 如果是默认分类，返回对应语言的翻译；否则返回原名称
 */
export function translateCategoryName(name: string, locale: string): string {
  const category = DEFAULT_CATEGORIES[name];
  if (category) {
    return category[locale as keyof typeof category] || name;
  }
  return name;
}

/**
 * 检查是否是默认分类
 */
export function isDefaultCategory(name: string): boolean {
  return name in DEFAULT_CATEGORIES;
}
