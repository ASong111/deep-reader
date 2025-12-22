import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Eye, EyeOff, Save } from "lucide-react";

interface AIConfig {
  id: number;
  platform: string;
  api_key: string | null;
  base_url: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
}

interface AIConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PLATFORM_NAMES: Record<string, string> = {
  openai: "OpenAI (GPT)",
  "openai-cn": "OpenAI (国内)",
  anthropic: "Anthropic (Claude)",
  google: "Google (Gemini)",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-3.5-turbo",
  "openai-cn": "gpt-3.5-turbo",
  anthropic: "claude-3-sonnet-20240229",
  google: "gemini-pro",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  "openai-cn": "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
};

export default function AIConfigDialog({
  isOpen,
  onClose,
  onSuccess,
}: AIConfigDialogProps) {
  const [configs, setConfigs] = useState<AIConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfigs();
    }
  }, [isOpen]);

  const loadConfigs = async () => {
    try {
      const data = await invoke<AIConfig[]>("get_ai_configs");
      setConfigs(data);
    } catch (error) {
      console.error("加载 AI 配置失败:", error);
      alert("加载配置失败");
    }
  };

  const handleEdit = (config: AIConfig) => {
    setEditingConfig({ ...config });
  };

  const handleSave = async () => {
    if (!editingConfig) return;

    if (!editingConfig.api_key?.trim()) {
      alert("请输入 API Key");
      return;
    }

    setLoading(true);
    try {
      await invoke("update_ai_config", { config: editingConfig });
      await loadConfigs();
      setEditingConfig(null);
      onSuccess();
    } catch (error) {
      console.error("保存配置失败:", error);
      alert(`保存失败: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setEditingConfig(null);
  };

  const toggleShowApiKey = (id: number) => {
    setShowApiKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">AI 助手配置</h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <div className="space-y-4">
            {configs.map((config) => (
              <div
                key={config.id}
                className="p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="font-medium text-gray-900">
                      {PLATFORM_NAMES[config.platform] || config.platform}
                    </h4>
                    {config.is_active && (
                      <span className="text-xs text-green-600 font-medium">
                        当前激活
                      </span>
                    )}
                  </div>
                  {!editingConfig && (
                    <button
                      onClick={() => handleEdit(config)}
                      className="px-3 py-1 text-sm text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                    >
                      配置
                    </button>
                  )}
                </div>

                {editingConfig?.id === config.id ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        API Key <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey[config.id] ? "text" : "password"}
                          value={editingConfig.api_key || ""}
                          onChange={(e) =>
                            setEditingConfig({
                              ...editingConfig,
                              api_key: e.target.value,
                            })
                          }
                          placeholder="输入 API Key"
                          className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => toggleShowApiKey(config.id)}
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          {showApiKey[config.id] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Base URL
                      </label>
                      <input
                        type="text"
                        value={editingConfig.base_url || DEFAULT_BASE_URLS[config.platform] || ""}
                        onChange={(e) =>
                          setEditingConfig({
                            ...editingConfig,
                            base_url: e.target.value || null,
                          })
                        }
                        placeholder={DEFAULT_BASE_URLS[config.platform] || "Base URL"}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        模型
                      </label>
                      <input
                        type="text"
                        value={editingConfig.model}
                        onChange={(e) =>
                          setEditingConfig({
                            ...editingConfig,
                            model: e.target.value,
                          })
                        }
                        placeholder={DEFAULT_MODELS[config.platform] || "Model"}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          温度 (0-2)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="2"
                          step="0.1"
                          value={editingConfig.temperature}
                          onChange={(e) =>
                            setEditingConfig({
                              ...editingConfig,
                              temperature: parseFloat(e.target.value) || 0.7,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          最大 Token
                        </label>
                        <input
                          type="number"
                          min="100"
                          max="8000"
                          value={editingConfig.max_tokens}
                          onChange={(e) =>
                            setEditingConfig({
                              ...editingConfig,
                              max_tokens: parseInt(e.target.value) || 2000,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id={`active-${config.id}`}
                        checked={editingConfig.is_active}
                        onChange={(e) =>
                          setEditingConfig({
                            ...editingConfig,
                            is_active: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                      />
                      <label
                        htmlFor={`active-${config.id}`}
                        className="ml-2 text-sm text-gray-700"
                      >
                        激活此配置
                      </label>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-1 px-4 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <Save className="w-4 h-4" />
                        {loading ? "保存中..." : "保存"}
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">
                    {config.api_key ? (
                      <span className="text-green-600">已配置</span>
                    ) : (
                      <span className="text-gray-400">未配置</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}