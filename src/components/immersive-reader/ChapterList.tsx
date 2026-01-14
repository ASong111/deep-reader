import { memo } from 'react';
import { Chapter, ThemeMode } from './types';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterIndex: number;
  onChapterClick: (index: number) => void;
  theme?: ThemeMode;
}

// 推断章节层级
const inferChapterLevel = (title: string): number => {
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
  const isDark = theme === 'dark';
  const [collapsedChapters, setCollapsedChapters] = useState<Set<number>>(new Set());

  // 为章节添加层级信息
  const chaptersWithLevel: ChapterWithLevel[] = chapters.map((chapter, index) => ({
    ...chapter,
    level: inferChapterLevel(chapter.title),
    index
  }));

  // 检测重复章节（内容相同的章节）
  const isDuplicateChapter = (index: number): boolean => {
    if (index === 0) return false;

    const current = chapters[index];
    const previous = chapters[index - 1];

    // 如果当前章节和前一个章节的内容完全相同，则认为是重复
    // 同时检查当前章节是否是二级章节且前一个是一级章节
    if (current.content === previous.content) {
      const currentLevel = inferChapterLevel(current.title);
      const previousLevel = inferChapterLevel(previous.title);

      // 如果前一个是一级章节，当前是二级章节，且内容相同，则当前是重复的
      if (previousLevel === 1 && currentLevel === 2) {
        return true;
      }
    }

    return false;
  };

  // 构建层级结构（过滤掉重复章节）
  const buildHierarchy = () => {
    const result: ChapterWithLevel[] = [];
    let currentParent: ChapterWithLevel | null = null;

    chaptersWithLevel.forEach((chapter) => {
      // 跳过重复章节
      if (isDuplicateChapter(chapter.index)) {
        return;
      }

      if (chapter.level === 1) {
        currentParent = chapter;
        result.push(chapter);
      } else if (chapter.level === 2 && currentParent) {
        // 二级章节，检查父章节是否折叠
        if (!collapsedChapters.has(currentParent.index)) {
          result.push(chapter);
        }
      } else {
        // 其他情况，直接添加
        result.push(chapter);
      }
    });

    return result;
  };

  const visibleChapters = buildHierarchy();

  // 检查章节是否有子章节
  const hasChildren = (chapterIndex: number): boolean => {
    const chapter = chaptersWithLevel[chapterIndex];
    if (chapter.level !== 1) return false;

    // 查找下一个一级章节的位置
    const nextLevel1Index = chaptersWithLevel.findIndex(
      (c, i) => i > chapterIndex && c.level === 1
    );

    const endIndex = nextLevel1Index === -1 ? chaptersWithLevel.length : nextLevel1Index;

    // 检查之间是否有二级章节
    return chaptersWithLevel.slice(chapterIndex + 1, endIndex).some(c => c.level === 2);
  };

  const toggleCollapse = (chapterIndex: number) => {
    const newCollapsed = new Set(collapsedChapters);
    if (newCollapsed.has(chapterIndex)) {
      newCollapsed.delete(chapterIndex);
    } else {
      newCollapsed.add(chapterIndex);
    }
    setCollapsedChapters(newCollapsed);
  };

  return (
    <div className="p-6">
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
      >
        章节目录
      </h2>
      <ul className="space-y-0.5">
        {visibleChapters.map((chapter) => {
          const isActive = chapter.index === activeChapterIndex;
          const isCollapsed = collapsedChapters.has(chapter.index);
          const showToggle = chapter.level === 1 && hasChildren(chapter.index);

          return (
            <li
              key={chapter.id}
              className="group"
            >
              <div
                onClick={() => {
                  // 只有没有子节点的章节才能点击
                  if (!showToggle) {
                    onChapterClick(chapter.index);
                  }
                }}
                className={`flex items-center px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                  showToggle ? 'cursor-default' : 'cursor-pointer'
                }`}
                style={{
                  backgroundColor: isActive
                    ? (isDark ? '#8B7355' : '#A67C52')
                    : 'transparent',
                  color: isActive
                    ? '#FFFFFF'
                    : (isDark ? '#E8DDD0' : '#3E3530'),
                  paddingLeft: `${0.75 + (chapter.level - 1) * 1.5}rem`,
                  opacity: showToggle ? 0.7 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!isActive && !showToggle) {
                    e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {/* 折叠/展开图标 */}
                {showToggle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCollapse(chapter.index);
                    }}
                    className="mr-1.5 flex-shrink-0 hover:opacity-70 transition-opacity"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* 章节标题 */}
                <span
                  className={`flex-1 ${chapter.level === 2 ? 'text-xs' : ''}`}
                  style={{
                    marginLeft: !showToggle && chapter.level === 1 ? '1.25rem' : '0'
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
