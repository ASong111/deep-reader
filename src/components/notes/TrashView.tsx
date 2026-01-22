import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { Note } from "../../types/notes";
import { Trash2, RotateCcw, X, Calendar } from "lucide-react";

interface TrashViewProps {
  onRestore?: (id: number) => void;
  onPermanentlyDelete?: (id: number) => void;
}

export default function TrashView({
  onRestore,
  onPermanentlyDelete,
}: TrashViewProps) {
  const { t } = useTranslation();
  const [trashNotes, setTrashNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const loadTrashNotes = useCallback(async () => {
    setLoading(true);
    try {
      const notes = await invoke<Note[]>("get_trash_notes");
      setTrashNotes(notes);
    } catch (error) {
      console.error(t('notes.loadTrashFailed'), error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrashNotes();
  }, [loadTrashNotes]);

  const handleRestore = useCallback(async (id: number) => {
    try {
      await invoke("restore_note", { id });
      await loadTrashNotes();
      onRestore?.(id);
    } catch (error) {
      console.error(t('notes.restoreNoteFailed'), error);
      alert(`${t('notes.restoreFailed')}: ${error}`);
    }
  }, [loadTrashNotes, onRestore]);

  const handlePermanentlyDelete = useCallback(async (id: number) => {
    if (!confirm(t('notes.confirmDelete'))) {
      return;
    }
    try {
      await invoke("permanently_delete_note", { id });
      await loadTrashNotes();
      onPermanentlyDelete?.(id);
    } catch (error) {
      console.error(t('notes.permanentDeleteFailed'), error);
      alert(`${t('errors.deleteFailed')}: ${error}`);
    }
  }, [loadTrashNotes, onPermanentlyDelete, t]);

  const handleBatchRestore = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t('notes.confirmRestore', { count: selectedIds.size }))) {
      return;
    }
    try {
      for (const id of selectedIds) {
        await invoke("restore_note", { id });
      }
      setSelectedIds(new Set());
      await loadTrashNotes();
    } catch (error) {
      console.error(t('notes.batchRestoreFailed'), error);
      alert(`${t('notes.batchRestoreFailed')}: ${error}`);
    }
  }, [selectedIds, loadTrashNotes, t]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(t('notes.confirmBatchDelete', { count: selectedIds.size }))) {
      return;
    }
    try {
      for (const id of selectedIds) {
        await invoke("permanently_delete_note", { id });
      }
      setSelectedIds(new Set());
      await loadTrashNotes();
    } catch (error) {
      console.error(t('notes.batchDeleteFailed'), error);
      alert(`${t('notes.batchDeleteFailed')}: ${error}`);
    }
  }, [selectedIds, loadTrashNotes, t]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    return date.toLocaleString("zh-CN");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-400">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (trashNotes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-400">
        <Trash2 className="w-16 h-16 mb-4 opacity-50" />
        <p>{t('notes.trashEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-neutral-700 border-b border-neutral-600">
          <span className="text-sm text-neutral-300">
            {t('notes.selectedCount', { count: selectedIds.size })}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleBatchRestore}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              <RotateCcw className="w-4 h-4 inline mr-1" />
              {t('notes.batchRestore')}
            </button>
            <button
              onClick={handleBatchDelete}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
            >
              <X className="w-4 h-4 inline mr-1" />
              {t('notes.batchDelete')}
            </button>
          </div>
        </div>
      )}

      {/* 笔记列表 */}
      <div className="flex-1 overflow-y-auto">
        {trashNotes.map((note) => (
          <div
            key={note.id}
            className={`p-3 border-b border-neutral-700 hover:bg-neutral-700 transition-colors ${
              selectedIds.has(note.id) ? "bg-neutral-700" : ""
            }`}
          >
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedIds.has(note.id)}
                onChange={() => toggleSelect(note.id)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-white truncate">{note.title}</h3>
                {note.highlighted_text && (
                  <p className="text-sm text-neutral-400 mt-1 line-clamp-2">
                    {note.highlighted_text}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {t('notes.deletedAt')}: {formatDate(note.deleted_at)}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleRestore(note.id)}
                  className="p-1.5 text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                  title={t('notes.restore')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePermanentlyDelete(note.id)}
                  className="p-1.5 text-red-400 hover:bg-red-900/30 rounded transition-colors"
                  title={t('notes.permanentDelete')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

