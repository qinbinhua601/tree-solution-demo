# 分页复用迁移说明

这份说明用于把当前项目里的“本地渐进分页 + 触底自动加载”能力迁移到其他项目。

## 先回答一个关键问题

为什么增删改时也要调用分页相关方法？

因为这里的分页不是“接口每次返回一页”的服务端分页，而是“前端手里已经有整批数据，只先展示一部分”的本地渐进分页。

这意味着分页 hook 自己维护了两份关键状态：

- 完整数据：`items`
- 当前展示窗口：`visibleCount`

所以一旦业务数据发生变化，分页状态也必须同步更新：

- 新增：如果列表总数变了，但分页状态没加，新数据可能不会出现在当前视图里
- 删除：如果删掉了一条，但分页状态没减，`visibleCount` 可能比真实数据大，界面状态会不一致
- 拖拽/移动：本质上也是“从一个列表删掉，再往另一个列表加进去”
- 重刷数据：如果重新请求了一批数据，不调用 `setItems`，分页 hook 还会拿旧数据工作

一句话说，谁维护“当前列表内容”，谁就要同时维护“当前分页窗口”。

## 如果要迁移到别的项目，最少复制哪些文件

最小可迁移文件：

- [src/hooks/useIncrementalPagination.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useIncrementalPagination.ts:1)
- [src/hooks/useInfiniteScrollTrigger.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useInfiniteScrollTrigger.ts:1)

这两个文件本身不依赖当前树组件，也不依赖 `@headless-tree`，复制到其他 React 项目通常就能直接用。

如果你还想连“当前项目里的树形接法示例”一起带走，可以额外参考：

- [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:1)
- [src/components/CollectionTree.tsx](/Users/alexq/Desktop/digging/tree-solution-demo/src/components/CollectionTree.tsx:1)

但这两份不是通用依赖，而是当前业务示例。

## 这两个 hook 分别负责什么

### `useIncrementalPagination`

适合这种场景：

- 已经拿到了完整数组
- 但 UI 想先展示前 N 条
- 用户点击“加载更多”或滚动到底部时，再多显示一些

核心能力：

- 维护完整数据 `items`
- 维护当前可见数量 `visibleCount`
- 输出当前应渲染的数据 `visibleItems`
- 处理 `loadMore`
- 处理新增 `appendItem`
- 处理删除 `removeItems`
- 处理整批重置 `setItems`

### `useInfiniteScrollTrigger`

适合这种场景：

- 有一个滚动容器
- 容器底部放一个哨兵元素
- 哨兵进入可视区时，触发 `onIntersect`

它只负责滚动监听，不负责数据本身。

## 最小接入步骤

### 1. 在列表组件里初始化分页 hook

```tsx
const pagination = useIncrementalPagination<Item>({
  initialPageSize: 10,
  loadMoreDelay: 300,
});
```

### 2. 数据请求完成后，交给分页 hook

```tsx
const items = await fetchItems();
pagination.setItems(items, { resetVisibleCount: true });
```

如果是首次加载、切换筛选条件、重新查询，通常都建议传 `resetVisibleCount: true`。

### 3. 渲染 `visibleItems`

```tsx
return (
  <div>
    {pagination.visibleItems.map((item) => (
      <Row key={item.id} item={item} />
    ))}
  </div>
);
```

### 4. 手动“加载更多”

```tsx
<button
  disabled={!pagination.hasMore || pagination.isLoadingMore}
  onClick={() => void pagination.loadMore()}
>
  加载更多
</button>
```

### 5. 如果想自动触底加载，再接 `useInfiniteScrollTrigger`

```tsx
const scrollRef = useRef<HTMLDivElement | null>(null);
const sentinelRef = useRef<HTMLDivElement | null>(null);

useInfiniteScrollTrigger({
  rootRef: scrollRef,
  targetRef: sentinelRef,
  enabled: pagination.hasMore,
  onIntersect: () => {
    void pagination.loadMore();
  },
});
```

对应 JSX：

```tsx
<div ref={scrollRef} style={{ overflow: 'auto', maxHeight: 480 }}>
  {pagination.visibleItems.map((item) => (
    <Row key={item.id} item={item} />
  ))}

  <div ref={sentinelRef}>
    {pagination.isLoadingMore ? '加载中...' : pagination.hasMore ? '' : '没有更多'}
  </div>
</div>
```

## 数据变更时应该怎么调用

### 新增一条

```tsx
pagination.appendItem(newItem, { reveal: true });
```

`reveal: true` 的含义是：

- 把新项加入完整数据
- 同时扩大可见窗口，让它立即出现在界面里

如果你只是想加入数据，但不想立刻展示，可以不传这个选项。

### 删除一条或多条

```tsx
pagination.removeItems((item) => item.id === removedId);
```

这会：

- 从完整数据里移除
- 自动修正 `visibleCount`

### 整批替换

```tsx
pagination.setItems(nextItems, { resetVisibleCount: true });
```

适用于：

- 重新请求列表
- 切换筛选条件
- 切换 tab
- 服务端返回了新的完整结果集

## 当前项目里的实际用法位置

### 分页状态在树业务里的接入点

- 初始化分页 hook：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:43)

- 根节点请求完成后调用 `setItems`：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:87)

- 只取当前分页窗口里的根节点用于渲染：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:90)

- 可见数量变化后，同步 tree cache：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:201)

- 触发加载更多：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:205)

- 新建根节点时追加数据：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:215)

- 删除根节点时移除数据：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:250)
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:271)

- 拖拽进出根目录时同步分页状态：
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:119)
  [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:123)

### 触底监听在组件里的接入点

- 使用滚动触发 hook：
  [src/components/CollectionTree.tsx](/Users/alexq/Desktop/digging/tree-solution-demo/src/components/CollectionTree.tsx:35)

- 滚动容器：
  [src/components/CollectionTree.tsx](/Users/alexq/Desktop/digging/tree-solution-demo/src/components/CollectionTree.tsx:62)

- 底部哨兵元素：
  [src/components/CollectionTree.tsx](/Users/alexq/Desktop/digging/tree-solution-demo/src/components/CollectionTree.tsx:90)

## 迁移到别的项目时，给 agent 的建议指令

你可以把这份文档和两个 hook 一起复制过去，然后给 agent 一个类似的任务说明：

```md
请复用 `useIncrementalPagination` 和 `useInfiniteScrollTrigger`，
把当前列表改成“本地渐进分页 + 触底自动加载”。

要求：
- 首屏展示 10 条
- 底部进入视口后继续加载
- 新增后立即可见
- 删除后分页状态保持正确
- 重新请求数据时重置可见数量
```

## 一句经验总结

这套抽象最适合“前端已经拿到了整批数据，只是分批展示”的场景。

如果你下一个项目是服务端真分页，那就可以继续复用 `useInfiniteScrollTrigger`，但 `useIncrementalPagination` 可能需要改成“累计拼接服务端结果”的版本，而不是单纯维护本地完整数组。
