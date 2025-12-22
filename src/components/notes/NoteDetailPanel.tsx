import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note, Category, Tag, UpdateNoteRequest } from "../../types/notes";
import { Edit2, Trash2, Save, X, ChevronDown, ChevronUp, Settings, Sparkles, Loader2 } from "lucide-react";
import AIConfigDialog from "../ai/AIConfigDialog";

interface NoteDetailPanelProps {
  note: Note | null;
  onUpdate: () => void;
  onDelete: (id: number) => void;
  categories: Category[];
  tags: Tag[];
}

export default function NoteDetailPanel({
  note,
  onUpdate,
  onDelete,
  categories,
  tags,
}: NoteDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAction, setAiAction] = useState<string>("");

  useEffect(() => {
    if (note) {
      setEditedTitle(note.title);
      setEditedContent(note.content || "");
      setSelectedCategoryId(note.category_id);
      setSelectedTagIds(note.tags.map((t) => t.id));
      setIsEditing(false);
    }
  }, [note]);

  const handleSave = async () => {
    if (!note) return;

    if (!editedTitle.trim()) {
        alert("标题不能为空");
        return;
      }

    try {
      const request: UpdateNoteRequest = {
        id: note.id,
        title: editedTitle,
        content: editedContent,
        category_id: selectedCategoryId || undefined,
        tag_ids: selectedTagIds,
      };

      await invoke("update_note", { request });
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error("更新笔记失败:", error);
      alert("更新笔记失败");
    }
  };

  const handleDelete = async () => {
    if (!note) return;
    if (confirm("确定要删除这条笔记吗？")) {
      try {
        await invoke("delete_note", { id: note.id });
        onDelete(note.id);
      } catch (error) {
        console.error("删除笔记失败:", error);
        alert("删除笔记失败");
      }
    }
  };

  const handleAIAction = async (action: string) => {
    if (!note) return;

    setAiAction(action);
    setAiLoading(true);
    setAiResponse("");

    try {
      const response = await invoke<string>("call_ai_assistant", {
        request: {
          note_content: note.content || "",
          note_title: note.title,
          highlighted_text: note.highlighted_text,
          action: action,
        },
      });
      setAiResponse(response);
    } catch (error) {
      console.error("AI 调用失败:", error);
      setAiResponse(`错误: ${error}`);
    } finally {
      setAiLoading(false);
    }
  };

  if (!note) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p className="text-sm">选择一个笔记查看详情</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200">
      {/* 头部操作栏 */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">笔记详情</h3>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="p-2 text-green-600 hover:bg-green-50 rounded-md transition-colors"
                title="保存"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  setIsEditing(false);
                  if (note) {
                    setEditedTitle(note.title);
                    setEditedContent(note.content || "");
                    setSelectedCategoryId(note.category_id);
                    setSelectedTagIds(note.tags.map((t) => t.id));
                  }
                }}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title="取消"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                title="编辑"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleDelete}
                className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                title="删除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                标题
              </label>
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                内容
              </label>
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                分类
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
                <option value="">无分类</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                标签
              </label>
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <button
                    key={tag.id}
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
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{note.title}</h2>
              {note.category_name && (
                <span
                  className="inline-block mt-2 px-2 py-1 text-xs rounded"
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
            </div>
            {note.highlighted_text && (
              <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded">
                <p className="text-sm text-gray-700 italic">
                  "{note.highlighted_text}"
                </p>
              </div>
            )}
            <div>
              <p className="text-gray-700 whitespace-pre-wrap">
                {note.content || "无内容"}
              </p>
            </div>
            {note.tags.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">标签</p>
                <div className="flex flex-wrap gap-2">
                  {note.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded"
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-400">
                创建时间: {new Date(note.created_at).toLocaleString("zh-CN")}
              </p>
              <p className="text-xs text-gray-400">
                更新时间: {new Date(note.updated_at).toLocaleString("zh-CN")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* AI 助手面板 */}
      <div className="border-t border-gray-200 dark:border-neutral-700">
        <button
          onClick={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI 助手</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAIConfigOpen(true);
              }}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
              title="配置"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
            {isAIAssistantOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </div>
        </button>
        {isAIAssistantOpen && (
          <div className="p-4 bg-gray-50 dark:bg-neutral-900 border-t border-gray-200 dark:border-neutral-700">
            <div className="space-y-3">
              {/* AI 操作按钮 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleAIAction("summarize")}
                  disabled={aiLoading}
                  className="px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  总结要点
                </button>
                <button
                  onClick={() => handleAIAction("questions")}
                  disabled={aiLoading}
                  className="px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  生成问题
                </button>
                <button
                  onClick={() => handleAIAction("suggestions")}
                  disabled={aiLoading}
                  className="px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  学习建议
                </button>
                <button
                  onClick={() => handleAIAction("expand")}
                  disabled={aiLoading}
                  className="px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  扩展内容
                </button>
              </div>

              {/* AI 响应区域 */}
              {aiLoading && (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">AI 正在思考...</span>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    {aiAction === "summarize" && "总结要点"}
                    {aiAction === "questions" && "生成问题"}
                    {aiAction === "suggestions" && "学习建议"}
                    {aiAction === "expand" && "扩展内容"}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {aiResponse}
                  </div>
                </div>
              )}

              {!aiResponse && !aiLoading && (
                <div className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700">
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    选择一个操作开始使用 AI 助手
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* AI 配置对话框 */}
      <AIConfigDialog
        isOpen={isAIConfigOpen}
        onClose={() => setIsAIConfigOpen(false)}
        onSuccess={() => {
          setIsAIConfigOpen(false);
        }}
      />
    </div>
  );
}


