# 章节合并评分规则 PRD（Reading Unit Builder）

## 1. 背景与问题

DeepReader 当前在解析 EPUB / PDF / TXT / MD / HTML 等格式时，容易出现：
- 章节过碎（序、目录、小节被误判为独立章节）
- 章节边界不符合人类阅读直觉
- 严重影响沉浸式阅读体验、AI 摘要质量与阅读节奏

**根本原因**：
- 源文件的"技术结构"（HTML、分页、文件切分）≠ 人类认知中的"章节结构"

**典型问题场景**：
- EPUB 书籍的出版信息、目录、序都被当成独立章节
- 技术书籍的每个小节（1.1, 1.2, 1.3）都被当成独立章节
- 导致目录过长，阅读体验碎片化

因此需要在 Parser 之后，引入一套**格式无关、可解释、可调参**的章节合并规则，生成 DeepReader 自己的 **Reading Unit（阅读单元）**。

---

## 2. 产品目标

### 2.1 核心目标

- 构建符合人类阅读节奏的 Reading Unit
- 避免章节过碎或过长
- 为 AI 摘要、上下文理解提供稳定输入
- **尊重出版社 TOC 结构，但智能识别并合并元信息内容**

### 2.2 非目标（MVP 阶段）

- 不引入 LLM 参与章节结构决策
- 不保证 100% 还原出版社原始章节结构
- 不支持用户手动拖拽合并（后续版本）
- 不支持已导入书籍的规则自动升级

---

## 3. 核心概念定义

### 3.1 Segment（候选片段）

Parser 输出的最小结构单元，用于参与章节合并判断。

```ts
interface Segment {
  id: string
  textBlocks: Block[]
  heading?: {
    text: string
    level?: number
  }
  length: number              // 正文字符数
  positionRatio: number       // 0.0 ~ 1.0
  tocLevel?: number           // EPUB / HTML 可用
  sourceFormat: 'epub' | 'pdf' | 'md' | 'txt' | 'html'
}
```

---

### 3.2 Reading Unit（阅读单元）

DeepReader 最终用于阅读、目录、AI 输入的章节结构。

```ts
interface ReadingUnit {
  id: string
  title: string
  level: 1 | 2                // 层级：1=章，2=节
  parentId?: string           // 父节点 ID（level=2 时有值）
  segmentIds: string[]
  startBlockId: string
  endBlockId: string
  source: 'toc' | 'heuristic'
  contentType?: 'frontmatter' | 'body' | 'backmatter'  // 内容类型
  summary?: {                 // AI 摘要（可选）
    text: string
    generatedAt: number
    model: string
  }
}
```

**层级说明**：
- **level = 1**：章级别（Chapter），如"第一章"
- **level = 2**：节级别（Section），如"1.1 小节"
- **最多支持 2 层**：TOC 三级及以下会被合并到 level=2

---

## 4. 整体流程

```text
Parser (格式相关)
 → Segment Builder
 → Feature Extractor
 → Merge Scoring Engine
 → Decision Engine
 → Reading Unit Builder
 → 持久化到数据库
```

- **Feature Extractor**：格式感知
- **Merge Scoring / Decision**：格式无关
- **计算时机**：导入时一次性计算并持久化，阅读时直接读取

---

## 5. 章节合并评分模型

对每个 Segment 计算一个 **MergeScore**，用于判断：
- 是否合并进上一个 Reading Unit
- 或作为新的 Reading Unit

### 5.1 总分公式

```text
TotalScore =
  1.5 * toc_score +
  1.2 * heading_score +
  1.0 * length_score +
  1.0 * content_score +
  0.8 * position_score +
  0.8 * continuity_score
```

> ⚠️ 若某项特征不可用，则该项不计入总分，权重同时从分母中移除（归一化）。

> ⚠️ **重要**：评分模型用于灰区判断，但不是唯一决策依据。
>
> **决策优先级**：
> 1. 内容类型（content_score >= +5）
> 2. TOC 一级节点 + 非元信息
> 3. 评分模型（TotalScore）
> 4. 灰区规则（长度判断）

---

## 6. 各评分维度定义

### 6.1 TOC 语义分（toc_score）

| 条件 | 分值 | 说明 |
|---|---|---|
| TOC 一级节点（chapter-level） | -3 | **仅对非元信息内容生效** |
| TOC 二级节点 | +1 | 倾向合并到父章节 |
| TOC 三级及以下 | +2 | 强烈倾向合并 |
| 不在 TOC 中 | +2 | |

