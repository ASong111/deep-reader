import React from 'react';
import { DebugSegmentScore } from '../../types/debug';

interface SegmentTimelineProps {
  debugData: DebugSegmentScore[];
  selectedSegmentId: string | null;
  onSegmentSelect: (segmentId: string) => void;
}

const SegmentTimeline: React.FC<SegmentTimelineProps> = ({
  debugData,
  selectedSegmentId,
  onSegmentSelect,
}) => {
  const getDecisionIcon = (decision: string) => {
    return decision === 'merge' ? '🟢' : '🔵';
  };

  const getDecisionLabel = (decision: string) => {
    return decision === 'merge' ? 'Merge' : 'New';
  };

  const getDecisionColor = (decision: string) => {
    return decision === 'merge' ? 'text-green-600' : 'text-blue-600';
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Segment 时间轴</h2>
      <div className="space-y-2">
        {debugData.map((segment, index) => {
          const isSelected = segment.segment_id === selectedSegmentId;

          return (
            <div
              key={segment.segment_id}
              onClick={() => onSegmentSelect(segment.segment_id)}
              className={`
                p-3 rounded-lg border cursor-pointer transition-all
                ${isSelected
                  ? 'bg-blue-50 border-blue-500 shadow-md'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getDecisionIcon(segment.decision)}</span>
                    <span className="text-xs font-mono text-gray-500">
                      #{index + 1}
                    </span>
                    <span className={`text-xs font-semibold ${getDecisionColor(segment.decision)}`}>
                      {getDecisionLabel(segment.decision)}
                    </span>
                  </div>

                  <div className="text-sm text-gray-700 font-medium truncate">
                    {segment.segment_id}
                  </div>

                  {segment.fallback && (
                    <div className="mt-1 text-xs text-orange-600 flex items-center gap-1">
                      <span>⚠️</span>
                      <span>Fallback</span>
                    </div>
                  )}
                </div>

                <div className="ml-2 text-right">
                  <div className={`
                    text-sm font-semibold
                    ${segment.total_score >= 3 ? 'text-green-600' :
                      segment.total_score <= -3 ? 'text-red-600' :
                      'text-gray-600'}
                  `}>
                    {segment.total_score >= 0 ? '+' : ''}{segment.total_score.toFixed(1)}
                  </div>
                  {segment.level && (
                    <div className="text-xs text-gray-500 mt-1">
                      L{segment.level}
                    </div>
                  )}
                </div>
              </div>

              {segment.content_type && (
                <div className="mt-2 text-xs text-gray-500">
                  {segment.content_type}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SegmentTimeline;
