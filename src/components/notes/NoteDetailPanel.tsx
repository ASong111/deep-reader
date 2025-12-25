import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Note, Category, Tag, UpdateNoteRequest } from "../../types/notes";
import { Edit2, Trash2, Save, X, ChevronDown, ChevronUp, Settings, Sparkles, Loader2, CheckCircle2, AlertCircle, Navigation, MapPin, MessageSquare, Send } from "lucide-react";
import AIConfigDialog from "../ai/AIConfigDialog";

type ThemeMode = 'light' | 'dark';

interface NoteDetailPanelProps {
  note: Note | null;
  onUpdate: () => void;
  onDelete: (id: number) => void;
  categories: Category[];
  tags: Tag[];
  onJumpToChapter?: (chapterIndex: number) => void;
  onJumpToNote?: (noteId: number) => void;
  theme?: ThemeMode;
  bookId?: number;
  chapterIndex?: number;
  onExplainText?: (text: string) => void;
  selectedTextForExplain?: string; // 外部传入的选中文字，用于触发释义
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function NoteDetailPanel({
  note,
  onUpdate,
  onDelete,
  categories,
  tags,
  onJumpToChapter,
  onJumpToNote,
  theme = 'light',
  bookId,
  chapterIndex,
  selectedTextForExplain,
}: NoteDetailPanelProps) {
  const isDark = theme === 'dark';
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isAIConfigOpen, setIsAIConfigOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  // AI 助手模式：'note' (笔记相关) 或 'chapter' (章节释义/对话)
  const [aiMode, setAiMode] = useState<'note' | 'explain' | 'chat'>('explain');
  const [explainResult, setExplainResult] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // 滚动到底部
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (note) {
      setEditedTitle(note.title);
      setEditedContent(note.content || "");
      setSelectedCategoryId(note.category_id);
      setSelectedTagIds(note.tags.map((t) => t.id));
      setIsEditing(false);
      setSaveStatus('idle');
    }
  }, [note]);

  const handleAutoSave = useCallback(async () => {
    if (!note || !editedTitle.trim()) return;

    setSaveStatus('saving');
    try {
      const request: UpdateNoteRequest = {
        id: note.id,
        title: editedTitle,
        content: editedContent,
        category_id: selectedCategoryId || undefined,
        tag_ids: selectedTagIds,
      };

      await invoke("update_note", { request });
      setSaveStatus('saved');
      onUpdate();
      
      // 3秒后恢复为idle状态
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error("自动保存失败:", error);
      setSaveStatus('error');
    }
  }, [note, editedTitle, editedContent, selectedCategoryId, selectedTagIds, onUpdate]);

  // 自动保存功能
  useEffect(() => {
    if (!isEditing || !note) return;

    // 检查是否有更改
    const hasChanges = 
      editedTitle !== note.title ||
      editedContent !== (note.content || "") ||
      selectedCategoryId !== note.category_id ||
      JSON.stringify([...selectedTagIds].sort()) !== JSON.stringify(note.tags.map(t => t.id).sort());

    if (!hasChanges) {
      setSaveStatus('idle');
      return;
    }

    // 设置新的定时器，2秒后自动保存
    const timer = setTimeout(() => {
      handleAutoSave();
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [editedTitle, editedContent, selectedCategoryId, selectedTagIds, isEditing, note, handleAutoSave]);

  const handleSave = async () => {
    if (!note) return;

    if (!editedTitle.trim()) {
        alert("标题不能为空");
        return;
      }

    setSaveStatus('saving');
    try {
      const request: UpdateNoteRequest = {
        id: note.id,
        title: editedTitle,
        content: editedContent,
        category_id: selectedCategoryId || undefined,
        tag_ids: selectedTagIds,
      };

      await invoke("update_note", { request });
      setSaveStatus('saved');
      setIsEditing(false);
      onUpdate();
      
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    } catch (error) {
      console.error("更新笔记失败:", error);
      setSaveStatus('error');
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

  // const handleAIAction = async (action: string) => {
  //   if (!note) return;

  //   setAiAction(action);
  //   setAiLoading(true);
  //   setAiResponse("");

  //   try {
  //     let response: string;
  //     switch (action) {
  //       case "summarize":
  //         response = await invoke<string>("summarize_note", { noteId: note.id });
  //         break;
  //       case "questions":
  //         response = await invoke<string>("generate_questions", { noteId: note.id });
  //         break;
  //       case "suggestions":
  //         response = await invoke<string>("get_ai_suggestion", { noteId: note.id });
  //         break;
  //       case "expand":
  //         response = await invoke<string>("expand_note", { noteId: note.id });
  //         break;
  //       default:
  //         response = await invoke<string>("call_ai_assistant", {
  //           request: {
  //             note_content: note.content || "",
  //             note_title: note.title,
  //             highlighted_text: note.highlighted_text,
  //             action: action,
  //           },
  //         });
  //     }
  //     setAiResponse(response);
  //   } catch (error) {
  //     console.error("AI 调用失败:", error);
  //     setAiResponse(`错误: ${error}`);
  //   } finally {
  //     setAiLoading(false);
  //   }
  // };

  // const handleInsertAIResponse = () => {
  //   if (aiResponse && note) {
  //     setEditedContent(editedContent + "\n\n" + aiResponse);
  //     setIsEditing(true);
  //   }
  // };

  // 释义模式：解释文字
  // const handleExplainText = useCallback(async (text: string) => {
  //   if (!bookId || chapterIndex === undefined || !text.trim()) {
  //     return;
  //   }

  //   setAiMode('explain');
  //   setAiLoading(true);
  //   setExplainResult('');
  //   setIsAIAssistantOpen(true);

  //   try {
  //     const result = await invoke<string>('explain_text', {
  //       selectedText: text,
  //       bookId,
  //       chapterIndex,
  //     });
  //     setExplainResult(result);
  //   } catch (error) {
  //     console.error('AI 释义失败:', error);
  //     setExplainResult(`错误: ${error instanceof Error ? error.message : String(error)}`);
  //   } finally {
  //     setAiLoading(false);
  //   }
  // }, [bookId, chapterIndex]);

  // 对话模式：发送消息
  const handleSendChatMessage = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8f2f2065-39d2-4b04-b108-cc9eb2afc339',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteDetailPanel.tsx:handleSendChatMessage',message:'Function entered',data:{input:chatInput,aiLoading},timestamp:Date.now(),sessionId:'ime-debug',hypothesisId:'H13'})}).catch(()=>{});
    // #endregion
    if (!chatInput.trim() || !bookId || chapterIndex === undefined || aiLoading) {
      return;
    }

    const userMessage = chatInput.trim();
    setChatInput('');
    
    // 添加用户消息到聊天历史
    const newUserMessage: ChatMessage = { role: 'user', content: userMessage };
    setChatMessages(prev => [...prev, newUserMessage]);
    setAiMode('chat');
    setIsAIAssistantOpen(true);

    setAiLoading(true);

    try {
      // 构建聊天历史（仅包含之前的消息）
      const history = chatMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await invoke<string>('chat_with_ai', {
        userMessage,
        bookId,
        chapterIndex,
        chatHistory: history.length > 0 ? history : null,
      });

      // 添加 AI 回复
      const aiMessage: ChatMessage = { role: 'assistant', content: response };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('AI 对话失败:', error);
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: `错误: ${error instanceof Error ? error.message : String(error)}`,
      };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setAiLoading(false);
    }
  }, [chatInput, bookId, chapterIndex, chatMessages, aiLoading]);

  const inputRef = useRef<HTMLInputElement>(null);

  // 当 selectedTextForExplain 变化时，自动触发释义
  const prevSelectedTextRef = useRef<string>('');
  useEffect(() => {
    if (selectedTextForExplain && 
        selectedTextForExplain.trim() && 
        selectedTextForExplain !== prevSelectedTextRef.current &&
        bookId !== undefined && 
        chapterIndex !== undefined) {
      prevSelectedTextRef.current = selectedTextForExplain;
      
    const triggerExplain = async () => {
      setAiMode('explain');
      setAiLoading(true);
      setExplainResult('');
      setIsAIAssistantOpen(true);

      try {
        const result = await invoke<string>('explain_text', {
          selectedText: selectedTextForExplain,
          bookId,
          chapterIndex,
        });
        setExplainResult(result);
      } catch (error) {
          console.error('AI 释义失败:', error);
          setExplainResult(`错误: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          setAiLoading(false);
        }
      };
      triggerExplain();
    }
  }, [selectedTextForExplain, bookId, chapterIndex]);

  return (
    <div 
      className="h-full flex flex-col border-l"
      style={{
        backgroundColor: isDark ? '#2D2520' : '#F5F1E8',
        borderColor: isDark ? '#4A3D35' : '#D4C8B8'
      }}
    >
      <div className="flex-1 overflow-y-auto flex flex-col">
        {note ? (
          <>
            {/* 头部操作栏 */}
            <div 
              className="p-4 border-b flex items-center justify-between"
              style={{
                borderColor: isDark ? '#4A3D35' : '#D4C8B8'
              }}
            >
              <div className="flex items-center gap-3">
                <h3 
                  className="text-lg font-semibold"
                  style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                >
                  笔记详情
                </h3>
                {isEditing && (
                  <div className="flex items-center gap-2 text-xs">
                    {saveStatus === 'saving' && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        保存中...
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        已保存
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertCircle className="w-3 h-3" />
                        保存失败
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="p-2 rounded-md transition-colors"
                      style={{ color: '#4CAF50' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
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
                      className="p-2 rounded-md transition-colors"
                      style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="取消"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="p-2 rounded-md transition-colors"
                      style={{ color: isDark ? '#D4A574' : '#A67C52' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="编辑"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleDelete}
                      className="p-2 rounded-md transition-colors"
                      style={{ color: '#EF4444' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* 快速跳转导航区域 */}
            {(note.chapter_index !== null && note.chapter_index !== undefined) && (
              <div 
                className="p-3 border-b"
                style={{
                  backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                  borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                }}
              >
                <div className="flex items-center gap-2">
                  <Navigation 
                    className="w-4 h-4"
                    style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                  />
                  <span 
                    className="text-xs font-medium"
                    style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                  >
                    快速跳转
                  </span>
                </div>
                <div className="flex gap-2 mt-2">
                  {onJumpToChapter && note.chapter_index !== null && (
                    <button
                      onClick={() => onJumpToChapter(note.chapter_index!)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors"
                      style={{
                        backgroundColor: isDark ? '#8B7355' : '#A67C52',
                        color: '#FFFFFF'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
                      }}
                      title="跳转到章节"
                    >
                      <Navigation className="w-3 h-3" />
                      跳转到章节
                    </button>
                  )}
                  {onJumpToNote && (
                    <button
                      onClick={() => onJumpToNote(note.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-md transition-colors"
                      style={{
                        backgroundColor: isDark ? '#8B7355' : '#A67C52',
                        color: '#FFFFFF'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
                      }}
                      title="在文中定位"
                    >
                      <MapPin className="w-3 h-3" />
                      在文中定位
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 内容区域 */}
            <div className="flex-1 overflow-y-auto p-4">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label 
                      className="block text-sm font-medium mb-1"
                      style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                    >
                      标题
                    </label>
                    <input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: isDark ? '#3A302A' : '#FFFFFF',
                        borderColor: isDark ? '#4A3D35' : '#D4C8B8',
                        color: isDark ? '#E8DDD0' : '#3E3530'
                      }}
                    />
                  </div>
                  <div>
                    <label 
                      className="block text-sm font-medium mb-1"
                      style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                    >
                      内容
                    </label>
                    <textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={8}
                      className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: isDark ? '#3A302A' : '#FFFFFF',
                        borderColor: isDark ? '#4A3D35' : '#D4C8B8',
                        color: isDark ? '#E8DDD0' : '#3E3530'
                      }}
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
                    <h2 
                      className="text-xl font-bold"
                      style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                    >
                      {note.title}
                    </h2>
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
                    <p 
                      className="whitespace-pre-wrap"
                      style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                    >
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
          </>
        ) : (
          <div 
            className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
          >
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: isDark ? '#3A302A' : '#EAE4D8' }}
            >
              <MessageSquare className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm">选择一个笔记查看详情，或直接使用下方的 AI 助手</p>
          </div>
        )}
      </div>

      {/* AI 助手面板 */}
      <div 
        className="border-t"
        style={{
          borderColor: isDark ? '#4A3D35' : '#D4C8B8'
        }}
      >
        <button
          onClick={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
          className="w-full p-4 flex items-center justify-between transition-colors"
          style={{
            backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = isDark ? '#3A302A' : '#EAE4D8';
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles 
              className="w-4 h-4" 
              style={{ color: isDark ? '#D4A574' : '#A67C52' }}
            />
            <span 
              className="text-sm font-medium"
              style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
            >
              AI 助手
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsAIConfigOpen(true);
              }}
              className="p-1.5 rounded transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: isDark ? '#B8A895' : '#6B5D52'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title="配置"
            >
              <Settings className="w-4 h-4" />
            </button>
            {isAIAssistantOpen ? (
              <ChevronUp 
                className="w-4 h-4" 
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              />
            ) : (
              <ChevronDown 
                className="w-4 h-4" 
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              />
            )}
          </div>
        </button>
        {isAIAssistantOpen && (
          <div 
            className="p-4 border-t"
            style={{
              backgroundColor: isDark ? '#2D2520' : '#F5F1E8',
              borderColor: isDark ? '#4A3D35' : '#D4C8B8'
            }}
          >
            {/* 模式切换标签 */}
            <div className="flex gap-2 mb-3">
              {/* 
              <button
                onClick={() => setAiMode('note')}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  aiMode === 'note' ? 'font-medium' : ''
                }`}
                style={{
                  backgroundColor: aiMode === 'note' 
                    ? (isDark ? '#8B7355' : '#A67C52')
                    : (isDark ? '#4A3D35' : '#D4C8B8'),
                  color: aiMode === 'note' ? '#FFFFFF' : (isDark ? '#E8DDD0' : '#3E3530')
                }}
              >
                笔记分析
              </button> 
              */}
              {bookId !== undefined && chapterIndex !== undefined && (
                <>
                  <button
                    onClick={() => setAiMode('explain')}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      aiMode === 'explain' ? 'font-medium' : ''
                    }`}
                    style={{
                      backgroundColor: aiMode === 'explain' 
                        ? (isDark ? '#8B7355' : '#A67C52')
                        : (isDark ? '#4A3D35' : '#D4C8B8'),
                      color: aiMode === 'explain' ? '#FFFFFF' : (isDark ? '#E8DDD0' : '#3E3530')
                    }}
                  >
                    文字释义
                  </button>
                  <button
                    onClick={() => {
                      setAiMode('chat');
                      if (chatMessages.length === 0) {
                        setChatMessages([{
                          role: 'assistant',
                          content: '你好！我是你的阅读助手。你可以问我关于当前章节的任何问题。',
                        }]);
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                      aiMode === 'chat' ? 'font-medium' : ''
                    }`}
                    style={{
                      backgroundColor: aiMode === 'chat' 
                        ? (isDark ? '#8B7355' : '#A67C52')
                        : (isDark ? '#4A3D35' : '#D4C8B8'),
                      color: aiMode === 'chat' ? '#FFFFFF' : (isDark ? '#E8DDD0' : '#3E3530')
                    }}
                  >
                    章节对话
                  </button>
                </>
              )}
            </div>

            <div className="space-y-3">
              {/* 笔记分析模式 
              {aiMode === 'note' && (
                note ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleAIAction("summarize")}
                        disabled={aiLoading}
                        className="px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                          color: isDark ? '#E8DDD0' : '#3E3530',
                        }}
                        onMouseEnter={(e) => {
                          if (!aiLoading) {
                            e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                        }}
                      >
                        总结要点
                      </button>
                      <button
                        onClick={() => handleAIAction("questions")}
                        disabled={aiLoading}
                        className="px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                          color: isDark ? '#E8DDD0' : '#3E3530',
                        }}
                        onMouseEnter={(e) => {
                          if (!aiLoading) {
                            e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                        }}
                      >
                        生成问题
                      </button>
                      <button
                        onClick={() => handleAIAction("suggestions")}
                        disabled={aiLoading}
                        className="px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                          color: isDark ? '#E8DDD0' : '#3E3530',
                        }}
                        onMouseEnter={(e) => {
                          if (!aiLoading) {
                            e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                        }}
                      >
                        学习建议
                      </button>
                      <button
                        onClick={() => handleAIAction("expand")}
                        disabled={aiLoading}
                        className="px-3 py-2 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                          color: isDark ? '#E8DDD0' : '#3E3530',
                        }}
                        onMouseEnter={(e) => {
                          if (!aiLoading) {
                            e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
                        }}
                      >
                        扩展内容
                      </button>
                    </div>

                    {aiLoading && (
                      <div className="flex items-center justify-center p-4">
                        <Loader2 
                          className="w-5 h-5 animate-spin" 
                          style={{ color: isDark ? '#D4A574' : '#A67C52' }}
                        />
                        <span 
                          className="ml-2 text-sm"
                          style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                        >
                          AI 正在思考...
                        </span>
                      </div>
                    )}

                    {aiResponse && !aiLoading && (
                      <div 
                        className="p-3 rounded-lg border"
                        style={{
                          backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                          borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div 
                            className="text-xs"
                            style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                          >
                            {aiAction === "summarize" && "总结要点"}
                            {aiAction === "questions" && "生成问题"}
                            {aiAction === "suggestions" && "学习建议"}
                            {aiAction === "expand" && "扩展内容"}
                          </div>
                          <button
                            onClick={handleInsertAIResponse}
                            className="px-2 py-1 text-xs rounded transition-colors"
                            style={{
                              backgroundColor: isDark ? '#8B7355' : '#A67C52',
                              color: '#FFFFFF'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
                            }}
                          >
                            插入到笔记
                          </button>
                        </div>
                        <div 
                          className="text-sm whitespace-pre-wrap"
                          style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                        >
                          {aiResponse}
                        </div>
                      </div>
                    )}

                    {!aiResponse && !aiLoading && (
                      <div 
                        className="p-3 rounded-lg border"
                        style={{
                          backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                          borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                        }}
                      >
                        <p 
                          className="text-xs text-center"
                          style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                        >
                          选择一个操作开始使用 AI 助手
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div 
                    className="p-3 rounded-lg border"
                    style={{
                      backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                      borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                    }}
                  >
                    <p 
                      className="text-xs text-center"
                      style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                    >
                      请先选择一个笔记以进行分析
                    </p>
                  </div>
                )
              )}
              */}

              {/* 文字释义模式 */}
              {aiMode === 'explain' && (
                <div className="space-y-3">
                  {aiLoading ? (
                    <div className="flex items-center justify-center p-4">
                      <Loader2 
                        className="w-5 h-5 animate-spin" 
                        style={{ color: isDark ? '#D4A574' : '#A67C52' }}
                      />
                      <span 
                        className="ml-2 text-sm"
                        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                      >
                        AI 正在思考...
                      </span>
                    </div>
                  ) : explainResult ? (
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                        borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                      }}
                    >
                      <div 
                        className="text-sm whitespace-pre-wrap"
                        style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
                      >
                        {explainResult}
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="p-3 rounded-lg border"
                      style={{
                        backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                        borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                      }}
                    >
                      <p 
                        className="text-xs text-center"
                        style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
                      >
                        请选中文字后点击 AI 释义按钮
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* 章节对话模式 */}
              {aiMode === 'chat' && (
                <div className="space-y-3">
                  <div 
                    className="max-h-48 overflow-y-auto p-2 rounded-lg border space-y-2"
                    style={{
                      backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
                      borderColor: isDark ? '#4A3D35' : '#D4C8B8'
                    }}
                  >
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-2 text-xs ${
                            msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
                          }`}
                          style={{
                            backgroundColor:
                              msg.role === 'user'
                                ? (isDark ? '#8B7355' : '#A67C52')
                                : (isDark ? '#4A3D35' : '#D4C8B8'),
                            color: isDark ? '#E8DDD0' : '#3E3530',
                          }}
                        >
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex justify-start">
                        <div
                          className="rounded-lg rounded-bl-sm p-2"
                          style={{
                            backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                          }}
                        >
                          <Loader2 
                            className="w-4 h-4 animate-spin" 
                            style={{ color: isDark ? '#D4A574' : '#A67C52' }}
                          />
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* 输入框 */}
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      // #region agent log
                      fetch('http://127.0.0.1:7243/ingest/8f2f2065-39d2-4b04-b108-cc9eb2afc339',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NoteDetailPanel.tsx:onSubmit',message:'Form submitted',data:{input:chatInput},timestamp:Date.now(),sessionId:'ime-debug',runId:'post-fix'})}).catch(()=>{});
                      // #endregion
                      handleSendChatMessage();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={chatInput}
                      onChange={(e) => {
                        setChatInput(e.target.value);
                      }}
                      placeholder="输入问题..."
                      disabled={aiLoading}
                      className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
                      style={{
                        backgroundColor: isDark ? '#3A302A' : '#FFFFFF',
                        color: isDark ? '#E8DDD0' : '#3E3530',
                        borderColor: isDark ? '#4A3D35' : '#D4C8B8',
                        borderWidth: '1px',
                      }}
                    />
                    <button
                      type="submit"
                      disabled={aiLoading || !chatInput.trim()}
                      className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isDark ? '#8B7355' : '#A67C52',
                        color: '#FFFFFF',
                      }}
                      onMouseEnter={(e) => {
                        if (!aiLoading && chatInput.trim()) {
                          e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
                      }}
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
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