> EPUB / HTML 可用，PDF / TXT 默认缺失。

**关键说明**：
- TOC 一级节点对于**正文内容**具有"否决权"，会强制创建新章节
- 但如果 TOC 一级节点是**元信息内容**（版权页、目录、序言），会被 content_score 覆盖

---

### 6.2 标题强度分（heading_score）

**强章标题（新章节）** → -3
- `^第\s*[一二三四五六七八九十0-9]+\s*章`
- `^Chapter\s+\d+`
- `^Part\s+[IVX0-9]+`

**弱标题（小节）** → +2
- `^\d+\.\d+`
- `^\d+\.\d+\.\d+`
- `^§\s*\d+`

无标题 → +1

---

### 6.3 长度合理性分（length_score）

| 正文字数 | 分值 |
|---|---|
| < 300 | +3 |
| 300 – 800 | +2 |
| 800 – 2000 | 0 |
| 2000 – 6000 | -1 |
| > 6000 | -2 |

---

### 6.4 内容类型分（content_score）

| 内容特征 | 分值 | 说明 |
|---|---|---|
| 版权页 / ISBN / All rights reserved | +5 | 强制合并 |
| 目录 / 导航 / 链接密集 | +5 | 强制合并 |
| 序言 / 致谢 / Preface / Summary | +5 | 强制合并 |
| 正文段落为主 | 0 ~ -1 | 正常处理 |

**关键改进**：
- 元信息内容的分值提升到 +5（原为 +2 或 +4）
- 确保能够抵消 TOC 一级节点的 -4.5 分（-3 × 1.5）
- 这些内容会被标记为 `contentType: 'frontmatter'`

---

### 6.5 位置惩罚分（position_score）

| 条件 | 分值 |
|---|---|
| 位于书籍前 5% 且非强章 | +2 |
| 位于书籍后 5% | +1 |
| 紧跟强章标题 | +1 |
| 连续两个强章标题 | -1 |

---

### 6.6 连续性分（continuity_score）

| 条件 | 分值 |
|---|---|
| 编号连续（1.1 → 1.2） | +2 |
| 编号跳跃（1.3 → 2.1） | -1 |
| 无编号 | 0 |

---

## 7. 决策规则

### 7.1 完整决策流程

```text
# 第一优先级：内容类型判断
if content_score >= +5 (版权页/目录/序言):
  merge into previous Reading Unit
  mark as contentType: 'frontmatter'

# 第二优先级：TOC 一级节点 + 非元信息
elif tocLevel == 1 AND content_score < +5:
  create new Reading Unit (level=1)

# 第三优先级：TOC 二级节点
elif tocLevel == 2:
  create new Reading Unit (level=2, with parentId)

# 第四优先级：评分模型
elif TotalScore ≥ +3:
  merge into previous Reading Unit
elif TotalScore ≤ -3:
  create new Reading Unit

# 灰区处理
else:
  if length < 800:
    merge
  else:
    create new
```

### 7.2 决策流程图

```
开始
  ↓
是否为元信息内容？(content_score >= +5)
  ├─ 是 → 合并（标记为 frontmatter）
  └─ 否 ↓
是否为 TOC 一级节点？
  ├─ 是 → 新建章节（level=1）
  └─ 否 ↓
是否为 TOC 二级节点？
  ├─ 是 → 新建小节（level=2）
  └─ 否 ↓
计算 TotalScore
  ├─ >= +3 → 合并
  ├─ <= -3 → 新建章节
  └─ 灰区 ↓
长度 < 800？
  ├─ 是 → 合并
  └─ 否 → 新建章节
```

---

## 8. 层级结构设计

### 8.1 层级深度限制

DeepReader 支持 **2 层层级结构**：
- **第 1 层**：章级别（Chapter）
- **第 2 层**：节级别（Section）

**处理规则**：
- TOC 一级节点 → level = 1
- TOC 二级节点 → level = 2
- TOC 三级及以下 → 合并到 level = 2（通过 continuity_score +2 实现）

### 8.2 UI 展示示例

```
📖 第一章 标题A
  └─ 1.1 小节A
  └─ 1.2 小节B
📖 第二章 标题B
  └─ 2.1 小节C
```

### 8.3 典型场景示例

#### 场景 1：EPUB 小说
```
原始结构（Parser 输出）：
- 版权页
- 目录
- 序
- 第一章
- 第二章

处理后（Reading Unit）：
- 第一章（level=1, 包含版权页/目录/序的内容，但标记为 frontmatter）
- 第二章（level=1）
```

