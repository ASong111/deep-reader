import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteStatistics, CategoryStatistics, TagStatistics } from "../../types/notes";
import { BarChart3, FileText, Calendar, Clock, TrendingUp, Tag as TagIcon } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { translateCategoryName } from '../../utils/categoryTranslation';

export default function AnalyticsView() {
  const { t, i18n } = useTranslation();
  const [statistics, setStatistics] = useState<NoteStatistics | null>(null);
  const [categoryStats, setCategoryStats] = useState<CategoryStatistics[]>([]);
  const [tagStats, setTagStats] = useState<TagStatistics[]>([]);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    try {
      const [stats, catStats, tgStats] = await Promise.all([
        invoke<NoteStatistics>("get_note_statistics", {
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
        invoke<CategoryStatistics[]>("get_category_statistics"),
        invoke<TagStatistics[]>("get_tag_statistics"),
      ]);
      setStatistics(stats);
      setCategoryStats(catStats);
      setTagStats(tgStats);
    } catch (error) {
      console.error(t('analytics.loadStatsFailed'), error);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}${t('analytics.seconds')}`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}${t('analytics.minutes')}`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return t('analytics.hoursMinutes', { hours, minutes });
  };

  if (loading && !statistics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>{t('analytics.noStatsData')}</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 overflow-y-auto">
      {/* 头部 */}
      <div className="p-6 bg-white border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-indigo-600" />
            <h2 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('notes.startDate')}
            />
            <span className="text-gray-500">{t('analytics.to')}</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('notes.endDate')}
            />
            {(startDate || endDate) && (
              <button
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              >
                {t('analytics.clearFilter')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <FileText className="w-8 h-8 text-indigo-600" />
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('analytics.totalNotes')}</h3>
          <p className="text-3xl font-bold text-gray-900">{statistics.total_notes}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Calendar className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('analytics.todayCreated')}</h3>
          <p className="text-3xl font-bold text-gray-900">{statistics.today_created}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('analytics.weekCreated')}</h3>
          <p className="text-3xl font-bold text-gray-900">{statistics.week_created}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="text-sm font-medium text-gray-500 mb-1">{t('analytics.totalDuration')}</h3>
          <p className="text-2xl font-bold text-gray-900">
            {formatDuration(statistics.total_duration_seconds)}
          </p>
        </div>
      </div>

      {/* 详细统计 */}
      <div className="px-6 pb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 分类统计 */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('analytics.categoryStats')}</h3>
          </div>
          {categoryStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('analytics.noCategoryData')}</p>
          ) : (
            <div className="space-y-3">
              {categoryStats.map((stat) => (
                <div key={stat.category_id || 'uncategorized'} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={
                        stat.category_id
                          ? {}
                          : { backgroundColor: '#9CA3AF' }
                      }
                    />
                    <span className="text-sm text-gray-700">
                      {stat.category_name ? translateCategoryName(stat.category_name, i18n.language) : t('analytics.uncategorized')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${
                            statistics.total_notes > 0
                              ? (stat.note_count / statistics.total_notes) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">
                      {stat.note_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 标签统计 */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <TagIcon className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-900">{t('analytics.popularTags')}</h3>
          </div>
          {tagStats.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">{t('analytics.noTagData')}</p>
          ) : (
            <div className="space-y-3">
              {tagStats.slice(0, 10).map((stat) => (
                <div key={stat.tag_id} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">#{stat.tag_name}</span>
                  <div className="flex items-center gap-4">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{
                          width: `${
                            tagStats[0]?.note_count > 0
                              ? (stat.note_count / tagStats[0].note_count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8 text-right">
                      {stat.note_count}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 平均统计 */}
      <div className="px-6 pb-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('analytics.averageStats')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">{t('analytics.avgDailyCreated')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {statistics.avg_daily_created.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">{t('analytics.avgSessionDuration')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatDuration(Math.floor(statistics.avg_session_duration_seconds))}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
