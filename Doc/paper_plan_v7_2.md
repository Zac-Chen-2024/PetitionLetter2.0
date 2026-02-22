# UIST 2026 Paper Plan

## Structure-Mediated Authoring: Human-AI Collaborative Legal Writing Through Argument Assembly

### v7.2 — Implementation Roadmap Edition

2026年2月22日

---

## v7.2 更新概要

**[v7.2 定位]** 在 v7.1 novelty 验证的基础上，新增两个关键部分：(1) 代码实现路线图——明确从现在到 3月31日 deadline 的开发优先级和具体 task；(2) 提交时间线——覆盖 abstract、paper、video、study 的完整排期。v7.1 的叙事和 novelty 不变，v7.2 确保"论文写什么"和"代码做什么"完全对齐。

**v7.1 → v7.2 核心变更：**

- **#39** 新增 Section 十六 "代码实现路线图"：P0-P3 优先级 + 具体 task 分解 + 代码改动点
- **#40** 新增 Section 十七 "提交时间线"：从现在到 4月9日的周级排期
- **#41** 更新 Section 十四 "实现状态"：基于代码审查结果，精确标注每个组件的完成度和缺失点

**v7.0 → v7.1 核心变更：**

- **#33** Stage 4 novelty 验证完成：SubArgument 作为 intent/generation/provenance 的三重耦合点确认为 genuinely novel
- **#34** Related Work 新增 Section 4.4 "Semantic Editing and Intent-Level Iteration"：覆盖 Semantic Commit (UIST'25) 和 Bridging Gulfs in UI Generation (2025 preprint)
- **#35** Related Work 4.1 新增 Ai.llude (DIS'24)：补全 text-level 迭代的对比
- **#36** Stage 4 (Section 5.5) 重写：对比表从 3 个工具扩展到 4 个（+Semantic Commit），新增"三重耦合"的精确技术表述和实现路径确认
- **#37** Section 1.4 差异化矩阵升级为 6 工具全面对比
- **#38** 引用列表新增 5 篇

### v7.1 Novelty 验证总结

| 层面 | Claim | Novel? | 关键对比 |
|------|-------|--------|---------|
| Layer 1: Edit structure → trigger rewrite | 编辑高层结构触发文本重写 | ❌ 单独不 novel | VISAR goals, Notion AI outline |
| Layer 2: Edit semantic unit not text | 编辑 SubArgument 而非文本/prompt | ✅ Moderately novel | ABScribe = prompt; InkSync = text; neither at argumentative intent level |
| **Layer 3: Three-way automatic consistency** | 编辑 SubArgument → 重写 → provenance 自动完整 | **✅ Genuinely novel** | InkSync: Levenshtein repair; ABScribe: provenance lost; VISAR: full regen; Semantic Commit: no gen-provenance link |

**核心 novelty：** SubArgument 同时是 (1) argumentative intent interface, (2) generation boundary, (3) provenance anchor。编辑它同时改变 generation semantics、scope、provenance path——**三者自动保持一致**。文献中无先例。

### v6.8 → v7.0 变更（保留供参考）

- **#26** 叙事框架从"一个问题 + 三个交互"重构为"一个统一设计理念 + 闭环"
- **#27** 贡献从三个精简为两个：C1 = Structure-Mediated Authoring (Conceptual + Empirical)，C2 = Structure-Preserving Provenance (Technical)
- **#28** System Design 从按组件组织改为按闭环阶段组织（Construction → Generation → Verification → Refinement）
- **#29** 五层模型、entity tracking、qualification checklist、dual-mode 全部降级为 instantiation details，不单独 claim
- **#30** 新增"迭代重写"作为关键能力——律师改结构而非改文本，provenance 通过结构保持完整
- **#31** RQ 从四个精简为三个，聚焦闭环的不同环节
- **#32** 标题更换为 "Structure-Mediated Authoring"

### v6.8 被毙掉的原因（模拟审稿人视角）

| 问题 | 具体 | v7.0 怎么解决 |
|------|------|--------------|
| 五层层级缺乏 justification | "为什么五层不是四层？" Toulmin 映射牵强 | 不再 claim 五层是贡献；只是 instantiation detail |
| 三个 novel interactions 只有一个真 novel | (b) qualification checklist = 临床决策支持做了 20 年；(c) provenance + dual-mode 硬绑 | 不再逐个 claim novelty；所有交互统一在闭环叙事下 |
| System Design 2800w 但无 component-level eval | 六个子系统只比了 A (everything) vs B (read-only) | 按闭环阶段组织，每阶段都服务同一个设计理念 |
| Formative Study 过载 | 3-5 人要产出 DP1-5 + verify 失效 + subject attribution + SubArgument justification + dual-mode justification | 只需要产出 F1-F4 + DP1-3，所有都指向闭环 |

---

## 一、论文定位（v7.0）

### 1.1 核心定位：一句话

> **论证结构既是生成的输入（generation constraint），又是验证的通道（verification path），又是迭代的锚点（iteration anchor）。**

这不是三个功能凑在一起，是一个设计理念（structure-mediated authoring）的三个表现。拖拽映射、Writing Tree、Provenance Engine、迭代重写全部由"论证结构是核心枢纽"这个统一概念串联。

### 1.2 核心故事线（三拍结构，v7.0）

**第一拍 — 领域问题：** AI writing 普遍采用 generate-then-verify。在 evidence-based professional writing 中，两个失效：(1) automation bias 导致审查不足；(2) 生成与验证之间缺乏结构性连接——AI 生成文本，人类只能逐句审查，无法理解"为什么这个证据放在这里"。

**第二拍 — 核心洞察：** Formative study 发现律师的论证结构（argument structure）可以同时解决生成和验证问题。当律师手动构建证据到标准的映射时，构建行为本身就是验证（mapping as verification）。而且这个结构不是一次性的——它可以作为生成的约束、验证的路径、迭代的锚点。

**第三拍 — 解决方案：** Structure-Mediated Authoring——一个闭环设计理念，律师构建论证结构 → 系统基于结构生成文本 → 律师通过结构验证文本 → 律师修改结构触发重写 → 循环。在 EB-1A immigration petition writing 中实例化为 [SystemName]。

### 1.3 闭环图（论文核心 Figure 1）

```
    ┌─────────────────────────────────────────────────┐
    │         Structure-Mediated Authoring Loop        │
    │                                                  │
    │   ① Construct Structure ─────────────────┐      │
    │      (drag-drop mapping,                  │      │
    │       entity check)                       ▼      │
    │                                 ② Generate Text  │
    │   ④ Refine Structure ◄──────    (structure-      │
    │      (edit SubArgument,         constrained       │
    │       add snippets,             writing)          │
    │       modify mapping)                    │       │
    │            ▲                              ▼       │
    │            └──────────── ③ Verify Text           │
    │                          (structural provenance:  │
    │                           sentence → subarg →     │
    │                           snippet → bbox)         │
    └─────────────────────────────────────────────────┘
```

**关键：** 论证结构是这个闭环中唯一不变的基础设施。四个阶段都通过结构运行。

### 1.4 与核心相关工作的差异矩阵（v7.1 全面版）

