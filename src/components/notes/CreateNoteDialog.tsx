import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { CreateNoteRequest, Category, Tag } from "../../types/notes";
import { X } from "lucide-react";

interface CreateNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  highlightedText?: string;
  bookId?: number | null;
  chapterIndex?: number | null;
}

export default function CreateNoteDialog({
  isOpen,
  onClose,
  onSuccess,
  highlightedText,
  bookId,
  chapterIndex,
}: CreateNoteDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadTags();
      if (highlightedText) {
        setTitle(highlightedText.substring(0, 50));
        setContent("");
      }
    }
  }, [isOpen, highlightedText]);

  const loadCategories = async () => {
    try {
      const data = await invoke<Category[]>("get_categories");
      setCategories(data);
    } catch (error) {
      console.error("加载分类失败:", error);
    }
  };

  const loadTags = async () => {
    try {
      const data = await invoke<Tag[]>("get_tags");
      setTags(data);
    } catch (error) {
      console.error("加载标签失败:", error);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert(t('notes.createNote') + ': ' + t('common.error'));
      return;
    }

    try {
      const request: CreateNoteRequest = {
        title: title.trim(),
        content: content.trim() || undefined,
        category_id: selectedCategoryId || undefined,
        book_id: bookId || undefined,
        chapter_index: chapterIndex || undefined,
        highlighted_text: highlightedText || undefined,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      };

      await invoke("create_note", { request });
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("创建笔记失败:", error);
      alert(t('errors.saveFailed'));
    }
  };

  const handleClose = () => {
    setTitle("");
    setContent("");
    setSelectedCategoryId(null);
    setSelectedTagIds([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('notes.createNote')}</h3>
          <button
            onClick={handleClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {highlightedText && (
            <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
              <p className="text-sm text-gray-700 italic">"{highlightedText}"</p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('notes.title')} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('notes.createNote')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('notes.content')}
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                placeholder={t('notes.createNote')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('notes.category')}
              </label>
              <select
                value={selectedCategoryId || ""}
                onChange={(e) =>
                  setSelectedCategoryId(
                    e.target.value ? parseInt(e.target.value) : null
                  )
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">{t('notes.category')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('notes.tags')}
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => {
                      if (selectedTagIds.includes(tag.id)) {
                        setSelectedTagIds(
                          selectedTagIds.filter((id) => id !== tag.id)
                        );
                      } else {
                        setSelectedTagIds([...selectedTagIds, tag.id]);
                      }
                    }}
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
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
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}


