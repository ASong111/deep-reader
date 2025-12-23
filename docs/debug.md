# Bug Report

## [FIXED] Text Selection Blue Background Issue

**Status**: ✅ Fixed

**Problem**: 
在阅读区，双击内容可以选中，但是单击鼠标移动在松开文本内容没有变成蓝色背景。
(In the reading area, double-clicking content selects it, but single-clicking and dragging the mouse to select text does not result in a blue background.)

**Root Cause**:
React state updates (`setSelectedText()` and `setSelectionPosition()`) triggered component re-renders, causing DOM nodes to be replaced. This invalidated all Range objects, making it impossible to maintain text selection programmatically.

**Solution**:
1. **Used React.memo to create MemoizedContent component** - Prevents content DOM from re-rendering when selection state changes
2. **Implemented dual RAF monitoring strategy**:
   - Initial RAF (0-500ms) maintains selection immediately after mouseup
   - Long-term RAF (after handleSelection) continues monitoring for 10 seconds
3. **Delayed handleSelection execution** (600ms) - Ensures initial RAF completes before state updates

**Key Changes**:
- Created `MemoizedContent` component with `React.memo` to stabilize DOM nodes
- Moved `savedRange` from local variable to `useRef` for persistence
- Removed useEffect cleanup that was prematurely canceling RAF monitoring
- Added CSS `::selection` styles injection on component mount

**Files Modified**:
- `src/components/immersive-reader/ReaderContent.tsx`

**Fixed Date**: 2024-12-23
