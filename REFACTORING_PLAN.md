# 代码重构计划文档

本文档旨在识别当前项目中存在的代码复杂性问题，并提供一个分阶段、可执行的重构计划，以提高代码质量、可维护性和可扩展性。

## 一、 代码分析

通过对项目文件的审查，我们识别出以下几个文件因代码行数过多（超过500行）和职责过重而成为潜在的维护瓶颈：

1.  **`src/features/audioAlignment/components/AudioWaveformEditor.tsx` (~620行)**
    *   **问题**: 这是一个典型的“上帝组件”（God Component）。它独自承担了UI渲染、复杂的状态管理（标记、历史记录、缩放、平移）、第三方库 `WaveSurfer.js` 的生命周期管理以及多种用户交互事件（键盘、鼠标）的监听。这导致组件内部逻辑高度耦合，难以理解、测试和修改。

2.  **`src/features/audioAlignment/AudioAlignmentPage.tsx` (~580行)**
    *   **问题**: 作为页面级组件，它整合了过多的子组件和功能入口，包括章节列表、脚本行、全局播放器和大量的顶部操作按钮。虽然部分逻辑已通过Hooks抽离，但组件本身仍然管理着复杂的UI布局、状态过滤、弹窗和事件处理，职责过于宽泛。

3.  **`src/store/slices/projectSlice.ts` (~500行)**
    *   **问题**: 这个 Zustand 状态管理文件几乎囊括了所有与项目数据相关的核心操作，从项目的基础增删改查到具体的音频分配、重分段等，职责边界模糊，导致文件体积庞大，后续难以维护。

### 结论

**项目亟需进行模块化和重构。**

当前的代码虽然具备了良好的顶层目录结构，但在组件和状态管理的实现层面，已经出现了成为“屎山代码”的明显趋势。如果不加以控制，随着新功能的不断加入，维护成本将急剧上升。

---

## 二、 重构计划

本计划遵循“分阶段、低风险”的原则，旨在将大型、复杂的模块拆分为更小、更专注、更易于管理的单元。

### **第一阶段：重构 `AudioWaveformEditor.tsx` (最高优先级)**

---
**状态更新：** ✅ **此阶段已完成。**

`AudioWaveformEditor.tsx` 已被重构。其核心状态和交互逻辑被抽离到了新的自定义 Hook `useWaveSurfer.ts` 中。UI部分也被拆分成了多个独立的子组件 (`WaveformToolbar.tsx`, `WaveformZoomControl.tsx`, `WaveformMarkers.tsx`, `WaveformHotkeysInfo.tsx`)。主组件现在作为一个清爽的视图层，负责组合这些模块化的部分。
---

**原计划:**

1.  **逻辑抽离 (自定义 Hooks):**
    *   创建 **`useWaveformState.ts`**: 将所有与波形图UI状态相关的 `useState` 和 `useRef` (如 `markers`, `history`, `zoomLevel` 等) 及其更新函数迁移至此。
    *   创建 **`useWaveSurfer.ts`**: 封装所有与 `WaveSurfer.js` 实例相关的逻辑，包括初始化、加载音频、事件监听和销毁。此 Hook 负责管理 `WaveSurfer` 的整个生命周期。
    *   创建 **`useWaveformInteraction.ts`**: 抽离所有用户交互逻辑，包括键盘快捷键监听、鼠标滚轮缩放、中键拖动平移等。

2.  **UI拆分 (子组件):**
    *   创建 **`WaveformMarker.tsx`**: 封装渲染单个波形标记点（Marker）的逻辑。
    *   创建 **`WaveformToolbar.tsx`**: 将顶部的工具栏（播放、撤销、重做、保存等按钮）拆分为独立组件。
    *   创建 **`WaveformHotkeysInfo.tsx`**: 将底部的快捷键提示信息拆分为独立组件。

**预期效果**: `AudioWaveformEditor.tsx` 将转变为一个轻量级的“容器组件”，其主要职责是组合上述 Hooks 和子组件，代码行数将大幅减少，逻辑清晰。

### **第二阶段：重构 `AudioAlignmentPage.tsx` (中优先级)**

---
**状态更新：** ✅ **UI拆分部分已完成。**

`AudioAlignmentPage.tsx` 的 UI 结构已成功重构。为了降低其复杂性，页面已被拆分为三个独立的子组件：
- **`AudioAlignmentHeader.tsx`**: 封装了顶部的操作栏。
- **`ChapterListPanel.tsx`**: 封装了左侧的章节列表和分页逻辑。
- **`ScriptLineList.tsx`**: 封装了右侧的脚本行渲染区域。

主页面组件现在作为一个“协调器”，负责状态管理并将数据传递给子组件。这大大简化了主页面的结构，提高了可读性。下一步将继续本阶段的第二部分：将业务逻辑抽离到自定义 Hooks 中。
---

**计划:**

1.  **UI拆分 (子组件):** ✅ **已完成**
    *   创建 **`AudioAlignmentHeader.tsx`**: 封装页面顶部的所有操作按钮和状态显示。
    *   创建 **`ScriptLineList.tsx`**: 封装渲染脚本行列表的核心区域，使其独立于页面布局。
    *   *(额外完成)*: 创建 **`ChapterListPanel.tsx`** 来管理左侧面板。

2.  **逻辑抽离 (自定义 Hooks):** 🟡 **下一步**
    *   创建 **`useAudioExport.ts`**: 将音频导出的复杂逻辑（包括弹窗状态）封装起来。
    *   创建 **`useChapterSelection.ts`**: 将章节多选和 `Shift` 键范围选择的逻辑封装起来，提高复用性。

**预期效果**: `AudioAlignmentPage.tsx` 将主要负责 `ResizablePanels` 的布局和高阶状态的传递，自身的业务逻辑代码将显著减少。

### **第三阶段：审视并拆分 `projectSlice.ts` (长期规划)**

解决状态管理文件过于臃肿的问题，为未来的功能扩展做准备。

1.  **分析职责**: 当前 Slice 混合了项目结构、音频数据、用户设置等多个不同维度的状态。
2.  **拆分方案 (可选):** 根据职责边界，可以考虑将其拆分为更小的 Slices，例如：
    *   `projectStructureSlice.ts`: 管理项目的基本信息、章节的增删改。
    *   `projectAudioSlice.ts`: 专职管理所有与项目中音频数据相关的操作。
    *   `userSettingsSlice.ts`: 管理用户配置，如快捷键、API设置等。

**注意**: 拆分 Zustand Store 会引入一些额外的集成样板代码。在当前阶段，可以优先完成前两个阶段的组件重构，将此步骤作为长期优化目标。

---

## 三、 总结

遵循此计划，我们可以系统性地改善代码库的健康状况，降低未来开发的复杂度和风险。建议从第一阶段开始，循序渐进地实施重构。