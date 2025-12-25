import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MessageSquare, X, Send, Loader2, Sparkles } from 'lucide-react';
import { ThemeMode } from '../immersive-reader/types';

interface AISidebarProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  bookId?: number;
  chapterIndex?: number;
  initialText?: string; // 初始选中的文字（用于释义模式）
}

type SidebarMode = 'explain' | 'chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const AISidebar = ({
  isOpen,
  onClose,
  theme,
  bookId,
  chapterIndex,
  initialText,
}: AISidebarProps) => {
  const [mode, setMode] = useState<SidebarMode>('explain');
  const [explainResult, setExplainResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const inputRef = useRef<HTMLInputElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // 当 initialText 变化时，自动触发释义
  useEffect(() => {
    if (isOpen && initialText && mode === 'explain' && !explainResult) {
      handleExplainText(initialText);
    }
  }, [isOpen, initialText, mode]);

  // 释义模式：解释文字
  const handleExplainText = useCallback(async (text: string) => {
    if (!bookId || chapterIndex === undefined || !text.trim()) {
      return;
    }

    setIsLoading(true);
    setExplainResult('');
    setMode('explain');

    try {
      const result = await invoke<string>('explain_text', {
        selectedText: text,
        bookId,
        chapterIndex,
      });
      setExplainResult(result);
    } catch (error) {
      console.error('AI 释义失败:', error);
      setExplainResult(`错误: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, chapterIndex]);

  // 对话模式：发送消息
  const handleSendMessage = useCallback(async () => {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/8f2f2065-39d2-4b04-b108-cc9eb2afc339',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AISidebar.tsx:handleSendMessage',message:'Function entered',data:{input:inputMessage,isLoading},timestamp:Date.now(),sessionId:'ime-debug',hypothesisId:'H13'})}).catch(()=>{});
    // #endregion
    if (!inputMessage.trim() || !bookId || chapterIndex === undefined || isLoading) {
      return;
    }

    const userMessage = inputMessage.trim();
    setInputMessage('');
    
    // 添加用户消息到聊天历史
    const newUserMessage: ChatMessage = { role: 'user', content: userMessage };
    setChatMessages(prev => [...prev, newUserMessage]);

    setIsLoading(true);

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
      setIsLoading(false);
    }
  }, [inputMessage, bookId, chapterIndex, chatMessages, isLoading]);

  // 切换到对话模式
  const handleSwitchToChat = useCallback(() => {
    setMode('chat');
    setExplainResult('');
    // 如果聊天历史为空，可以添加一个欢迎消息
    if (chatMessages.length === 0) {
      setChatMessages([{
        role: 'assistant',
        content: '你好！我是你的阅读助手。你可以问我关于当前章节的任何问题。',
      }]);
    }
  }, [chatMessages.length]);

  // 切换到释义模式
  const handleSwitchToExplain = useCallback(() => {
    setMode('explain');
    setChatMessages([]);
    // 如果有初始文字，重新解释
    if (initialText) {
      handleExplainText(initialText);
    }
  }, [initialText, handleExplainText]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed right-0 top-0 bottom-0 w-96 z-50 flex flex-col shadow-2xl border-l"
      style={{
        backgroundColor: isDark ? '#3A302A' : '#EAE4D8',
        borderColor: isDark ? '#4A3D35' : '#D4C8B8',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 border-b"
        style={{
          borderColor: isDark ? '#4A3D35' : '#D4C8B8',
        }}
      >
        <div className="flex items-center gap-2">
          <Sparkles
            className="w-5 h-5"
            style={{ color: isDark ? '#D4A574' : '#A67C52' }}
          />
          <h2
            className="text-lg font-semibold"
            style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
          >
            AI 助手
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {/* 模式切换按钮 */}
          <button
            onClick={mode === 'explain' ? handleSwitchToChat : handleSwitchToExplain}
            className="p-2 rounded transition-colors"
            style={{
              backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
              color: isDark ? '#E8DDD0' : '#3E3530',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
            }}
            title={mode === 'explain' ? '切换到对话模式' : '切换到释义模式'}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded transition-colors"
            style={{
              backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
              color: isDark ? '#E8DDD0' : '#3E3530',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#524439' : '#C9BDAD';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = isDark ? '#4A3D35' : '#D4C8B8';
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {mode === 'explain' ? (
          /* 释义模式 */
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: isDark ? '#D4A574' : '#A67C52' }} />
              </div>
            ) : explainResult ? (
              <div
                className="prose prose-sm max-w-none"
                style={{ color: isDark ? '#E8DDD0' : '#3E3530' }}
              >
                <p className="whitespace-pre-wrap">{explainResult}</p>
              </div>
            ) : (
              <div
                className="text-center text-sm"
                style={{ color: isDark ? '#B8A895' : '#6B5D52' }}
              >
                请选中文字后点击 AI 释义按钮
              </div>
            )}
          </div>
        ) : (
          /* 对话模式 */
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      msg.role === 'user'
                        ? 'rounded-br-sm'
                        : 'rounded-bl-sm'
                    }`}
                    style={{
                      backgroundColor:
                        msg.role === 'user'
                          ? isDark ? '#8B7355' : '#A67C52'
                          : isDark ? '#4A3D35' : '#D4C8B8',
                      color: isDark ? '#E8DDD0' : '#3E3530',
                    }}
                  >
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div
                    className="rounded-lg rounded-bl-sm p-3"
                    style={{
                      backgroundColor: isDark ? '#4A3D35' : '#D4C8B8',
                    }}
                  >
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: isDark ? '#D4A574' : '#A67C52' }} />
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
                fetch('http://127.0.0.1:7243/ingest/8f2f2065-39d2-4b04-b108-cc9eb2afc339',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AISidebar.tsx:onSubmit',message:'Form submitted',data:{input:inputMessage},timestamp:Date.now(),sessionId:'ime-debug',runId:'post-fix'})}).catch(()=>{});
                // #endregion
                handleSendMessage();
              }}
              className="p-4 border-t"
              style={{
                borderColor: isDark ? '#4A3D35' : '#D4C8B8',
              }}
            >
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                  }}
                  placeholder="输入问题..."
                  disabled={isLoading}
                  className="flex-1 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
                  style={{
                    backgroundColor: isDark ? '#2D2520' : '#F5F1E8',
                    color: isDark ? '#E8DDD0' : '#3E3530',
                    borderColor: isDark ? '#4A3D35' : '#D4C8B8',
                    borderWidth: '1px',
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputMessage.trim()}
                  className="p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: isDark ? '#8B7355' : '#A67C52',
                    color: '#FFFFFF',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading && inputMessage.trim()) {
                      e.currentTarget.style.backgroundColor = isDark ? '#9A8164' : '#B58A61';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? '#8B7355' : '#A67C52';
                  }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default AISidebar;