| | Sensecape (UIST'23) | VISAR (UIST'23) | InkSync (UIST'24) | ABScribe (CHI'24) | Semantic Commit (UIST'25) | **[SystemName]** |
|---|---|---|---|---|---|---|
| 结构角色 | 组织工具 | 生成辅助 | 无 | 无 | Intent 一致性管理 | **核心基础设施** |
| Gen constraint | ✓ | ✓ | ✗ | ✗ | ✗ | **✓** |
| Verification path | ✗ | ✗ | Flat (edit-level) | ✗ | ✗ | **✓ (structural → BBox)** |
| Iteration mechanism | Restructure concepts | Edit goal → regen all | Edit text (char-level) | Switch prompt variant | Edit intent → conflict detect | **Edit SubArg → incremental regen** |
| Provenance after iteration | N/A | Lost (full regen) | Levenshtein repair | Lost | N/A | **Structurally preserved** |
| Entity tracking | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** |
| 物理溯源 (BBox) | ✗ | ✗ | ✗ | ✗ | ✗ | **✓** |

**一句话差异化：** 现有工具要么把结构当工具（Sensecape/VISAR：用完即弃），要么做 flat provenance（InkSync/HaLLMark：无结构层），要么做 intent 一致性（Semantic Commit：无 generation-provenance 链）。我们的结构是**基础设施**——generation、verification、iteration 全程通过它运行，且改结构 = 改一切，一切自动一致。

### 1.5 为什么 Writing Tree 是真正的贡献

Writing Tree 不只是可视化。它是 **structural provenance layer**——provenance 链的中间层：

```
LetterPanel sentence "Dr. Qu developed comprehensive training methodology..."
  ↓ generated-from
Writing Tree node: SubArgument "Development of Integrated Training System"
  ↓ supported-by
Snippet "Dr. Qu's methodology integrates biomechanics, psychology..."
  ↓ located-at
BBox: Exhibit A, page 2, (120, 340, 580, 380)
```

现有工具做的是 **flat provenance**（sentence → source 直接连线）。我们做的是 **structural provenance**（sentence → argument structure → source），论证结构本身成为 provenance 链的一部分。这意味着律师可以在任意粒度理解"为什么系统写了这句话"。

### 1.6 SubArgument 的三重耦合性（v7.1 核心创新表述）

SubArgument 是系统的核心设计创新。它不是普通的大纲节点——它同时是三个东西：

| 角色 | 具体 | 意味着 |
|------|------|--------|
| **Intent interface** | 律师通过编辑标题、purpose、关联 snippets 来表达论证意图 | 律师的"想法"被结构化编码 |
| **Generation boundary** | LLM 在每个 SubArgument 范围内生成 1-3 句，只引用该 SubArgument 下的 snippets | AI 的输出被结构约束 |
| **Provenance anchor** | 每个生成句子的 provenance 链经过 SubArgument 节点（Sentence → SubArg → Snippet → BBox） | 溯源路径有中间语义节点 |

**关键推论：** 编辑一个 SubArgument 同时改变了 (1) generation semantics, (2) generation scope, (3) provenance path——**且三者自动保持一致（three-way automatic consistency）**。这是我们的核心 novelty。

对比现有工具的迭代机制：

| 工具 | 编辑操作 | Intent 变化 | Generation 变化 | Provenance 变化 | 三者一致？ |
|------|---------|------------|----------------|----------------|-----------|
| InkSync | 编辑文本 | ✗ 不表达 intent | ✗ 不触发重写 | Levenshtein repair | ❌ 脱耦 |
| ABScribe | 切换 prompt | ✓ 变化 | ✓ 重写 | 完全丢失 | ❌ 脱耦 |
| VISAR | 编辑 goal | ✓ 变化 | ✓ 全量重写 | 无 provenance | ❌ 脱耦 |
| Semantic Commit | 编辑 intent spec | ✓ 变化 | ✗ 不涉及 | ✗ 不涉及 | ❌ 只有一维 |
| **[SystemName]** | **编辑 SubArgument** | **✓** | **✓ 增量重写** | **✓ 自动保持** | **✅ 三重一致** |

### 1.7 迭代重写

律师不满意生成的文本时：
- **不是**去改文本（改了 provenance 会断）
- **而是**去改结构（修改 SubArgument 描述、添加新 SubArgument、调整 snippet 映射）
- 系统基于新结构重写，provenance 通过结构保持完整

**Running Example：** Maria 读到生成的段落过度强调比赛成绩而非训练方法论 → 在 Writing Tree 中编辑 SubArgument 从 "Competition Achievements" 改为 "Development of Integrated Training System"，添加新 SubArgument "Adoption by Other Programs" → 系统基于新结构重写段落 → Maria 通过 provenance 确认新文本正确引用了方法论 snippets 而非比赛结果 snippets。

**为什么这是 novel：** 现有 AI writing 工具的迭代要么是直接编辑文本（InkSync），要么是 prompt 级调整（ABScribe）。两者都不保留结构化的 provenance。我们的迭代是 structure-level 的——改结构触发重写，provenance 通过结构天然保持完整。

### 1.8 标题

**★ 推荐：** *"Structure-Mediated Authoring: Human-AI Collaborative Legal Writing Through Argument Assembly"*

- "Structure-Mediated" 精确传达核心理念：结构是中介（mediate），不是辅助（assist）
- "Through Argument Assembly" 指向具体机制
- 副标题暗示领域但不限制 generalizability

### 1.9 研究问题（三个）

- **RQ1 (Construction → Verification):** 相比 read-only AI mappings，通过结构构建来控制生成是否提高错误检测率和论证理解？
- **RQ2 (Verification via Structure):** 通过论证结构进行的溯源（structural provenance）是否比 flat provenance 更有效支持律师验证？
- **RQ3 (Iteration, 探索性):** 律师在迭代中如何使用结构修改来改进生成文本？

---

## 二、贡献排序（v7.0，只有两个）

| # | 贡献 | 内容 | 类型 |
|---|------|------|------|
| **C1** | **Structure-Mediated Authoring** | 论证结构同时作为 generation constraint、verification path、iteration anchor 的设计理念。Formative study 论证其必要性（律师需要结构来控制和验证生成），user study 验证其有效性（结构构建提高错误检测率和论证理解） | **Conceptual + Empirical** |
| **C2** | **Structure-Preserving Provenance** | 通过论证结构层级的跨粒度溯源引擎（Sentence → SubArgument → Snippet → BBox），支持多轮结构修改后 provenance 不断裂。Technical evaluation 验证溯源准确性 | **Technical** |

**v6.8 → v7.0 贡献变化：**

v6.8 有三个贡献（problem identification + 三个 novel interactions + 实证）。v7.0 合并为两个更有力的贡献。所有原先单独 claim 的组件（五层模型、entity tracking、qualification checklist、dual-mode、Writing Tree visualization）作为 C1 设计理念的 instantiation details 出现在 System Design 中，不单独 claim。

**为什么只要两个贡献：**
1. C1 是 conceptual + empirical 的复合贡献，本身就很重——包含了设计理念的提出（formative study）和验证（user study）
2. C2 是独立可评估的 technical 贡献——有 precision/recall 指标
3. UIST 论文两个强贡献 > 三个弱贡献

---

## 三、Introduction（论文 Section 1，~900w）

### P1 — AI Writing 的主流协作模式 (~150w)

**开头句：** *"AI-powered writing tools increasingly adopt a common collaboration pattern: AI generates content or structure, and humans verify the output."*

要点：列举 generate-then-verify 在各场景中的应用——Notion AI, ChatGPT, Copilot, 以及学术工具 VISAR, Sensecape。指出这个模式在创意写作中有效。

**转折句：** *"However, a growing body of evidence-based professional writing — legal petitions, medical reports, financial audits — demands a fundamentally different form of human-AI collaboration, one where every generated claim must be traceable to a specific piece of source evidence."*

### P2 — 失效模式 1 + 2：审查不足与结构缺失 (~180w)

**要点（合并 v6.8 的 P2 和 P3）：**

(1) **Automation bias：** 律师倾向于接受看起来合理的 AI 映射（Parasuraman & Riley, 1997）。我们的 formative study 确认了这一点——律师在 probe task 中只发现了 X/5 个预埋错误。

(2) **缺乏结构性连接（v7.0 新增角度）：** 更深层的问题是——generate-then-verify 在生成和验证之间没有共享的中间结构。AI 生成一段文本，律师只能逐句阅读判断是否正确。律师无法回答"这个证据为什么放在这里"或"如果我想强调不同角度，应该改什么"。

**关键句：** *"The deeper issue is structural: generate-then-verify provides no shared intermediate representation between AI generation and human verification. Lawyers cannot trace why a particular piece of evidence was used, cannot assess whether alternative evidence would strengthen the argument, and cannot modify the generation strategy without starting over."*

### P3 — 核心洞察：论证结构的三重角色 (~180w)

**[v7.0 核心段落]**

**要点：** 我们的 formative study 发现论证结构可以同时解决生成和验证问题。当律师手动构建证据到论点的映射时：

- **构建即验证（mapping as verification）：** 决定把一条证据放在哪个论点下，本身就需要理解这条证据说了什么、是否支持该论点——这正是验证要求的判断。
- **结构即约束（structure as constraint）：** 律师构建的结构直接告诉 AI 写什么、引用什么、怎么组织——不再需要猜测。
- **结构即锚点（structure as anchor）：** 当律师不满意生成文本时，修改结构（而非文本）即可触发重写，provenance 通过结构天然保持完整。

**关键句：** *"We identify a key insight: argument structure can simultaneously serve as generation constraint, verification path, and iteration anchor — forming a closed loop we call structure-mediated authoring."*

### P4 — 系统实例化 (~120w)

*"We instantiate this design concept in [SystemName], a system for EB-1A immigration petition writing. Lawyers construct argument structures by dragging evidence snippets from source documents into a hierarchical argument tree. The system generates petition text constrained by this structure, with every sentence traceable through the argument hierarchy back to specific locations in source documents. When lawyers wish to revise the generated text, they modify the argument structure — editing sub-arguments, adding evidence, or reorganizing mappings — and the system regenerates while preserving provenance integrity."*

### P5 — Contributions (~150w)

*"We make two contributions:*

*1. **Structure-Mediated Authoring**, a design concept in which argument structure simultaneously serves as generation constraint, verification path, and iteration anchor. Through formative interviews with immigration lawyers, we establish the necessity of this approach — demonstrating that generate-then-verify fails for evidence-based professional writing — and through a within-subjects user study with N lawyers, we provide empirical evidence that constructing argument structure improves error detection rates and deepens argument comprehension compared to reviewing AI-generated mappings (Section 3, 6).*

*2. **Structure-Preserving Provenance**, a cross-granularity provenance engine that traces generated sentences through the argument hierarchy (Sentence → SubArgument → Snippet → BBox) and maintains provenance integrity across iterative structure modifications. A technical evaluation demonstrates [precision/recall metrics] (Section 5.4, 6.1)."*

### P6 — 结构导读 (~80w)

*"We first provide background on EB-1A petitions (Section 2), report our formative study (Section 3), review related work (Section 4), describe [SystemName]'s design organized around the four stages of the structure-mediated authoring loop (Section 5), present our evaluation including a technical provenance assessment and a user study (Section 6), and discuss implications and limitations (Section 7)."*

---

## 四、Background（论文 Section 2，~300w）

### 2.1 EB-1A Petition 简介

EB-1A（Extraordinary Ability）是美国移民法中为具有杰出才能的个人设立的签证类别。申请人需要满足 8 C.F.R. §204.5(h)(3) 中列出的 10 个标准中的至少 3 个（Awards, Membership, Published Material, Judging, Original Contributions, Scholarly Articles, Leading Role, High Salary, Exhibition, Commercial Success）。

Petition letter 是申请的核心文件——一封由律师撰写的论证信，将申请人的证据材料（Exhibits）组织为满足法律标准的论证。

### 2.2 为什么 EB-1A 是理想的研究场景

- **多实体：** 涉及受益人、推荐人、合作者——主体归属是核心挑战
- **证据约束：** 所有论述必须基于已有 Exhibits，不能编造
- **结构化标准：** 法定标准提供了明确的组织框架
- **高风险：** 错误可能导致拒签

### 2.3 Running Example

Attorney Maria 为 Dr. Yaruo Qu（体育教练/健身领域专家）准备 EB-1A petition。Dr. Qu 的材料包括 52 份 Exhibits：推荐信、媒体报道、奖项证书、专利文件、合同等。Maria 需要从中选取 3-5 个法律标准进行论证。

---

## 五、Formative Study（论文 Section 3，~900w）

### 5.1 方法

**参与者：** 3-5 名执业移民律师（有 EB-1A 经验）
**时长：** 60-75 分钟半结构化访谈
**分析：** Thematic analysis (Braun & Clarke, 2006)

### 5.2 访谈协议

**Part A — 当前工作流 (15min)**

- 你写一份 EB-1A petition 的典型流程是什么？
- 你怎么决定哪些证据放在哪个标准下？
- 当多个人的成就出现在同一份材料中时，你怎么处理？

**Part B — Probe Task: 审查 AI 映射 (20min)**

给律师展示一个 AI 预生成的 evidence-to-standard mapping（基于真实案例简化），让他们审查并标记错误。

**预埋错误（5 个）：**

| # | 错误类型 | 具体例子 | 设计目的 |
|---|---------|---------|---------|
| 1 | 错误标准 | 引用数据映射到 "Original Contributions" 而非 "Scholarly Articles" | 测试标准理解 |
| 2 | 错误标准 | 领导力评价映射到 "Judging" 而非 "Leading Role" | 测试语义重叠辨别 |
| 3 | 遗漏 | 关键技术描述未被提取 | 测试完整性判断 |
| 4 | 主体混淆 | Dr. Wang 的引用数据放到 Dr. Chen 的 "Scholarly Articles" 下 | **测试结构缺失下的主体错误检测** |
| 5 | 主体混淆 | 推荐信中对合作者的评价被用于受益人的论证 | **测试多实体辨别** |

**核心观测：** 律师能否在 read-only 审查模式下发现这些错误？特别是 #4 和 #5 的主体混淆。

**Part C — 结构构建观察 (20min)**

给同一批律师提供打印的证据卡片和标准卡片，让他们用手动方式重新组织映射。观察他们是否自发创建中间结构（类似 SubArgument），以及构建过程中是否自发发现了 Part B 中遗漏的错误。

### 5.3 预期发现（Findings）

| Finding | 内容 | 支撑闭环的哪个环节 |
|---------|------|-------------------|
| **F1** | 律师在 read-only 审查中遗漏了大部分预埋错误（特别是主体混淆），表现出 automation bias | 动机：为什么需要结构 |
| **F2** | 律师在手动构建映射时自发发现了 Part B 中遗漏的错误——构建行为迫使深入阅读原文 | 支撑 ① Construction = Verification |
| **F3** | 律师在构建过程中自发创建了中间分组（如"这几条都是说他的教学方法"），类似 SubArgument | 支撑 ② Structure as constraint |
| **F4** | 律师表达了对"改了文本但不知道有没有改坏引用"的担忧——希望修改能被约束 | 支撑 ④ Structure as iteration anchor |

### 5.4 设计原则（Design Principles）

| DP | 内容 | 来源 | 系统实现 |
|----|------|------|---------|
| **DP1** | 律师需要通过构建映射来控制和验证 AI 生成 | F1 + F2 | 闭环 Stage 1: Structure Construction |
| **DP2** | 生成的文本必须可通过结构回溯到源文档物理位置 | F2 + F4 | 闭环 Stage 3: Structure-Guided Verification |
| **DP3** | 修改应在结构层面进行，保持 provenance 完整性 | F4 | 闭环 Stage 4: Structure Refinement |

**注意 v7.0 的简化：** DP 从 v6.8 的 5 个（DP1-DP5）精简为 3 个，每个直接对应闭环的一个关键环节。五层模型、entity tracking、dual-mode 不再需要单独的 DP justification——它们是实现 DP1-3 过程中的设计决策，在 System Design 中说明即可。

### 5.5 桥接段

*"These findings establish that (1) generate-then-verify fails for evidence-based legal writing, (2) the act of constructing mappings inherently performs verification, and (3) lawyers need structural mediation between their intent and AI generation. We now describe [SystemName], which instantiates these principles as a closed-loop structure-mediated authoring system."*

---

## 六、Related Work（论文 Section 4，~1100w）

### 4.1 AI-Assisted Writing and Provenance (~350w)

**InkSync (UIST'24)：** Edit-level provenance，tracks which parts of text were AI vs human written。Flat provenance — sentence 直接链接到 edit history，没有中间论证结构。迭代通过 character-level text editing 实现，provenance 用 Levenshtein distance 修复——这是 post-hoc repair，容易断裂。

**HaLLMark (CHI'24)：** Authorship-level provenance，区分 AI/human contribution。同样是 flat provenance。

**ABScribe (CHI'24)：** A/B text variation，让用户在不同 AI 生成版本间切换。迭代通过 prompt 变体实现，切换版本时所有 provenance 信息丢失。没有结构层面的修改能力。

**CorpusStudio (CHI'25)：** Corpus-level authoring with AI。

**Ai.llude (DIS'24)：** 研究 rewriting AI-generated text 对 creative ownership 的影响。发现 intermediate suggestions 鼓励更多 rewriting。关注 text-level 迭代，无结构概念。

**差异化关键句：** *"Prior provenance systems track **who** wrote what (HaLLMark) or **how** text was edited (InkSync). [SystemName] tracks **why** — through the argument structure that motivated each sentence. This structural provenance enables a form of iteration absent from prior work: lawyers modify the argument structure rather than the text, and the system regenerates with provenance integrity preserved — not through post-hoc repair, but structurally, because generation is bounded by the same structure that anchors provenance."*

### 4.2 Argument Construction and Sensemaking (~350w)

**Sensecape (UIST'23)：** Multi-level sensemaking from web search。核心差异：Sensecape 的结构是 flexible（用户自定义 concepts），用于组织信息后即可丢弃。我们的结构 encodes domain semantics（legal standards, arguments）并且**运行生成和验证**。Sensecape 编辑结构不会触发文本重写，没有 entity tracking 和物理溯源。

**VISAR (UIST'23)：** Visual programming for argumentative writing。Top-down：用户先定论点再填内容。我们是 bottom-up：证据已存在，律师构建结构围绕证据。VISAR 修改 writing goal 后需要重新生成整个 draft——没有 SubArgument-level 增量重写，也没有 provenance 链。

**Graphologue (UIST'23)：** Diagram-based sensemaking。

**GLITTER (UIST'25)：**

**关键差异化：**

*"Sensecape and VISAR use structure as a **generation tool** — it helps organize thoughts and guide AI output, but plays no role in verification or iteration. In [SystemName], structure is **infrastructure**: generation is constrained by it, verification routes through it, and iteration operates on it. This triple role is what makes structure-mediated authoring a closed loop rather than a pipeline."*

### 4.3 Human-AI Reliance and Appropriate Trust (~200w)

**Parasuraman & Riley (1997)：** Automation bias。

**Bansal et al. (CHI'21)：** AI explanations 增加接受率但不分对错——explanations 没有促进 complementary performance。

**Buçinca et al. (CSCW'21)：** Cognitive forcing functions 减少 AI 过度依赖。

**连接：** *"Our approach can be understood as a domain-specific cognitive forcing function (Buçinca et al., 2021): by requiring lawyers to construct the argument structure before generation, we ensure engagement with the evidence that passive review of AI output would not demand. Crucially, this engagement is not an artificial friction — it produces the structure that the system needs for constrained generation and structural provenance."*

### 4.4 Semantic Editing and Intent-Level Iteration (~200w)

**[v7.0 新增 subsection]**

**Semantic Commit (UIST'25)：** 最接近的相关工作。它做"编辑 intent specification → 检测语义冲突 → 级联更新"，概念上与我们的"编辑结构 → 触发重写"有表面相似。**关键差异：** Semantic Commit 处理 flat documents（Cursor Rules, game design docs），用 knowledge graph 做冲突检测，不涉及 constrained generation 或 provenance。我们的系统是 hierarchical argument structure → SubArgument-level 增量重写 → provenance 自动保持完整。两者解决不同层面的问题——Semantic Commit 关注 intent consistency，我们关注 intent-generation-provenance 的耦合一致性。

**"Bridging Gulfs in UI Generation through Semantic Guidance"（2025 preprint）：** 做 semantic diff → targeted UI code regeneration。概念上最接近——"编辑语义层 → 增量重写"。但它是 UI generation（代码），不是 evidence-based writing，没有 provenance 链回溯到源文档。

*"Both Semantic Commit and semantic-guided UI generation share our insight that editing at a semantic level above the output enables more controlled iteration. However, neither addresses the specific challenge of evidence-based writing: maintaining traceable provenance chains from generated text through argument structure back to physical source locations across iterative modifications."*

### 4.5 Legal Writing and Domain-Specific AI (~200w)

**Swoopes et al.：** 22 名法律专业人士的访谈，发现 cross-document relationships 和 AI-resilient interaction 的需求。Corroborating evidence。

**Clearbrief / QuickFiling / Visalaw：** 商业工具，文档级引用链接，无结构化论证。

**差异化矩阵（精简版）：**

| | Structure role | Provenance type | Entity tracking | Iteration mechanism |
|---|---|---|---|---|
| Sensecape | Organization tool | None | ✗ | Restructure concepts |
| VISAR | Generation guide | None | ✗ | Edit visual program |
| InkSync | None | Flat (edit-level) | ✗ | Edit text |
| HaLLMark | None | Flat (authorship) | ✗ | Edit text |
| **[SystemName]** | **Infrastructure** (gen + verify + iterate) | **Structural** (→ BBox) | **✓** | **Edit structure → regenerate** |

---

## 七、System Design（论文 Section 5，~2400w）

### 组织原则（v7.0 关键变化）

**不再按组件分 section**（Document Viewer, Snippet Pool, Writing Tree 各一节）。**按闭环的四个阶段分**，每个 section 都在讲同一个故事（结构的不同角色）：

```
5.1 Overview：Structure-Mediated Authoring Loop（配闭环图 Figure 1）
5.2 Stage 1 — Structure Construction：律师构建论证结构
5.3 Stage 2 — Structure-Constrained Generation：AI 在结构内生成
5.4 Stage 3 — Structure-Guided Verification：通过结构的溯源
5.5 Stage 4 — Structure Refinement：编辑结构触发重写
```

Subject conflict detection 放在 5.2（一段带过），qualification checklist 在 5.5 或 Discussion（一段带过）。五层模型在 5.1 的数据模型小节中描述，不单独 claim。

Running Example: Attorney Maria + Dr. Yaruo Qu（体育教练），贯穿所有 Stage。

### 5.1 Overview (~300w)

**5.1.1 Design Concept**

Structure-Mediated Authoring：律师构建的论证结构在系统中扮演三重角色——

| 角色 | 定义 | 闭环阶段 |
|------|------|---------|
| Generation constraint | 结构告诉 AI 写什么、引用什么、怎么组织 | Stage 2 |
| Verification path | 律师通过结构回溯生成文本的证据来源 | Stage 3 |
| Iteration anchor | 律师修改结构（非文本）触发重写，provenance 保持完整 | Stage 4 |

配 **Figure 1**：闭环图（如 1.3 所示），四个阶段 + 中心的论证结构。

**5.1.2 Data Model**

系统使用层级数据模型组织证据和论点。**不再 claim 层数本身是贡献**——只作为实现细节描述：

```
Standard (法定标准，如 "Original Contributions")
  └── Argument (论证主题，绑定主体实体，如 "Dr. Qu's Training Methodology")
        └── SubArgument (论证维度，如 "Development of Integrated System")
              └── Snippet (证据片段，带 BBox 坐标)
                    └── Exhibit (源文档 PDF)
```

**一段 rationale：** *"This hierarchy emerged from our formative observations (F3) that lawyers naturally group evidence by argumentative facet. The intermediate layers (Argument, SubArgument) serve a dual purpose: they constrain generation by defining the scope and subject of each text segment, and they enable structural provenance by providing traceable nodes between generated sentences and source evidence."*

**5.1.3 System Architecture**

```
Frontend (React 18 + TypeScript + Tailwind)
  ├── Verify Mode: DocumentViewer | EvidenceCardPool | ArgumentGraph | Standards
  └── Write Mode:  EvidenceCards+PDF | ArgumentGraph | LetterPanel

Backend (FastAPI + Python)
  ├── OCR (DeepSeek) → unified_extractor → argument_composer
  ├── subargument_generator → petition_writer_v3
  └── provenance_engine + snippet_registry
```

### 5.2 Stage 1: Structure Construction (~600w)

**对应 DP1，支撑 C1 的 "generation constraint" + "verification" 角色**

**5.2.1 Evidence Mapping View（Verify 模式）**

四栏布局。律师在 EvidenceCardPool 中看到 AI 提取的 snippet 卡片（按 Exhibit 分组），每张卡片显示文本摘要、主体标注（如 "Yaruo Qu"）、证据类型标签。

律师通过拖拽将 snippet 卡片放入 Argument 节点。系统即时更新 ArgumentGraph（Writing Tree）。

**Running Example：** Maria 看到一张 snippet 卡片 "Yaruo Qu, founder of Venus Weightlifting Club, made a speech at the Seminar..." 标注为 "Yaruo Qu / media_coverage"。她将其拖入 "Ms. Yaruo Qu's Membership in Shanghai Fitness Bodybuilding Association" argument。

**5.2.2 Bidirectional Focus**

点击任何元素，所有面板高亮关联项。点击 snippet → PDF 高亮 bbox；点击 Argument → 所有关联 snippets 高亮 + PDF 跳转。Focus Mode：选中某个 Standard → dim 掉无关 snippets。

**5.2.3 Subject Conflict Detection（一段带过）**

每个 Argument 绑定一个主体实体。拖拽时系统检查 snippet 的主体是否一致。不一致时弹出提示，律师可 override / cancel / merge entities。

*"This mechanism directly addresses the subject attribution errors identified in our formative study (F1): by checking entity consistency at the moment of construction, errors that would otherwise remain hidden until the final petition text is reviewed can be surfaced immediately."*

**不需要长篇大论**——subject conflict detection 是 Stage 1 的一个 feature，不是独立贡献。

### 5.3 Stage 2: Structure-Constrained Generation (~400w)

**对应 C1 的 "generation constraint" 角色**

律师完成结构构建后，触发文本生成。**关键设计决策：** AI 不是自由生成——它在律师构建的结构内生成。

**Constrained Writing Pipeline：**

1. 系统遍历律师映射到每个 Standard 的 Arguments
2. 对每个 Argument，遍历其 SubArguments
3. 对每个 SubArgument，将其关联的 Snippets 作为生成上下文
4. LLM 在 SubArgument 的范围内生成 1-3 个句子，输出 structured JSON：

```json
{
  "sentences": [
    {
      "text": "Dr. Qu developed a comprehensive athletic training methodology...",
      "snippet_ids": ["snp_A1_p2_b3"],
      "subargument_id": "subarg_001",
      "argument_id": "arg_001",
      "exhibit_refs": ["Exhibit A"]
    }
  ]
}
```

5. 系统按 Standard → Argument → SubArgument 顺序组装段落

**为什么 structure-constrained 而非 free generation：**

*"Free generation would sever the connection between the lawyer's structural decisions and the output text, undermining the verification and iteration stages of the loop. By constraining generation to the lawyer's structure, every sentence inherits a traceable lineage: it was generated because of a specific SubArgument, which was created because the lawyer placed specific Snippets there, which came from specific locations in source documents."*

### 5.4 Stage 3: Structure-Guided Verification (~600w)

**对应 DP2 和 C2 (Structure-Preserving Provenance)**

**这是 C2 的核心 section。**

**5.4.1 Structural Provenance（核心创新）**

现有 provenance 是 flat 的：sentence → source（InkSync, HaLLMark）。我们的 provenance 是 structural 的——通过论证结构层级：

```
Sentence → SubArgument → Snippet → BBox → Document
```

每一层都是可交互的节点。律师在 LetterPanel 中点击一个句子 → Writing Tree 高亮对应的 SubArgument 节点 → EvidenceCardPool 高亮对应的 Snippet → DocumentViewer 跳转到 bbox 位置并高亮。

**5.4.2 Provenance Pipeline（五步）**

| Step | 输入 | 输出 | 实现 |
|------|------|------|------|
| 1. Dual Indexing | PDF | text + bbox 坐标 | DeepSeek OCR |
| 2. Snippet Extraction | OCR text | snippets（继承 bbox） | unified_extractor.py |
| 3. Constrained Generation | 律师的结构 + snippets | sentences with snippet_ids | petition_writer_v3.py |
| 4. Hybrid Retrieval | sentence + snippet_ids | resolved provenance links | provenance_engine.py |
| 5. BBox Highlight | snippet → bbox | PDF 高亮 | DocumentViewer + BBoxOverlay |

**Step 4 细节：**
- **显式标注优先：** 生成时 LLM 输出的 snippet_ids（confidence 1.0）
- **语义 fallback：** 如果显式标注缺失，用文本相似度匹配（confidence × 0.7）
- **设计理念：** "Deterministic anchor + probabilistic fallback"——高风险法律写作不能纯靠语义匹配

**5.4.3 为什么 Structural Provenance 优于 Flat Provenance**

*"Flat provenance answers 'which source supports this sentence?' Structural provenance additionally answers 'why was this source used?' — because the lawyer placed it in a specific SubArgument with a specific argumentative purpose. This additional layer of explanation supports deeper verification: a lawyer can assess not just whether the source is correct, but whether the argumentative reasoning connecting source to claim is sound."*

**配 Figure：** Provenance 链示意图，标注每一层的交互。

### 5.5 Stage 4: Structure Refinement (~600w)

**对应 DP3 和 C1 的 "iteration anchor" 角色。这是系统最核心的交互创新。**

**5.5.1 核心洞察：SubArgument 是 intent、generation、provenance 的耦合点**

现有 AI writing 工具的迭代方式都打破了 intent-generation-provenance 的一致性：

| 工具 | 迭代方式 | 问题 |
|------|---------|------|
| InkSync (UIST'24) | 编辑文本（character-level） | Provenance 需要 Levenshtein distance 修复，容易断裂 |
| ABScribe (CHI'24) | 切换 prompt 变体 | 无结构，无 provenance |
| VISAR (UIST'23) | 修改 writing goal | 整个 draft 重写，无增量能力，无 provenance |
| Semantic Commit (UIST'25) | 编辑 intent spec → 冲突检测 | Flat document，无层级结构，无 generation-provenance 链 |

**我们的关键设计：** SubArgument 同时是三个东西——

1. **律师表达 argumentative intent 的接口**（标题、purpose、关联的 snippets）
2. **Constrained generation 的边界**（LLM 在每个 SubArgument 范围内生成 1-3 句，只引用该 SubArgument 下的 snippets）
3. **Provenance 链的中间节点**（Sentence → SubArgument → Snippet → BBox）

**因此，编辑一个 SubArgument 同时改变了生成语义、生成范围和 provenance 路径——而且三者自动保持一致。** 这是现有工具无法做到的。

**5.5.2 SubArgument-Level 增量重写**

律师不满意生成文本时，**不改文本，改结构**：

- **编辑 SubArgument 标题/purpose：** 改变论证角度（如 "Competition Achievements" → "Development of Integrated Training System"）
- **添加新 SubArgument：** 引入新的论证维度
- **添加/移除 Snippet 映射：** 增减证据
- **重新组织层级：** 调整 SubArgument 与 Argument 的从属关系

系统只重写受影响的 SubArgument 对应的句子，而非整个 petition。

**技术实现：** `petition_writer_v3` 已按 SubArgument 分块生成（每个 SubArgument 对应 `subargument_paragraphs` 中的一项）。前端通过 `provenanceIndex.bySubArgument` 索引定位受影响的句子范围，调用后端 API 只重写该 SubArgument 的段落，替换 LetterPanel 中对应句子。未修改的 SubArgument 及其句子保持不变。

**5.5.3 Running Example**

*Maria reads the generated paragraph for "Original Contributions" and finds it overemphasizes Dr. Qu's competition results rather than her training methodology. In the Writing Tree, Maria:*

1. *Renames SubArgument from "Competition Achievements" to "Development of Integrated Training System"*
2. *Adds a new SubArgument "Adoption by Other Training Programs" and drags in two relevant snippets from recommendation letters*
3. *Removes three snippets about competition scores from the original SubArgument*
4. *Clicks "Regenerate" on this Argument*

*The system regenerates only the affected sentences. Maria verifies through provenance: clicking each sentence in the new paragraph highlights the corresponding SubArgument in the Writing Tree and the source snippet in the Document Viewer — confirming that the text now draws from methodology-related evidence rather than competition results. The sentences from other SubArguments remain unchanged.*

**5.5.4 Provenance 在迭代中的自动一致性**

*"Because generation is constrained by SubArgument boundaries, structural modifications produce predictable, scoped changes in the generated text. Adding a SubArgument adds sentences; removing one removes sentences; editing one changes only the corresponding sentences. Crucially, provenance integrity is maintained not through post-hoc repair (as in InkSync's Levenshtein-based alignment) but structurally: each regenerated sentence inherits its SubArgument's snippet bindings, and the provenance chain (Sentence → SubArgument → Snippet → BBox) is rebuilt from the structure itself. This architectural guarantee contrasts with free-text editing, where any change can silently invalidate provenance links, and with prompt-based iteration (ABScribe), where switching variations discards all provenance information."*

---

## 八、Evaluation（论文 Section 6，~2500w）

### 6.1 Technical Evaluation: Provenance Accuracy (~500w)

**独立于 user study，验证 C2。**

**方法：**
- 从 Dr. Yaruo Qu 案例生成的 petition 中随机抽取 50 个句子
- 两名研究者独立标注正确的 snippet 来源（建立 gold standard）
- Inter-rater reliability (Cohen's κ)

**指标：**

| 指标 | 定义 |
|------|------|
| Precision@3 | Top-3 retrieved snippets 中正确的比例 |
| Recall | 正确 snippet 出现在 retrieval 结果中的比例 |
| MRR | Mean Reciprocal Rank |
| BBox IoU | 溯源到的 BBox 与 ground truth BBox 的交并比 |
| **迭代稳定性** | 结构修改后重新生成，provenance 正确率是否下降 |

**额外维度——迭代后稳定性（v7.0 新增）：**
- 对 10 个 SubArgument 进行结构修改（编辑标题、添加 snippet、删除 snippet）
- 重新生成后重复上述评估
- 对比迭代前后的 provenance accuracy

### 6.2 User Study (~2000w)

**6.2.1 设计**

**类型：** Within-subjects
**参与者：** 6-8 名执业移民律师（有 EB-1A 经验）
**案例：** 两个不同的 EB-1A 案件（平衡难度），各预埋错误

**条件：**

| | Condition A (Structure-Mediated) | Condition B (Read-Only + Flat Provenance) |
|---|---|---|
| 结构构建 | ✓ 律师拖拽构建映射 | ✗ AI 预生成的映射，只读 |
| 文本生成 | 基于律师的结构生成 | 基于 AI 的映射生成（律师看到同样的最终文本） |
| Provenance | Structural (sentence → subarg → snippet → bbox) | Flat (sentence → snippet，无中间结构) |
| 迭代 | ✓ 修改结构 → 重新生成 | ✗ 只能直接编辑文本 |
| 预埋错误 | 包含 subject attribution error | 包含 subject attribution error |

**关键设计决策——Condition B 给 flat provenance：**

v6.8 的 Condition B 完全无 provenance，但这样对比不公平（人家会说你赢只是因为有 provenance）。v7.0 给 Condition B flat provenance（sentence → snippet 直连），这样对比的是 **structural provenance vs flat provenance**，更有说服力。

**平衡：**
- 案件-条件分配 counterbalanced
- 两组信息量完全相同（同样的 snippets, arguments, 最终文本）
- 唯一差异：交互方式（构建 vs 审查）和 provenance 类型（structural vs flat）

**6.2.2 预埋错误**

每个案件预埋 5 个错误：

| # | 类型 | 设计目的 |
|---|------|---------|
| 1 | 错误标准映射 | 基线错误检测能力 |
| 2 | 遗漏 | 完整性判断 |
| 3 | 冗余 | 注意力测试 |
| 4 | 主体混淆 | **核心：结构构建 vs 审查的差异** |
| 5 | 主体混淆 | **核心：structural vs flat provenance 的差异** |

**6.2.3 流程**

1. 培训（10min）：系统功能介绍
2. Condition A（30min）：使用完整系统完成一个案件
3. Condition B（30min）：使用 read-only 系统完成另一个案件
4. Post-task interview（15min）

**6.2.4 测量指标**

**主要指标（RQ1）：**

| 指标 | 定义 |
|------|------|
| Error detection rate | 发现的预埋错误比例（总体 + 按类型） |
| Subject attribution error detection rate | 专门统计主体混淆错误的检测率 |
| Argument comprehension | Post-task recall：律师能否准确描述哪个证据支持哪个论点的哪个层面 |

**次要指标（RQ2）：**

| 指标 | 定义 |
|------|------|
| Provenance usage frequency | 律师使用溯源功能的次数和深度 |
| Provenance traversal depth | 律师是否追溯到 snippet 层？到 bbox 层？ |
| Verification confidence | 7-point Likert：你对生成文本正确性的信心 |

**探索性指标（RQ3）：**

| 指标 | 定义 |
|------|------|
| Iteration count | Condition A 中律师修改结构的次数 |
| Modification types | 编辑 SubArgument / 添加 snippet / 删除 snippet 的分布 |
| Satisfaction with regenerated text | 7-point Likert |

**其他：** NASA-TLX (Hart & Staveland, 1988), 任务完成时间, 系统可用性

**6.2.5 归因逻辑**

两组看到的信息量完全相同（同样的 evidence, arguments, 生成文本）。差异在：
- **交互方式：** 构建 vs 审查 → 如果 Condition A 错误检测率更高，归因于构建行为迫使深入理解
- **Provenance 类型：** structural vs flat → 如果 Condition A provenance 使用更深入，归因于结构层级提供了更有意义的验证路径
- **迭代能力：** Condition A 有结构迭代 → RQ3 的探索性数据

**6.2.6 分析方法**

- 错误检测率：Wilcoxon signed-rank test（小样本）
- Likert 量表：Wilcoxon signed-rank test
- RQ3 行为数据：描述统计 + 质性主题分析
- Post-task interview：Thematic analysis (Braun & Clarke, 2006)

---

## 九、Discussion（论文 Section 7，~600w）

### 7.1 Structure as Infrastructure (~200w)

**核心 discussion point：** 我们的发现表明，在 evidence-based professional writing 中，论证结构不应只是组织工具——它应该是系统的基础设施。Sensecape 和 VISAR 的结构是用后即弃的（组织好想法后，结构不参与后续生成和验证）。我们的结构贯穿全程。

**Generalization：** 哪些其他领域的写作需要 structure-mediated authoring？
- **Medical case reports：** 多种检测结果 → 诊断论证 → 治疗建议
- **Financial audits：** 多公司数据 → 合规论证 → 审计意见
- **Grant proposals：** 多个 preliminary results → significance 论证

共同特征：(1) 证据是固定的（不能编造），(2) 论证有结构化标准，(3) 多实体/多来源，(4) 高风险

### 7.2 Why Not Just Better AI? (~150w)

三个理由：
1. **Accountability：** 法律文件需要律师签字负责。即使 AI 的映射 100% 正确，律师仍需理解每个决策的理由
2. **Case comprehension：** 构建结构的过程是律师理解案件的过程。跳过构建 = 跳过理解
3. **Trust from engagement：** F2 显示构建行为产生了审查行为不能产生的理解深度

### 7.3 Limitations (~250w)

1. **参与者数量：** 6-8 人，限制统计检验力
2. **单一领域：** 只在 EB-1A 上验证，generalizability 需要跨领域验证
3. **OCR 依赖：** Provenance 质量受 OCR 准确性限制
4. **学习曲线：** 结构构建比审查需要更多时间和认知投入——对于简单案件可能 overkill
5. **LLM 依赖：** Constrained generation 的质量受 LLM 能力限制
6. **迭代延迟：** 每次重新生成需要 API 调用时间

---

## 十、论文结构总览（~9000w）

| Section | 标题 | 字数 | 核心内容 |
|---------|------|------|---------|
| 1 | **Introduction** | ~900 | gen-then-verify 失效 → 核心洞察（结构三重角色）→ contributions |
| 2 | **Background** | ~300 | EB-1A 简介 + running example |
| 3 | **Formative Study** | ~900 | Probe task + 手动构建观察 → F1-F4 + DP1-3 → 桥接 |
| 4 | **Related Work** | ~1300 | AI writing + provenance / Argument construction / Human-AI reliance / **Semantic editing (v7.1 新增)** / Legal AI |
| 5 | **System Design** | ~2500 | **按闭环组织**：5.1 Overview → 5.2 Construction → 5.3 Generation → 5.4 Verification → 5.5 Refinement (expanded) |
| 6 | **Evaluation** | ~2500 | 6.1 Technical eval (provenance accuracy + 迭代稳定性) → 6.2 User study (within-subjects) |
| 7 | **Discussion** | ~600 | Structure as infrastructure + Why not better AI + Limitations |
| 8 | **Conclusion** | ~300 | 总结 + future work |
| | **Total** | **~9300** | |

**v7.0 → v7.1 字数变化：** Related Work +200w（新增 Section 4.4 Semantic Editing）；System Design Stage 4 +100w（扩展对比表和技术实现）。净增 ~300w，仍在 UIST 论文 10k 字范围内。

---

## 十一、Abstract（v7.1）

*AI-assisted writing tools typically follow a "generate-then-verify" pattern: AI produces content or structure, and humans review the output. Through formative interviews with immigration lawyers — including a probe task with planted errors — we find this pattern fails for evidence-based professional writing: lawyers exhibit automation bias when reviewing AI-generated evidence mappings, and the lack of structural connection between generation and verification prevents effective scrutiny.*

*We propose structure-mediated authoring, a design concept in which argument structure simultaneously serves as generation constraint, verification path, and iteration anchor — forming a closed loop. We instantiate this concept in [SystemName] for EB-1A immigration petition writing. Lawyers construct argument structures by assembling evidence snippets into a hierarchical argument tree; the system generates petition text constrained by this structure; and lawyers verify and iterate by modifying the structure rather than the text. A key design insight is that each sub-argument node simultaneously encodes argumentative intent, constrains generation scope, and anchors the provenance chain — so editing a sub-argument automatically maintains consistency across all three. A cross-granularity provenance engine traces every generated sentence through the argument hierarchy to specific locations in source documents.*

*In a within-subjects study with N immigration lawyers, structure-mediated authoring improved error detection rates by XX% and deepened argument comprehension compared to reviewing AI-generated mappings with flat provenance. Lawyers particularly valued structural iteration — modifying argument structure to redirect generation while automatically preserving provenance — a capability absent from existing AI writing tools.*

---

## 十二、提交前检查清单（v7.1）

### 闭环叙事一致性（最重要）

- ★★★★★ Introduction 是否清晰传达了"结构的三重角色"这个核心 claim？
- ★★★★★ System Design 是否按闭环四阶段组织（而非按组件）？
- ★★★★★ 每个 System Design subsection 是否都在讲"结构如何发挥某个角色"？
- ★★★★★ Evaluation 是否能区分闭环各环节的效果（RQ1=construction→verification, RQ2=structural provenance, RQ3=iteration）？
- ★★★★★ 迭代重写（Stage 4）是否有完整的 running example？

### Novelty 验证检查（v7.1 新增）

- ★★★★★ Stage 4 是否清晰表述了"三重耦合一致性"？（intent × generation × provenance）
- ★★★★★ 与 Semantic Commit 的差异是否明确？（intent consistency vs intent-generation-provenance coupling）
- ★★★★ 与 Bridging Gulfs 的差异是否明确？（UI code vs evidence-based writing + provenance）
- ★★★★ InkSync 的 Levenshtein repair 是否作为 provenance 断裂的具体例子？
- ★★★★ ABScribe 的 provenance loss 是否作为 prompt-level iteration 的局限性？

### 降级检查（确保不 overclaim）

- ★★★★ 五层模型是否只作为 implementation detail 描述（不 claim 层数本身是贡献）？
- ★★★★ Subject conflict detection 是否只在 5.2 中一段带过（不 claim 为独立 novel interaction）？
- ★★★★ Qualification checklist 是否只在 5.5 或 Discussion 中一句带过？
- ★★★★ Dual-mode 是否只作为 UI 决策描述（不 claim 为设计原则 DP5）？

### 差异化检查（v7.1 升级为 6 工具全覆盖）

- ★★★ 与 Sensecape 的差异：structure as tool vs infrastructure
- ★★★ 与 VISAR 的差异：top-down vs bottom-up + full regen vs incremental
- ★★★ 与 InkSync 的差异：flat vs structural provenance + Levenshtein vs structural preservation
- ★★★ 与 ABScribe 的差异：prompt variation vs structure editing + provenance lost vs preserved
- ★★★ 与 Semantic Commit 的差异：flat intent doc vs hierarchical argument structure + no gen-provenance vs full coupling
- ★★★ 与 Bridging Gulfs 的差异：UI code regen vs evidence-based writing + no provenance chain vs structural provenance

### 技术检查

- ★★★ Provenance pipeline 是否有五步描述？
- ★★★ Constrained generation 的 structured JSON 输出格式是否展示？
- ★★★ Technical evaluation 是否包含迭代后稳定性指标？
- ★★ User study Condition B 是否给了 flat provenance（而非无 provenance）？
- ★★ 归因逻辑是否写明"两组信息量相同，差异在交互方式和 provenance 类型"？

### Figure 清单（v7.1）

| Figure | 内容 | Section |
|--------|------|---------|
| **Figure 1** | Structure-Mediated Authoring Loop（闭环图） | 5.1 |
| **Figure 2** | Verify Mode 截图（四栏布局 + 拖拽映射） | 5.2 |
| **Figure 3** | Writing Tree 截图（SubArgument → Argument → Standard） | 5.4 / 5.5 |
| **Figure 4** | Provenance 链示意（Sentence → SubArg → Snippet → BBox） | 5.4 |
| **Figure 5** | 迭代重写 before/after（结构修改 → 文本变化 → provenance 自动更新） | 5.5 |
| **Figure 6** | User study 结果图表 | 6.2 |
| **Table 1** | 6 工具差异化矩阵（Section 1.4 / 4 末尾） | 4 或 5.5 |

---

## 十三、引用列表（v7.1）

### 核心引用

| # | 引用 | 用途 |
|---|------|------|
| 1 | Parasuraman & Riley (1997). Humans and Automation. Human Factors. | Automation bias；支撑 F1 |
| 2 | Laban et al. (2024). InkSync. UIST'24. | Flat provenance + text-level iteration 对比 |
| 3 | Hoque et al. (2024). HaLLMark. CHI'24. | Flat provenance 对比 |
| 4 | Reza et al. (2024). ABScribe. CHI'24. | Prompt-level iteration 对比 |
| 5 | Dang, Swoopes, Buschek, Glassman (2025). CorpusStudio. CHI'25. | Corpus-level authoring |
| 6 | Zhang et al. (2023). VISAR. UIST'23. | Argument construction + goal-level iteration 对比 |
| 7 | Suh et al. (2023). Sensecape. UIST'23. | 核心差异化对象 |
| 8 | Jiang et al. (2023). Graphologue. UIST'23. | Diagram sensemaking |
| 9 | Peng et al. (2025). GLITTER. UIST'25. | Legal AI |
| 10 | Swoopes et al. (2025). | Corroborating evidence |
| 11 | Braun & Clarke (2006). Thematic analysis. | 分析方法 |
| 12 | Hart & Staveland (1988). NASA-TLX. | 评估指标 |
| 13 | Buçinca et al. (2021). Cognitive Forcing Functions. CSCW'21. | 理论支撑 |
| 14 | Bansal et al. (2021). AI Explanations. CHI'21. | 理论支撑 |
| 15 | Ma et al. (2025). Human-AI Deliberation. CHI'25. | 理论参考 |
| **16** | **Vaithilingam et al. (2025). Semantic Commit. UIST'25.** | **Intent-level editing 对比（Section 4.4）** |
| **17** | **Bridging Gulfs in UI Generation through Semantic Guidance (2025 preprint)** | **Semantic diff → targeted regen 对比（Section 4.4）** |
| **18** | **Biermann et al. (2024). Ai.llude. DIS'24.** | **Rewriting AI text, text-level iteration 对比（Section 4.1）** |
| **19** | **Sarrafzadeh et al. (2026). Who Owns the Text? CHI'26 (preprint).** | **Provenance design patterns（Section 4.1）** |
| **20** | **Chakrabarty et al. (2025). Can AI Writing Be Salvaged? (preprint)** | **Edit taxonomy for AI text（Section 4.1 背景）** |

### 降级引用（不再重点引用，可选）

| # | 引用 | v6.8 用途 | v7.0 状态 |
|---|------|---------|----------|
| 13* | Toulmin (1958) | 五层结构理论基础 | **降为可选**——不再 claim 五层是贡献 |
| 14* | Wigmore (1913) | Legal argument visualization | **降为可选**——一句带过 |
| 15* | Reed & Rowe (2004). Araucaria. | Writing Tree 对比 | 保留但精简 |
| 16* | Verheij (2006) | Toulmin 在 AI 中的应用 | **移除**——不再需要 |
| 20* | Kirschner et al. (2003) | Argument visualization 综述 | **移除**——不再需要 |
| 21* | Lidwell et al. (2010) | Progressive disclosure for dual-mode | **移除**——dual-mode 不再是 DP |
| 22* | Reed, Walton & Macagno (2007) | Argument diagramming 综述 | **移除**——不再需要 |

---

## 十四、当前实现状态（v7.2 代码审查后更新）

### 闭环各阶段实现状态

| 闭环阶段 | 前端 | 后端 | 状态 | 细节 |
|---------|------|------|------|------|
| **Stage 1: Construction** | EvidenceCardPool + ArgumentGraph + 拖拽 + Focus + ConnectionLines + EntityMergeModal | unified_extractor + argument_composer + entity_resolver | ✅ 完成 | — |
| **Stage 2: Generation** | LetterPanel (显示生成文本) | petition_writer_v3 (SubArgument-aware) | ✅ 完成 | 已按 SubArgument 分块生成，输出 structured JSON with snippet_ids |
| **Stage 3: Verification** | LetterPanel 句子高亮 → Writing Tree 联动 → DocumentViewer BBox | provenance_engine + snippet_registry | ✅ 完成 | provenanceIndex.bySubArgument 已就绪 |
| **Stage 4: Refinement** | — | — | ⬜ **核心缺失** | 见下方详细分析 |

### Stage 4 缺失详细分析（基于 2/22 代码审查）

**前端 — ArgumentGraph.tsx：**
- ✅ 有三层有向图（SubArgument → Argument → Standard）
- ✅ 有拖拽添加 snippet 到 Argument
- ❌ **SubArgument 节点不可编辑**（没有 title input、没有 rename 功能）
- ❌ **没有 "Regenerate" 按钮**（Argument 或 SubArgument 级别都没有）
- ❌ **没有"添加新 SubArgument"按钮**
- ❌ **没有"移除 snippet from SubArgument"交互**

**前端 — WritingCanvas.tsx：**
- ✅ 有 LetterPanel 显示生成文本
- ✅ 有 "Add Argument" 按钮
- ✅ 有文本编辑功能（直接改文本）
- ❌ **没有增量替换逻辑**（不能只替换某个 SubArgument 对应的句子）

**前端 — AppContext.tsx：**
- ✅ `generatePetition()` 调用 `/write/v3/{projectId}/{section}`
- ❌ **`generatePetition()` 是全量循环所有 standards**，没有单 Argument/SubArgument 级别的重写函数
- ❌ **没有 `regenerateArgument(argumentId)` 或 `regenerateSubArgument(subargId)` 函数**

**后端 — petition_writer_v3.py：**
- ✅ 已按 SubArgument 分块生成（prompt 结构: `## Argument → ### SubArgument → Evidence snippets`）
- ✅ 输出 `subargument_paragraphs`，每项含 `subargument_id` + `sentences` + `snippet_ids`
- ✅ `/write/v3/{projectId}/{section}` 端点可用
- ⚠️ **API 当前是 per-standard 的**（如 `/write/v3/xxx/original_contribution`），不是 per-argument 的
- 需要：要么加一个 per-argument 参数过滤，要么前端只替换返回结果中指定 argument 的部分

### 其他待完成项

| 项目 | 优先级 | 论文需要？ | 状态 |
|------|--------|-----------|------|
| Stage 4 增量重写 | **P0** | ✅ 核心 novelty，论文和 video 必须展示 | ⬜ |
| 前后端联调（去 mock data） | **P1** | ✅ demo video 需要端到端跑通 | ⬜ |
| UI 打磨（录 video 用） | **P2** | ✅ video 需要 | ⬜ |
| Formative Study 执行 | **P1** | ✅ 论文 Section 3 | ⬜ |
| Condition B（flat provenance） | P3 | User study 才需要 | ⬜ |
| User Study 执行 | P3 | 最好有，但可以 formative + tech eval 先投 | ⬜ |
| 导出 Word/PDF | P4 | ❌ 论文不需要 | ⬜ |

---

## 十六、代码实现路线图（v7.2 新增）

### P0：Stage 4 增量重写（论文核心 novelty，~3-5 天）

**这是最高优先级。没有这个，论文的 Stage 4 running example 就是空谈，demo video 闭环不完整。**

#### Task 0.1：ArgumentGraph 节点编辑能力

**文件：** `frontend/src/components/ArgumentGraph.tsx`

**改动：**
- SubArgument 节点加 inline editable title（双击 → input field → blur 保存）
- SubArgument 节点加 "×" 删除 snippet 按钮（移除 snippet 映射）
- Argument 节点加 "+ SubArgument" 按钮
- Argument 节点加 "🔄 Regenerate" 按钮

**数据流：**
```
用户编辑 SubArgument title
  → 更新 AppContext 中的 argument structure
  → 不触发任何生成（用户决定何时 regenerate）

用户点击 Regenerate
  → 调用 regenerateArgument(argumentId)
  → 后端返回新 sentences
  → 替换 LetterPanel 中对应句子
```

#### Task 0.2：AppContext 增量重写函数

**文件：** `frontend/src/context/AppContext.tsx`

**新增函数：**
```typescript
const regenerateArgument = useCallback(async (
  standardKey: string,
  argumentId: string
) => {
  // 1. 调用现有 /write/v3/{projectId}/{standardKey}
  // 2. 从返回的 sentences 中过滤出 argument_id === argumentId 的句子
  // 3. 用 provenanceIndex.by_argument[argumentId] 定位 LetterPanel 中的旧句子
  // 4. 替换旧句子为新句子
  // 5. 更新 provenanceIndex
}, [projectId]);
```

**关键：** 后端 API 不需要改动——现有 `/write/v3` 已经返回 per-subargument 的结构化数据。前端只需要做"部分替换"而非全量替换。

#### Task 0.3：LetterPanel 增量句子替换

**文件：** `frontend/src/components/WritingCanvas.tsx`

**改动：**
- `LetterSectionComponent` 支持接收 `updatedSentences` 并只替换指定 subargument_id 的句子
- 替换后触发 provenance re-index（已有 `provenanceIndex.bySubArgument`，只需刷新对应条目）
- 新替换的句子短暂高亮（视觉反馈，表示"这些是刚重写的"）

#### Task 0.4：后端微调（可选，如果需要）

**文件：** `backend/app/services/petition_writer_v3.py`

**可能的改动：**
- `/write/v3/{projectId}/{section}` 加可选参数 `?argument_id=xxx`，只生成指定 Argument 下的 SubArgument 段落
- 好处：减少 API 调用时间和 token 消耗（不用重新生成整个 standard 下所有 arguments）
- 如果时间紧，可以跳过——前端从全量返回中过滤也行

### P1：前后端联调（~2-3 天）

#### Task 1.1：确认端到端数据流

跑通完整闭环，不用任何 mock data：
```
上传 PDF → OCR → snippet 提取 → 拖拽映射 → 生成文本 → 点击句子 → provenance 高亮 → 编辑 SubArgument → Regenerate → 新句子 + provenance 更新
```

#### Task 1.2：修复已知的数据断点

- 检查 `snippet_ids` 在前后端之间是否一致（前端 snippet card 的 id 是否和后端生成时用的 id 匹配）
- 检查 `provenanceIndex` 在 regeneration 后是否正确更新
- 检查 BBox 坐标在 DocumentViewer 中的渲染是否准确

### P2：UI 打磨 + Demo 准备（~2-3 天）

#### Task 2.1：录 Video 前的 UI 修复

- 确保所有高亮颜色一致（provenance 链的视觉一致性）
- Writing Tree 中节点展开/折叠流畅
- Regenerate 时加 loading indicator
- 确保系统在 1080p 下截图美观

#### Task 2.2：准备 Demo 案例数据

- 用 Dr. Yaruo Qu 案例准备一个完整的、端到端的 demo flow
- 预设好一个"需要 iterate"的场景（比如 Original Contributions 下的 SubArgument 需要调整）
- 确保 demo 能在 5 分钟内完整展示闭环

### P3：Formative Study + User Study（与代码并行）

#### Task 3.1：Formative Study（优先）

- 联系 3-5 名移民律师
- 准备访谈协议 + probe task 材料（预埋 5 个错误的 AI mapping）
- 准备纸质/数字版证据卡片用于手动构建观察
- **这个可以在系统开发的同时进行——不依赖系统完成**

#### Task 3.2：User Study（如果时间允许）

- 需要系统完全稳定后才能做
- 需要实现 Condition B（flat provenance 版本）
- 如果来不及，**论文可以先投 formative study + technical eval**，rebuttal 或 camera-ready 时补 user study 数据

### 不做的（deadline 后）

- ❌ 导出 Word/PDF
- ❌ 多案例支持
- ❌ 更多 OCR 格式支持
- ❌ 部署到公网

---

## 十七、提交时间线（v7.2 新增）

### 总览（今天 2/22 → 4/9 deadline）

```
2/22 ────────── 3/7 ────────── 3/21 ── 3/24 ── 3/31 ── 4/9
 │                │               │      │       │       │
 │  P0: Stage 4   │  P1: 联调     │  写   │ 交    │ 交    │ 交
 │  代码实现       │  P2: UI打磨   │  论文  │ Abs   │ Paper │ Video
 │                │  Formative    │       │       │       │
 │                │  Study        │       │       │       │
```

### 周级排期

| 周 | 日期 | 代码 | 论文 | Study |
|----|------|------|------|-------|
| **W1** | 2/22 - 2/28 | **P0: Task 0.1-0.2**（ArgumentGraph 编辑 + regenerateArgument 函数） | — | 联系律师，排 formative study 时间 |
| **W2** | 3/1 - 3/7 | **P0: Task 0.3-0.4**（LetterPanel 增量替换 + 后端微调） | 开始写 Introduction + Related Work | — |
| **W3** | 3/8 - 3/14 | **P1: 联调**（端到端跑通） | System Design + Formative Study section | **执行 Formative Study**（如果律师排好了） |
| **W4** | 3/15 - 3/21 | **P2: UI 打磨**（录 video 准备） | Evaluation + Discussion + Abstract | Formative Study 数据分析 |
| **W5** | 3/22 - 3/24 | Bug fixes | **3/24: 提交 Abstract** | — |
| **W5-6** | 3/25 - 3/31 | 冻结代码 | **论文全文打磨 → 3/31 提交 Paper** | — |
| **W6-7** | 4/1 - 4/9 | — | — | **录制 Demo Video → 4/9 提交** |

### 关键里程碑

| 日期 | 里程碑 | 完成标准 |
|------|--------|---------|
| **2/28** | Stage 4 核心交互可用 | ArgumentGraph 中可编辑 SubArgument + 点 Regenerate 能重写 |
| **3/7** | 闭环端到端跑通 | 拖拽→生成→验证→编辑→重写→provenance更新，全流程不用 mock |
| **3/14** | Formative Study 完成 | 3-5 名律师访谈完成，F1-F4 有数据支撑 |
| **3/21** | 论文初稿完成 | 全文可读，数据可能有 placeholder |
| **3/24** | Abstract 提交 | 标题 + 摘要 + 作者列表锁定 |
| **3/31** | Paper 提交 | 完整论文 PDF，≤10 页双栏 |
| **4/9** | Video 提交 | ≤5 分钟 demo video + .srt 字幕 |

### 风险与备案

| 风险 | 概率 | 备案 |
|------|------|------|
| Stage 4 实现比预期复杂 | 中 | 只做"编辑 SubArgument title + Regenerate"最小功能，跳过"添加新 SubArgument"和"拖拽移除 snippet" |
| Formative Study 约不到律师 | 中 | 用 paralegal / law student 替代，论文说明 limitation |
| User Study 来不及做 | 高 | 先投 formative + technical eval，camera-ready 补 user study |
| 前后端联调 bug 多 | 中 | 优先保证 demo 路径跑通（一条完整的 happy path），edge case 后修 |

---

## 十五、v7.1 → v7.2 变更追踪

| 变更编号 | Section | 变更内容 | 动机 |
|---------|---------|---------|------|
| #39 | 十六 (新增) | 代码实现路线图：P0-P3 task 分解 + 具体文件和函数级改动点 | 代码和论文对齐 |
| #40 | 十七 (新增) | 提交时间线：周级排期 + 里程碑 + 风险备案 | 确保 3/31 deadline 可达 |
| #41 | 十四 | 实现状态基于代码审查更新：Stage 4 缺失详细分析到文件/函数级 | 精确定位开发任务 |

### v7.0 → v7.1 变更（保留供参考）

| 变更编号 | Section | 变更内容 | 动机 |
|---------|---------|---------|------|
| #33 | 1.6 (新增) | SubArgument 三重耦合性精确表述 + 5 工具对比表 | Stage 4 novelty 验证 |
| #34 | 4.4 (新增) | Semantic Editing and Intent-Level Iteration subsection | 覆盖 Semantic Commit + Bridging Gulfs |
| #35 | 4.1 | 新增 Ai.llude (DIS'24) | 补全 text-level 迭代对比 |
| #36 | 5.5 | Stage 4 重写：4 工具对比表 + 技术实现确认 + provenance 自动一致性表述 | 强化核心 novelty section |
| #37 | 1.4 | 差异化矩阵从 3 工具升级为 6 工具 | 全面覆盖竞品 |
| #38 | 引用 | 新增 5 篇（Semantic Commit, Bridging Gulfs, Ai.llude, Who Owns the Text?, Can AI Writing Be Salvaged?） | 文献补全 |

### v6.8 → v7.0 变更（保留供参考）

| 变更编号 | Section | 变更内容 | 动机 |
|---------|---------|---------|------|
| #26 | 全文 | 叙事从"问题+三交互"改为"统一闭环" | v6.8 说太多、每个太浅 |
| #27 | 贡献 | 三个 → 两个（C1 闭环理念 + C2 结构溯源） | 两强 > 三弱 |
| #28 | System Design | 按组件 → 按闭环阶段 | 每 section 都讲同一故事 |
| #29 | 多处 | 五层模型/entity/qualification/dual-mode 降级 | 不 overclaim |
| #30 | 5.5 | 新增迭代重写（Stage 4） | v6.8 完全缺失 |
| #31 | RQ | 四个 → 三个 | 聚焦闭环 |
| #32 | 标题 | "Extract-then-Assemble" → "Structure-Mediated Authoring" | 更准确传达核心理念 |

---

*— v7.2 Implementation Roadmap Edition: Paper Plan × Code Plan × Timeline Aligned —*
