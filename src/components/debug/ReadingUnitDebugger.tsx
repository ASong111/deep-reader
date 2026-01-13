import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { DebugSegmentScore, ReadingUnit } from '../../types/debug';
import SegmentTimeline from './SegmentTimeline';
import ReadingUnitPreview from './ReadingUnitPreview';
import SegmentDetailPanel from './SegmentDetailPanel';

interface ReadingUnitDebuggerProps {
  bookId: number;
}

const ReadingUnitDebugger: React.FC<ReadingUnitDebuggerProps> = ({ bookId }) => {
  const [debugData, setDebugData] = useState<DebugSegmentScore[]>([]);
  const [readingUnits, setReadingUnits] = useState<ReadingUnit[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDebugData();
  }, [bookId]);

  const loadDebugData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [debugScores, units] = await Promise.all([
        invoke<DebugSegmentScore[]>('get_debug_data', { bookId }),
        invoke<ReadingUnit[]>('get_reading_units', { bookId })
      ]);

      setDebugData(debugScores);
      setReadingUnits(units);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Debug 数据失败');
      console.error('Failed to load debug data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSegmentSelect = (segmentId: string) => {
    setSelectedSegmentId(segmentId);

    // 找到包含该 segment 的 reading unit
    const unit = readingUnits.find(u => u.segment_ids.includes(segmentId));
    if (unit) {
      setSelectedUnitId(unit.id);
    }
  };

  const handleUnitSelect = (unitId: string) => {
    setSelectedUnitId(unitId);

    // 高亮该 unit 的第一个 segment
    const unit = readingUnits.find(u => u.id === unitId);
    if (unit && unit.segment_ids.length > 0) {
      setSelectedSegmentId(unit.segment_ids[0]);
    }
  };

  const selectedSegment = debugData.find(d => d.segment_id === selectedSegmentId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">加载 Debug 数据中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-red-600">
          <p className="font-semibold">加载失败</p>
          <p className="text-sm mt-2">{error}</p>
          <button
            onClick={loadDebugData}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (debugData.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-600">
          <p>该书籍暂无 Debug 数据</p>
          <p className="text-sm mt-2">请确保书籍已完成解析</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">章节切分 Debug 面板</h1>
        <p className="text-sm text-gray-600 mt-1">
          Reading Unit Debugger - Book ID: {bookId}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Segment Timeline */}
        <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
          <SegmentTimeline
            debugData={debugData}
            selectedSegmentId={selectedSegmentId}
            onSegmentSelect={handleSegmentSelect}
          />
        </div>

        {/* Right: Reading Unit Preview & Detail Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Reading Unit Preview */}
          <div className="h-64 border-b border-gray-200 bg-white overflow-y-auto">
            <ReadingUnitPreview
              readingUnits={readingUnits}
              selectedUnitId={selectedUnitId}
              selectedSegmentId={selectedSegmentId}
              onUnitSelect={handleUnitSelect}
            />
          </div>

          {/* Bottom: Segment Detail Panel */}
          <div className="flex-1 bg-white overflow-y-auto">
            {selectedSegment ? (
              <SegmentDetailPanel segment={selectedSegment} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                请选择一个 Segment 查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReadingUnitDebugger;