#### 场景 2：技术书籍
```
原始结构：
- 第一章 标题A
  - 1.1 小节A
  - 1.2 小节B
- 第二章 标题B
  - 2.1 小节C
    - 2.1.1 子小节

处理后：
- 第一章 标题A (level=1)
  - 1.1 小节A (level=2)
  - 1.2 小节B (level=2)
- 第二章 标题B (level=1)
  - 2.1 小节C (level=2, 包含 2.1.1 的内容)
```

---

## 9. 各格式适配原则

### 9.1 EPUB / HTML
- 使用 TOC 语义分
- heading 规则全量生效
- 优先识别元信息内容（版权页、目录、序言）

### 9.2 Markdown
- `#` → 强章（level=1）
- `##` → 小节（level=2）
- `###` 及以下 → 合并到 level=2
- 忽略代码块长度

### 9.3 TXT
- 无 TOC
- 标题完全依赖正则
- 第一章前内容默认合并
- 通过 position_score 识别前言内容

### 9.4 PDF
- TOC 默认缺失
- heading 来源：字号、粗体、居中
- 页眉页脚 → content_score +5
- 通过 position_score 识别前言内容

---

## 10. 降级策略

### 10.1 触发条件

当某个 Segment 的评分计算失败时（特征提取异常、数据缺失等），启用降级策略。

### 10.2 简单规则

```text
if heading matches 强章标题正则:
  create new Reading Unit
elif length < 800:
  merge into previous Reading Unit
else:
  create new Reading Unit
```

**强章标题正则**：
- `^第\s*[一二三四五六七八九十0-9]+\s*章`
- `^Chapter\s+\d+`
- `^Part\s+[IVX0-9]+`

### 10.3 降级标记

降级的 Segment 会在 Debug 数据中标记：

```ts
interface DebugSegmentScore {
  // ... 其他字段
  fallback: boolean         // 是否使用了降级策略
  fallbackReason?: string   // 降级原因
}
```

---

## 11. AI 摘要生成策略

### 11.1 生成规则

```text
if level == 1 (章级别):
  always generate summary
elif level == 2 (节级别):
  if length >= 1500:
    generate summary
  else:
    no summary
```

**关键参数**：
- 章级别：总是生成摘要
- 节级别：1500 字阈值

### 11.2 摘要时机

- 在 Reading Unit 构建完成后
- 异步生成，不阻塞导入流程
- 生成失败不影响阅读功能

---

## 12. 用户设置

### 12.1 前言内容显示控制

**设置项**：
- 名称：`显示前言内容`
- 类型：布尔开关
- 默认值：`false`（隐藏）

**影响范围**：
- 版权页
- 目录
- 序言
- 致谢
- 其他 `contentType === 'frontmatter'` 的内容

**实现方式**：
- 这些内容被合并到第一个正文章节
- 用户开启开关后，在阅读器中显示这些内容
- 用户关闭开关后，跳过这些内容直接进入正文

---

## 13. 性能与缓存

### 13.1 计算时机

- **导入时一次性计算**：在书籍导入流程中完成章节合并
- **结果持久化**：将 Reading Unit 结构保存到数据库
- **阅读时直接读取**：不重新计算，保证阅读性能

### 13.2 规则版本管理

```ts
interface Book {
  // ... 其他字段
  chapterRuleVersion: string  // 记录使用的规则版本
}
```

**规则升级策略**：
- 已导入书籍保持原有章节结构
- 只有新导入的书籍使用新规则
- 不提供批量重新计算功能（MVP 阶段）

---

## 14. Debug 与可解释性要求（必须）

系统必须输出每个 Segment 的评分明细：

```ts
interface DebugSegmentScore {
  segmentId: string
  scores: {
    toc?: number
    heading?: number
    length?: number
    content?: number
    position?: number
    continuity?: number
  }
  weights: Record<string, number>
  totalScore: number
  decision: 'merge' | 'new'
  decisionReason: string        // 决策原因（如："元信息内容，强制合并"）
  fallback: boolean             // 是否使用了降级策略
  fallbackReason?: string       // 降级原因
  contentType?: 'frontmatter' | 'body' | 'backmatter'
  level?: 1 | 2                 // 如果创建新 Reading Unit，其层级
}
```

**示例输出**：

```json
{
  "segmentId": "seg-004",
  "scores": {
    "toc": 1,
    "heading": 2,
    "length": 3,
    "content": 0,
    "position": 1,
    "continuity": 2
  },
  "weights": {
    "toc": 1.5,
    "heading": 1.2,
    "length": 1.0,
    "content": 1.0,
    "position": 0.8,
    "continuity": 0.8
  },
  "totalScore": 9.3,
  "decision": "merge",
  "decisionReason": "总分 9.3 >= +3，且长度 < 800",
  "fallback": false
}
```

