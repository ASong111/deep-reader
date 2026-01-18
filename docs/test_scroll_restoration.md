# 测试滚动位置恢复功能

## 测试目的

验证阅读进度功能能够精确恢复到用户上次阅读的文本区域，而不仅仅是章节开头。

## 测试步骤

### 1. 启动应用

```bash
pnpm tauri dev
```

打开浏览器开发者工具（F12），切换到控制台标签。

### 2. 打开书籍并滚动

1. 在图书馆中点击一本书
2. 进入阅读界面后，**向下滚动一段距离**（例如滚动到页面中间）
3. 记住当前阅读的文本内容

### 3. 返回图书馆

1. 点击"返回图书馆"按钮
2. 观察控制台日志，应该看到：
   ```
   💾 返回图书馆前保存进度: { bookId: 1, chapterIndex: 0, scrollOffset: 1234 }
   ✅ 阅读进度保存成功
   ```
3. 注意 `scrollOffset` 的值（例如 1234）

### 4. 重新打开书籍

1. 在图书馆中再次点击同一本书
2. 观察控制台日志：
   ```
   📖 打开书籍，已保存的进度: { chapter_index: 0, scroll_offset: 1234 }
   🎯 目标章节索引: 0
   ⏳ 准备恢复滚动位置到: 1234
   📜 执行滚动到: 1234
   ✅ 当前滚动位置: 1234 目标: 1234
   ```

3. **验证结果**：
   - ✅ 页面应该自动滚动到之前的位置
   - ✅ 应该看到之前记住的文本内容
   - ✅ 不应该停留在章节开头

## 预期行为

### 成功的情况

- 页面平滑滚动到上次阅读的位置
- 控制台显示 `✅ 当前滚动位置` 与 `目标` 一致
- 用户看到的是上次阅读的文本区域

### 可能的问题

#### 问题1：滚动位置不准确

**症状**：
- 控制台显示 `当前滚动位置: 0 目标: 1234`
- 页面停留在章节开头

**可能原因**：
1. 内容还没渲染完成就执行了滚动
2. 延迟时间不够（当前是300ms）

**解决方法**：
- 增加延迟时间到500ms或更长
- 使用 `requestAnimationFrame` 等待渲染完成

#### 问题2：滚动位置被重置

**症状**：
- 先滚动到正确位置，然后又跳回开头

**可能原因**：
- 其他代码在滚动后又重置了位置
- 章节切换逻辑干扰了滚动

**解决方法**：
- 检查是否有其他滚动相关的代码
- 确保滚动恢复是最后执行的操作

#### 问题3：Markdown格式的特殊处理

**症状**：
- EPUB格式正常，但Markdown格式不工作

**原因**：
- Markdown使用锚点跳转，可能覆盖了滚动位置

**解决方法**：
- 对Markdown格式禁用锚点跳转
- 或者在锚点跳转后再恢复滚动位置

## 调试技巧

### 1. 检查保存的滚动位置

在返回图书馆前，手动检查当前滚动位置：

```javascript
// 在浏览器控制台执行
console.log('当前滚动位置:', window.scrollY);
```

### 2. 验证数据库中的数据

```bash
# 打开数据库
sqlite3 ~/Library/Application\ Support/com.deep-reader.app/deep-reader.db

# 查询阅读进度
SELECT * FROM reading_progress;
```

应该看到类似：
```
id|book_id|chapter_index|scroll_offset|updated_at
1|1|0|1234|2024-01-17 10:30:00
```

### 3. 测试不同的滚动距离

- 测试小距离（100px）
- 测试中等距离（1000px）
- 测试大距离（5000px）
- 测试页面底部

### 4. 测试不同的章节

1. 在第一章滚动并保存
2. 切换到第二章
3. 返回图书馆
4. 重新打开，应该回到第二章

## 性能考虑

### 当前实现

- 延迟：300ms
- 滚动行为：smooth（平滑滚动）
- 验证延迟：500ms

### 可能的优化

1. **使用 `instant` 而不是 `smooth`**：
   ```javascript
   window.scrollTo({
     top: savedProgress.scroll_offset,
     behavior: 'instant' // 立即跳转，不平滑滚动
   });
   ```

2. **使用 `requestAnimationFrame`**：
   ```javascript
   requestAnimationFrame(() => {
     requestAnimationFrame(() => {
       window.scrollTo({
         top: savedProgress.scroll_offset,
         behavior: 'smooth'
       });
     });
   });
   ```

3. **监听内容加载完成**：
   ```javascript
   // 等待图片加载完成
   await Promise.all(
     Array.from(document.images)
       .filter(img => !img.complete)
       .map(img => new Promise(resolve => {
         img.onload = img.onerror = resolve;
       }))
   );
   ```

## 测试清单

- [ ] 保存滚动位置（返回图书馆时）
- [ ] 恢复滚动位置（重新打开书籍时）
- [ ] 切换章节时保存位置
- [ ] 不同章节的位置独立保存
- [ ] EPUB格式正常工作
- [ ] Markdown格式正常工作
- [ ] PDF格式正常工作
- [ ] 滚动位置准确（误差<50px）
- [ ] 平滑滚动效果良好
- [ ] 控制台日志正确显示

## 已知限制

1. **Markdown格式**：由于使用锚点导航，可能需要特殊处理
2. **图片加载**：如果页面有大量图片，可能影响滚动位置准确性
3. **动态内容**：如果内容高度动态变化，滚动位置可能不准确
