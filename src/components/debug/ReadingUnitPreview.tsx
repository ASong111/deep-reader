import React from 'react';
import { ReadingUnit } from '../../types/debug';

interface ReadingUnitPreviewProps {
  readingUnits: ReadingUnit[];
  selectedUnitId: string | null;
  selectedSegmentId: string | null;
  onUnitSelect: (unitId: string) => void;
}

const ReadingUnitPreview: React.FC<ReadingUnitPreviewProps> = ({
  readingUnits,
  selectedUnitId,
  selectedSegmentId,
  onUnitSelect,
}) => {
  const getLevelIcon = (level: number) => {
    return level === 1 ? '📖' : '📄';
  };

  const getSourceBadge = (source: string) => {
    return source === 'toc' ? (
      <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded">
        TOC
      </span>
    ) : (
      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded">
        Heuristic
      </span>
    );
  };

  const isUnitHighlighted = (unit: ReadingUnit) => {
    return selectedSegmentId && unit.segment_ids.includes(selectedSegmentId);
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Reading Unit 预览区
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({readingUnits.length} 个单元)
        </span>
      </h2>

      <div className="space-y-3">
        {readingUnits.map((unit) => {
          const isSelected = unit.id === selectedUnitId;
          const isHighlighted = isUnitHighlighted(unit);

          return (
            <div
              key={unit.id}
              onClick={() => onUnitSelect(unit.id)}
              className={`
                p-4 rounded-lg border cursor-pointer transition-all
                ${isSelected
                  ? 'bg-blue-50 border-blue-500 shadow-md'
                  : isHighlighted
                  ? 'bg-yellow-50 border-yellow-400'
                  : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xl">{getLevelIcon(unit.level)}</span>
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {unit.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {getSourceBadge(unit.source)}

                    <span className="text-xs text-gray-500">
                      Level {unit.level}
                    </span>

                    <span className="text-xs text-gray-500">
                      {unit.segment_ids.length} segment{unit.segment_ids.length > 1 ? 's' : ''}
                    </span>

                    {unit.content_type && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                        {unit.content_type}
                      </span>
                    )}
                  </div>

                  {unit.parent_id && (
                    <div className="mt-2 text-xs text-gray-500">
                      ↳ Parent: {unit.parent_id}
                    </div>
                  )}
                </div>

                <div className="ml-4 text-right text-xs text-gray-500">
                  <div>Block {unit.start_block_id}</div>
                  <div>→ {unit.end_block_id}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReadingUnitPreview;