> 该数据用于：调参、回放、Debug 面板可视化。

---

## 15. MVP 功能范围

### 15.1 优先级排序

| 优先级 | 功能 | 说明 |
|---|---|---|
| P0 | 基础评分模型 | 6 个维度的评分计算 |
| P0 | 各格式适配 | EPUB/PDF/TXT/MD/HTML |
| P0 | Debug 面板 | 评分明细可视化 |
| P0 | 降级策略 | 失败时的简单规则 |
| P1 | 2 层层级结构 | 章-节两层支持 |
| P1 | 元信息识别 | 版权页、目录、序言 |
| P2 | 用户设置 | 显示/隐藏前言内容 |
| P2 | AI 摘要 | 基于字数阈值智能生成 |

### 15.2 MVP 交付标准

- P0 功能全部完成
- P1 功能至少完成 1 个
- 通过所有测试用例

---

## 16. 测试与验收

### 16.1 测试用例集

准备 **5-10 本测试书籍**，覆盖以下场景：

| 类型 | 数量 | 测试重点 |
|---|---|---|
| 小说类 | 2-3 本 | 简单章节结构，测试基础合并逻辑 |
| 技术书籍 | 2-3 本 | 多级小节，测试层级结构处理 |
| 论文集 | 1-2 本 | 序言、致谢、版权页，测试元信息识别 |

### 16.2 每本书的测试数据

```ts
interface TestCase {
  bookPath: string
  format: 'epub' | 'pdf' | 'txt' | 'md' | 'html'
  expectedChapters: {
    title: string
    level: 1 | 2
    shouldMerge: boolean      // 是否应该被合并
    contentType?: 'frontmatter' | 'body' | 'backmatter'
  }[]
}
```

### 16.3 验收标准

- ✅ 所有测试用例的章节结构与预期一致
- ✅ 元信息内容（版权页、目录、序言）被正确识别并合并
- ✅ 层级结构正确（最多 2 层）
- ✅ Debug 面板能清晰展示每个 Segment 的评分过程
- ✅ 降级策略在异常情况下正常工作
- ✅ EPUB 不再出现大量"只有一页"的章节
- ✅ 技术书籍的小节正确归属到章节下
- ✅ 规则行为可解释、可调试

---

## 17. 迭代规划（非 MVP）

- 引入 AI 判断灰区 Segment
- 支持用户手动合并 / 拆分 Reading Unit
- 支持阅读偏好（偏长 / 偏短章节）
- 基于真实阅读时长反馈动态调权重
- 支持已导入书籍的规则批量升级
- 支持 3 层及以上的层级结构（可配置）

---

## 18. 技术实现建议

### 18.1 模块划分

```
src/
  reading-unit/
    feature-extractor.ts      # 特征提取
    scoring-engine.ts         # 评分计算
    decision-engine.ts        # 决策逻辑
    reading-unit-builder.ts   # Reading Unit 构建
    fallback-strategy.ts      # 降级策略
```

### 18.2 数据库设计

```sql
-- Reading Unit 表
CREATE TABLE reading_units (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  title TEXT NOT NULL,
  level INTEGER NOT NULL,        -- 1 或 2
  parent_id TEXT,                -- 父节点 ID
  segment_ids TEXT NOT NULL,     -- JSON 数组
  start_block_id TEXT NOT NULL,
  end_block_id TEXT NOT NULL,
  source TEXT NOT NULL,          -- 'toc' 或 'heuristic'
  content_type TEXT,             -- 'frontmatter', 'body', 'backmatter'
  summary_text TEXT,
  summary_generated_at INTEGER,
  created_at INTEGER NOT NULL
);

-- Debug 数据表（开发环境）
CREATE TABLE debug_segment_scores (
  segment_id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  scores TEXT NOT NULL,          -- JSON
  total_score REAL NOT NULL,
  decision TEXT NOT NULL,
  decision_reason TEXT NOT NULL,
  fallback INTEGER NOT NULL,     -- 0 或 1
  fallback_reason TEXT,
  created_at INTEGER NOT NULL
);
```

---

**一句话总结**：
> 本规则不是在还原文件结构，而是在定义 DeepReader 的"阅读品味"。

**核心设计原则**：
> 尊重 TOC，智能识别元信息，保留必要层级，提供灵活控制。
