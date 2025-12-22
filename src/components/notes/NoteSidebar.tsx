import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note, Category, Tag } from "../../types/notes";
import { Search, Plus, Filter, X } from "lucide-react";

interface NoteSidebarProps {
  selectedNoteId: number | null;
  onSelectNote: (note: Note) => void;
  onCreateNote: () => void;
  currentBookId?: number | null;
  currentChapterIndex?: number | null;
}

export default function NoteSidebar({
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  currentBookId,
  currentChapterIndex,
}: NoteSidebarProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedTag, setSelectedTag] = useState<number | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const loadNotes = useCallback(async () => {
    try {
      const notesData = await invoke<Note[]>("get_notes", {
        categoryId: selectedCategory,
        tagId: selectedTag,
      });
      setNotes(notesData);
    } catch (error) {
      console.error("加载笔记失败:", error);
    }
  }, [selectedCategory, selectedTag]);

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

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      loadNotes();
      return;
    }

    setIsSearching(true);
    try {
      const results = await invoke<Note[]>("search_notes", {
        request: {
          query: searchQuery,
          category_id: selectedCategory || undefined,
          tag_id: selectedTag || undefined,
        },
      });
      setNotes(results);
    } catch (error) {
      console.error("搜索失败:", error);
    }
  }, [searchQuery, selectedCategory, selectedTag]);

  useEffect(() => {
    if (searchQuery.trim()) {
      const timer = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      loadNotes();
    }
  }, [searchQuery, handleSearch, loadNotes]);

  const filteredNotes = currentBookId
    ? notes.filter((note) => note.book_id === currentBookId)
    : notes;

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">笔记</h2>
          <button
            onClick={onCreateNote}
            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="创建新笔记"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索笔记..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {/* 筛选器 */}
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
              {category.name}
            </button>
          ))}
          {selectedCategory && (
            <button
              onClick={() => setSelectedCategory(null)}
              className="px-2 py-1 text-xs rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              <X className="w-3 h-3 inline" />
            </button>
          )}
        </div>
      </div>

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotes.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <p className="text-sm">暂无笔记</p>
          </div>
        ) : (
          <div className="p-2">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                onClick={() => onSelectNote(note)}
                className={`p-3 mb-2 rounded-lg cursor-pointer transition-all ${
                  selectedNoteId === note.id
                    ? "bg-indigo-50 border-2 border-indigo-500"
                    : "bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {note.title}
                    </h3>
                    {note.content && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {note.content}
                      </p>
                    )}
                    {note.highlighted_text && (
                      <p className="text-xs text-gray-400 mt-1 italic line-clamp-1">
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
                      {note.category_name}
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
                <div className="text-xs text-gray-400 mt-1">
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


