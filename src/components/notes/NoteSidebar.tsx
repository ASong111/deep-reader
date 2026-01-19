import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note, Category, Tag, SearchNotesRequest } from "../../types/notes";
import { Search, Plus, Filter, X, Trash2, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { translateCategoryName } from '../../utils/categoryTranslation';
import TrashView from "./TrashView";

type TabType = 'notes' | 'trash';
type ThemeMode = 'light' | 'dark';

interface NoteSidebarProps {
  selectedNoteId: number | null;
  onSelectNote: (note: Note) => void;
  onCreateNote: () => void;
  currentBookId?: number | null;
  currentChapterIndex?: number | null;
  theme?: ThemeMode;
}

export default function NoteSidebar({
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  currentBookId,
  theme = 'light',
  // currentChapterIndex,
}: NoteSidebarProps) {
  const { t, i18n } = useTranslation();
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<TabType>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<'created_at' | 'updated_at' | 'title'>('created_at');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      if (searchQuery.trim()) {
        const request: SearchNotesRequest = {
          query: searchQuery,
          category_id: selectedCategory || undefined,
          tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
        };
        const results = await invoke<Note[]>("search_notes", { request });
        setNotes(results);
      } else {
        const notesData = await invoke<Note[]>("get_notes", {
          categoryId: selectedCategory,
          tagId: selectedTagIds.length === 1 ? selectedTagIds[0] : null,
        });
        setNotes(notesData);
      }
    } catch (error) {
      console.error("加载笔记失败:", error);
    }
  }, [searchQuery, selectedCategory, selectedTagIds, startDate, endDate, sortBy, sortOrder]);

  const loadCategories = useCallback(async () => {
    try {
      const categoriesData = await invoke<Category[]>("get_categories");
      setCategories(categoriesData);
    } catch (error) {
      console.error("加载分类失败:", error);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const tagsData = await invoke<Tag[]>("get_tags");
      setTags(tagsData);
    } catch (error) {
      console.error("加载标签失败:", error);
    }
  }, []);

  useEffect(() => {
    loadCategories();
    loadTags();
  }, [loadCategories, loadTags]);

  useEffect(() => {
    if (activeTab === 'notes') {
      const timer = setTimeout(() => {
        loadNotes();
      }, searchQuery.trim() ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, searchQuery, selectedCategory, selectedTagIds, startDate, endDate, sortBy, sortOrder, loadNotes]);

  const handleTagToggle = (tagId: number) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleRestoreNote = useCallback((_id: number) => {
    loadNotes();
  }, [loadNotes]);

  const handlePermanentlyDeleteNote = useCallback((_id: number) => {
    loadNotes();
  }, [loadNotes]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedCategory(null);
    setSelectedTagIds([]);
    setStartDate("");
    setEndDate("");
    setSortBy('created_at');
    setSortOrder('DESC');
  };

  const hasActiveFilters = selectedCategory !== null || selectedTagIds.length > 0 || startDate || endDate;

  const filteredNotes = currentBookId
    ? notes.filter((note) => note.book_id === currentBookId)
    : notes;

  if (activeTab === 'trash') {
    return (
      <div 
        className="h-full flex flex-col border-r"
        style={{
          backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
          borderColor: isDark ? '#4A3D35' : '#D4C8B8'
        }}
      >
        {/* 头部 */}
        <div 
          className="p-4 border-b"
          style={{
            backgroundColor: isDark ? '#2D2520' : '#F5F1E8',
            borderColor: isDark ? '#4A3D35' : '#D4C8B8'
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('notes')}
                className="text-sm"
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = isDark ? '#E8DDD0' : '#3E3530';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = isDark ? '#B8A895' : '#6B5D52';
                }}
              >
                {t('notes.title')}
              </button>
              <span style={{ color: isDark ? '#B8A895' : '#6B5D52' }}>/</span>
              <span 
                className="text-sm font-semibold"
                style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
              >
                {t('notes.trash')}
              </span>
            </div>
          </div>
        </div>

        {/* 回收站视图 */}
        <div className="flex-1 overflow-hidden">
          <TrashView
            onRestore={handleRestoreNote}
            onPermanentlyDelete={handlePermanentlyDeleteNote}
          />
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col border-r"
      style={{
        backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
        borderColor: isDark ? '#4A3D35' : '#D4C8B8'
      }}
    >
      {/* 头部 */}
      <div 
        className="p-4 border-b"
        style={{
          backgroundColor: isDark ? '#2D2520' : '#F5F1E8',
          borderColor: isDark ? '#4A3D35' : '#D4C8B8'
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span 
              className="text-sm font-semibold"
              style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
            >
              {t('notes.title')}
            </span>
            <span style={{ color: isDark ? '#B8A895' : '#6B5D52' }}>/</span>
            <button
              onClick={() => setActiveTab('trash')}
              className="text-sm flex items-center gap-1"
              style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isDark ? '#E8DDD0' : '#3E3530';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isDark ? '#B8A895' : '#6B5D52';
              }}
            >
              <Trash2 className="w-4 h-4" />
              {t('notes.trash')}
            </button>
          </div>
          <button
            onClick={onCreateNote}
            className="p-1.5 rounded-md transition-colors"
            style={{
              color: isDark ? '#D4A574' : '#A67C52'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title={t('notes.createNewNote')}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search 
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('notes.search')}
            className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{
              backgroundColor: isDark ? '#2D2520' : '#FFFFFF',
              borderColor: isDark ? '#4A3D35' : '#D4C8B8',
              color: isDark ? '#E8DDD0' : '#3E3530'
            }}
          />
        </div>

        {/* 高级搜索切换按钮 */}
        <button
          onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
          className="mt-2 w-full flex items-center justify-between px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            <span>{t('notes.advancedFilter')}</span>
          </div>
          {showAdvancedSearch ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {/* 高级搜索面板 */}
        {showAdvancedSearch && (
          <div className="mt-3 space-y-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            {/* 时间范围 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('notes.timeRange')}</label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder={t('notes.startDate')}
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder={t('notes.endDate')}
                />
              </div>
            </div>

            {/* 排序 */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">{t('notes.sortBy')}</label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'created_at' | 'updated_at' | 'title')}
                  className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="created_at">{t('notes.createdAt')}</option>
                  <option value="updated_at">{t('notes.updatedAt')}</option>
                  <option value="title">{t('book.chapters')}</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC')}
                  className="px-2 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 flex items-center gap-1"
                  title={sortOrder === 'ASC' ? t('notes.ascending') : t('notes.descending')}
                >
                  <ArrowUpDown className="w-3 h-3" />
                  {sortOrder === 'ASC' ? t('notes.ascending').charAt(0) : t('notes.descending').charAt(0)}
                </button>
              </div>
            </div>

            {/* 清除筛选 */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                {t('notes.clearFilters')}
              </button>
            )}
          </div>
        )}

        {/* 分类筛选 */}
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() =>
                setSelectedCategory(
                  selectedCategory === category.id ? null : category.id
                )
              }
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedCategory === category.id
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              style={
                selectedCategory === category.id && category.color
                  ? { backgroundColor: category.color }
                  : {}
              }
            >
              {translateCategoryName(category.name, i18n.language)}
            </button>
          ))}
        </div>

        {/* 标签筛选（多选） */}
        {tags.length > 0 && (
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-700 mb-2">{t('notes.tagFilter')}</label>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => handleTagToggle(tag.id)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    selectedTagIds.includes(tag.id)
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 当前筛选标签显示 */}
        {(selectedCategory || startDate || endDate) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedCategory && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded">
                {translateCategoryName(categories.find(c => c.id === selectedCategory)?.name || '', i18n.language)}
                <button
                  onClick={() => setSelectedCategory(null)}
                  className="hover:text-indigo-900"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

        {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div
            className="p-8 text-center"
            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
          >
            <p className="text-sm">{t('notes.noNotes')}</p>
          </div>
        ) : (
          <div className="p-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => onSelectNote(note)}
                className="p-3 mb-2 rounded-lg cursor-pointer transition-all border-2"
                style={{
                  backgroundColor: selectedNoteId === note.id
                    ? (isDark ? '#4A3D35' : '#F5F1E8')
                    : (isDark ? '#2D2520' : '#FFFFFF'),
                  borderColor: selectedNoteId === note.id
                    ? (isDark ? '#8B7355' : '#A67C52')
                    : (isDark ? '#4A3D35' : '#D4C8B8')
                }}
                onMouseEnter={(e) => {
                  if (selectedNoteId !== note.id) {
                    e.currentTarget.style.borderColor = isDark ? '#8B7355' : '#A67C52';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedNoteId !== note.id) {
                    e.currentTarget.style.borderColor = isDark ? '#4A3D35' : '#D4C8B8';
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 
                      className="text-sm font-medium truncate"
                      style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                    >
                      {note.title}
                    </h3>
                    {note.content && (
                      <p 
                        className="text-xs mt-1 line-clamp-2"
                        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                      >
                        {note.content}
                      </p>
                    )}
                    {note.highlighted_text && (
                      <p 
                        className="text-xs mt-1 italic line-clamp-1"
                        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                      >
                        "{note.highlighted_text}"
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {note.category_name && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={(() => {
                        const category = categories.find((c) => c.id === note.category_id);
                        const categoryColor = category?.color;
                        return categoryColor
                          ? {
                              backgroundColor: categoryColor + "20",
                              color: categoryColor,
                            }
                          : {};
                      })()}
                    >
                      {translateCategoryName(note.category_name, i18n.language)}
                    </span>
                  )}
                  {note.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
                <div 
                  className="text-xs mt-1"
                  style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                >
                  {new Date(note.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}