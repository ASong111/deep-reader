import React from 'react';
import { DebugSegmentScore } from '../../types/debug';

interface SegmentDetailPanelProps {
  segment: DebugSegmentScore;
}

const SegmentDetailPanel: React.FC<SegmentDetailPanelProps> = ({ segment }) => {
  const scoreEntries = Object.entries(segment.scores);
  const hasScores = scoreEntries.length > 0;

  const getScoreColor = (score: number) => {
    if (score >= 2) return 'text-green-600';
    if (score <= -2) return 'text-red-600';
    return 'text-gray-700';
  };

  const getScoreDescription = (key: string, score: number) => {
    const descriptions: Record<string, Record<string, string>> = {
      toc_score: {
        '-3': 'TOC 一级节点（仅对非元信息内容生效）',
        '1': 'TOC 二级节点，倾向合并到父章节',
        '2': 'TOC 三级及以下，强烈倾向合并',
      },
      heading_score: {
        '-3': '强章标题，创建新章节',
        '2': '弱标题（小节），倾向合并',
        '1': '无标题，倾向合并',
      },
      length_score: {
        '3': '< 300 字，强烈倾向合并',
        '2': '300-800 字，倾向合并',
        '0': '800-2000 字，中性',
        '-1': '2000-6000 字，轻微倾向独立',
        '-2': '> 6000 字，倾向独立',
      },
      content_score: {
        '5': '元信息内容（版权页/目录/序言），强制合并',
        '0': '正文，中性',
      },
      position_score: {
        '2': '位于书籍前 5% 且非强章',
        '1': '位于书籍后 5% 或紧跟强章标题',
        '0': '正常位置',
      },
      continuity_score: {
        '2': '编号连续，倾向合并',
        '-1': '编号跳跃，倾向独立',
      },
    };

    const scoreStr = score.toString();
    return descriptions[key]?.[scoreStr] || '';
  };

  const calculateWeightedScore = (score: number, weight: number) => {
    return score * weight;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Segment 详情面板</h2>
        <div className="text-sm text-gray-600">
          <div className="font-mono">{segment.segment_id}</div>
        </div>
      </div>

      {/* 决策结果 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">决策结果</h3>
        <div className="flex items-center gap-4">
          <div>
            <span className={`
              inline-block px-3 py-1 rounded-full text-sm font-semibold
              ${segment.decision === 'merge'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
              }
            `}>
              {segment.decision === 'merge' ? '🟢 Merge' : '🔵 Create New'}
            </span>
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-700">{segment.decision_reason}</div>
          </div>
          {segment.level && (
            <div className="text-sm text-gray-600">
              Level: <span className="font-semibold">{segment.level}</span>
            </div>
          )}
        </div>

        {segment.fallback && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded">
            <div className="flex items-start gap-2">
              <span className="text-orange-600">⚠️</span>
              <div className="flex-1">
                <div className="text-sm font-semibold text-orange-700">Fallback 策略</div>
                {segment.fallback_reason && (
                  <div className="text-sm text-orange-600 mt-1">{segment.fallback_reason}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 评分明细表 */}
      {hasScores && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">评分明细</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">维度</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 border">分数</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 border">权重</th>
                  <th className="px-4 py-2 text-right font-semibold text-gray-700 border">加权后</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-700 border">说明</th>
                </tr>
              </thead>
              <tbody>
                {scoreEntries.map(([key, score]) => {
                  const weight = segment.weights[key] || 1.0;
                  const weighted = calculateWeightedScore(score, weight);
                  const description = getScoreDescription(key, score);

                  return (
                    <tr key={key} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border font-medium text-gray-700">
                        {key.replace('_score', '').toUpperCase()}
                      </td>
                      <td className={`px-4 py-2 border text-right font-semibold ${getScoreColor(score)}`}>
                        {score >= 0 ? '+' : ''}{score.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 border text-right text-gray-600">
                        {weight.toFixed(1)}
                      </td>
                      <td className={`px-4 py-2 border text-right font-semibold ${getScoreColor(weighted)}`}>
                        {weighted >= 0 ? '+' : ''}{weighted.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 border text-gray-600 text-xs">
                        {description}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-blue-50 font-bold">
                  <td className="px-4 py-2 border text-gray-900">TOTAL</td>
                  <td className="px-4 py-2 border"></td>
                  <td className="px-4 py-2 border"></td>
                  <td className={`px-4 py-2 border text-right text-lg ${getScoreColor(segment.total_score)}`}>
                    {segment.total_score >= 0 ? '+' : ''}{segment.total_score.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 border text-xs text-gray-600">
                    {segment.decision === 'merge' ? '倾向合并' : '倾向独立'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 决策解释区 */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">决策解释</h3>
        <div className="text-sm text-blue-800">
          <p className="mb-2">
            该 Segment 被{segment.decision === 'merge' ? '合并' : '创建为新章节'}的主要原因是：
          </p>
          <ul className="list-disc list-inside space-y-1">
            {scoreEntries
              .filter(([_, score]) => Math.abs(score) >= 2)
              .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              .map(([key, score]) => {
                const weight = segment.weights[key] || 1.0;
                const weighted = calculateWeightedScore(score, weight);
                return (
                  <li key={key}>
                    {key.replace('_score', '').toUpperCase()}:
                    <span className="font-semibold ml-1">
                      {weighted >= 0 ? '+' : ''}{weighted.toFixed(1)}
                    </span>
                    <span className="text-xs ml-2 text-blue-600">
                      ({getScoreDescription(key, score)})
                    </span>
                  </li>
                );
              })}
          </ul>
          {segment.content_type && (
            <p className="mt-3 text-xs">
              内容类型: <span className="font-semibold">{segment.content_type}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SegmentDetailPanel;
