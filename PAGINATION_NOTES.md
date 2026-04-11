# 分页加载改造步骤总结

这次改造的目标，是把根节点一次性渲染改成“分页展示 + 滚动触发加载更多”，并补齐对应的加载状态反馈。

## 1. 为根节点分页建立本地状态

- 在 `useCollectionTree.ts` 中增加根节点分页相关状态：
  - `ROOT_PAGE_SIZE`：每页加载数量
  - `rootChildrenRef`：保存根节点的完整数据
  - `rootLoadedRef`：标记根节点是否已经完成首次加载
  - `visibleRootCount`：当前页面上可见的根节点数量
  - `loadingMoreRef` / `isLoadingMoreRootItems`：控制“加载更多”过程中的并发和 UI 状态

核心思路是：
- 数据仍然一次拉全
- 渲染时只先展示前 N 条
- 后续通过增加 `visibleRootCount` 来模拟分页加载

## 2. 拦截根节点首屏数据，只渲染第一页

- 在 `dataLoader.getChildrenWithData` 里判断当前是否为根节点
- 如果是根节点：
  - 把完整返回结果写入 `rootChildrenRef`
  - 标记 `rootLoadedRef.current = true`
  - 只返回前 `visibleRootCount` 条给树组件

这样可以保持现有树结构和接口不变，同时把分页逻辑集中在 hook 内部。

## 3. 增加“同步可见根节点”的能力

- 新增 `syncVisibleRootChildren`
- 根据 `visibleRootCount` 截取 `rootChildrenRef.current`
- 调用树实例的缓存更新方法，把当前应该显示的根节点列表同步到 UI
- 最后执行 `tree.rebuildTree()`

这一步是分页展示的关键，因为真正控制树里显示哪些根节点的是 tree cache，而不是单纯的 React state。

## 4. 实现加载更多逻辑

- 新增 `loadMoreRootItems`
- 触发时先判断：
  - 根节点是否已经完成初次加载
  - 当前是否正在加载
  - 是否还有更多数据
- 设置 `isLoadingMoreRootItems = true`
- 等待一个短暂延时，用来保证 loading 动画能被看见
- 再把 `visibleRootCount` 增加一页
- 最后关闭 loading 状态

当前体验参数：
- 每页 `10` 条
- loading 展示时长约 `300ms`

## 5. 在组件中接入滚动触底加载

- 在 `CollectionTree.tsx` 中增加：
  - `scrollRef`：滚动容器
  - `sentinelRef`：底部哨兵节点
- 使用 `IntersectionObserver` 监听哨兵节点是否进入滚动容器可视区
- 命中后调用 `loadMoreRootItems`

这样可以实现“滚动到底部自动加载下一页”，不需要用户额外点击按钮。

## 6. 增加底部状态区

- 在列表底部新增状态容器 `tree-status`
- 根据状态显示不同内容：
  - 加载中：只显示旋转 loading
  - 还有更多：不显示文字
  - 已全部加载完成：显示“没有更多”
  - 空列表：显示“暂无一级节点”

这个状态区的目的，是让滚动触发分页时有明确反馈，同时避免出现“已加载 x/y 条”这类干扰文案。

## 7. 补充 loading 动画样式

- 在 `styles.css` 中新增：
  - `tree-status`
  - `tree-status.is-loading`
  - `tree-status-spinner`
  - `@keyframes treeSpin`

动画实现方式是一个轻量旋转圆环，适合放在列表底部，视觉上更清楚，也不会抢主内容注意力。

## 8. 让 CRUD 操作与分页状态保持一致

分页改造后，根节点列表不再只是“接口返回什么就显示什么”，所以增删拖拽都要同步维护分页缓存。

需要特别处理这些场景：

- 新建根目录文件夹
  - 更新 `rootChildrenRef`
  - 更新根节点缓存 children
  - 适当增加 `visibleRootCount`

- 删除根目录下的文件/文件夹
  - 从 `rootChildrenRef` 中移除
  - 重新计算当前可见数量
  - 调用 `syncVisibleRootChildren`

- 拖拽移出根目录
  - 从 `rootChildrenRef` 中移除对应节点

- 拖拽进入根目录
  - 向 `rootChildrenRef` 中追加对应节点

如果这一步漏掉，就会出现分页状态和树显示内容不一致的问题。

## 9. 验证改造结果

改造完成后，至少要验证这些行为：

- 首屏只展示第一页根节点
- 滚动到底部会自动触发下一页加载
- 加载中能看到 spinner
- 加载完成后确实新增了更多节点
- 全部加载完成后显示“没有更多”
- 根节点为空时显示“暂无一级节点”
- 新建、删除、拖拽后分页状态依然正确
- 项目能正常构建通过

## 10. 如果后续要继续演进

当前实现更偏“前端分页展示”，即：
- 接口一次返回全部根节点
- 前端按页控制展示数量

如果后面要升级成“服务端真分页”，可以继续做：

- 接口返回分页参数，例如 `page`、`pageSize`、`hasMore`
- `rootChildrenRef` 改为累计拼接服务端分页结果
- `loadMoreRootItems` 改为真正请求下一页接口
- 把“是否有更多”改成依赖服务端返回值，而不是本地长度比较

这样就可以从 demo 平滑升级到真实线上方案。
