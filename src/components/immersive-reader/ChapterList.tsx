import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Chapter, ThemeMode } from './types';
import { ChevronDown } from 'lucide-react';

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterIndex: number;
  onChapterClick: (index: number) => void;
  theme?: ThemeMode;
}

// 推断章节层级
const inferChapterLevel = (chapter: Chapter): number => {
  // 如果有 headingLevel，直接使用（Markdown 格式）
  if (chapter.headingLevel !== undefined && chapter.headingLevel !== null) {
    return chapter.headingLevel;
  }

  // 否则使用启发式规则推断（其他格式）
  const title = chapter.title;

  // 一级：第X章、Chapter X、卷X
  if (/^(第[一二三四五六七八九十百千\d]+章|Chapter\s+\d+|卷[一二三四五六七八九十\d]+)/i.test(title)) {
    return 1;
  }
  // 二级：第X节、Section X、X.
  if (/^(第[一二三四五六七八九十百千\d]+节|Section\s+\d+|\d+\.|[一二三四五六七八九十]+、)/i.test(title)) {
    return 2;
  }
  // 三级：其他带数字或序号的
  if (/^(\d+\.\d+|[（(]\d+[)）])/i.test(title)) {
    return 3;
  }
  // 默认一级
  return 1;
};

interface ChapterWithLevel extends Chapter {
  level: number;
  index: number;
}

const ChapterList = memo(({ chapters, activeChapterIndex, onChapterClick, theme = 'light' }: ChapterListProps) => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  // 为章节添加层级信息
  const chaptersWithLevel: ChapterWithLevel[] = chapters.map((chapter, index) => ({
    ...chapter,
    level: inferChapterLevel(chapter),
    index
  }));

  // 构建层级结构
  const buildHierarchy = () => {
    // 显示所有章节
    return chaptersWithLevel;
  };

  const visibleChapters = buildHierarchy();

  // 检查章节是否有子章节
  const hasChildren = (chapterIndex: number): boolean => {
    const chapter = chaptersWithLevel.find(c => c.index === chapterIndex);
    if (!chapter) return false;

    // 查找下一个同级或更高级别章节的位置
    const nextSameLevelIndex = chaptersWithLevel.findIndex(
      (c, i) => i > chapterIndex && c.level <= chapter.level
    );

    const endIndex = nextSameLevelIndex === -1 ? chaptersWithLevel.length : nextSameLevelIndex;

    // 检查之间是否有更低级别的章节（子章节）
    return chaptersWithLevel.slice(chapterIndex + 1, endIndex).some(c => c.level > chapter.level);
  };

  // 获取章节下的第一个子节索引
  const getFirstChildIndex = (chapterIndex: number): number => {
    const chapter = chaptersWithLevel.find(c => c.index === chapterIndex);
    if (!chapter) return chapterIndex;

    // 查找下一个同级或更高级别章节的位置
    const nextSameLevelIndex = chaptersWithLevel.findIndex(
      (c, i) => i > chapterIndex && c.level <= chapter.level
    );

    const endIndex = nextSameLevelIndex === -1 ? chaptersWithLevel.length : nextSameLevelIndex;

    // 查找第一个子章节（level > chapter.level）
    for (let i = chapterIndex + 1; i < endIndex; i++) {
      const c = chaptersWithLevel[i];
      if (c.level > chapter.level) {
        return c.index;
      }
    }

    return chapterIndex;
  };

  return (
    <div className="p-6">
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
      >
        {t('nav.tableOfContents')}
      </h2>
      <ul className="space-y-0.5">
        {visibleChapters.map((chapter) => {
          const isActive = chapter.index === activeChapterIndex;
          const showIcon = hasChildren(chapter.index);

          return (
            <li
              key={chapter.id}
              className="group"
            >
              <div
                onClick={() => {
                  // 如果是有子节的大章，点击后跳转到第一个子节
                  if (showIcon) {
                    const firstChildIndex = getFirstChildIndex(chapter.index);
                    onChapterClick(firstChildIndex);
                  } else {
                    onChapterClick(chapter.index);
                  }
                }}
                className="flex items-center px-3 py-2.5 rounded-lg transition-all text-sm font-medium cursor-pointer"
                style={{
                  backgroundColor: isActive
                    ? (isDark ? '#8B7355' : '#A67C52')
                    : 'transparent',
                  color: isActive
                    ? '#FFFFFF'
                    : (isDark ? '#E8DDD0' : '#3E3530'),
                  paddingLeft: `${0.75 + (chapter.level - 1) * 1.2}rem`,
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {/* 章节图标（表示有子节） */}
                {showIcon && (
                  <div className="mr-1.5 flex-shrink-0">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                )}

                {/* 章节标题 */}
                <span
                  className={`flex-1 ${
                    chapter.level === 1 ? 'text-sm font-semibold' :
                    chapter.level === 2 ? 'text-sm' :
                    chapter.level === 3 ? 'text-xs' :
                    chapter.level === 4 ? 'text-xs' :
                    chapter.level === 5 ? 'text-xs opacity-90' :
                    'text-xs opacity-80'
                  }`}
                  style={{
                    marginLeft: !showIcon ? '1.25rem' : '0'
                  }}
                >
                  {chapter.title}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
});

export default ChapterList;
