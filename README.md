# 文档收藏夹树 — 技术方案

分页实现分析与跨项目接入建议见 [HEADLESS_TREE_PAGINATION_ANALYSIS.md](/Users/alexq/Desktop/digging/tree-solution-demo/HEADLESS_TREE_PAGINATION_ANALYSIS.md:1)。

## 目录结构

```
tree-solution-demo/
├── README.md                               ← 当前方案说明
├── HEADLESS_TREE_PAGINATION_ANALYSIS.md    ← 分页分析与复用建议
├── server/
│   ├── collection-store.mjs                ← 真实后端数据层与业务校验
│   ├── index.mjs                           ← Node HTTP 服务
│   └── seed-data.mjs                       ← 初始化种子数据
├── scripts/
│   └── dev.mjs                             ← 同时启动前后端的开发脚本
├── src/
│   ├── api/
│   │   └── collection.ts                   ← 接口封装
│   ├── components/
│   │   ├── CollectionTree.tsx              ← 树容器组件
│   │   └── TreeItem.tsx                    ← 单个节点渲染
│   ├── hooks/
│   │   ├── useCollectionTree.ts            ← 树数据与分页逻辑
│   │   └── useInfiniteScrollTrigger.ts     ← 触底加载监听
│   ├── App.tsx
│   └── styles.css
├── package.json
└── vite.config.ts
```

## 运行方式

```bash
npm run dev
```

- `http://localhost:3001` 启动真实后端接口
- `http://localhost:5173` 启动前端 demo，`/collection` 请求会自动代理到后端
- 后端数据默认持久化到 `server/data/runtime/collection-db.json`

---

## 一、库能力映射

| 需求 | 使用的 headless-tree 能力 |
|------|--------------------------|
| 懒加载子节点 | `asyncDataLoaderFeature` + `dataLoader.getChildrenWithData` |
| 拖拽移动 | `dragAndDropFeature` + `onDrop` + `insertItemsAtTarget` / `removeItemsFromParents` |
| 键盘拖拽 | `keyboardDragAndDropFeature` |
| 文件夹重命名 | `renamingFeature` + `onRename` |
| 新建/删除节点 | 操作本地缓存后调 `updateCachedData` / `updateCachedChildrenIds` + `tree.rebuildTree()` |
| 根节点分页展示 | `visibleRootCount` + 渲染前 `slice` + `IntersectionObserver` |

---

## 二、数据模型

```ts
// 节点原始数据（存入 asyncDataLoader 缓存）
interface NodeData {
  id: string;
  type: 'folder' | 'file';
  name: string;
}
```

`asyncDataLoaderFeature` 内部维护两个 Map：
- `itemDataCache`：`itemId → NodeData`
- `childrenIdsCache`：`itemId → string[]`

我们不需要自己维护全局 state，直接通过 `item.updateCachedData()` / `item.updateCachedChildrenIds()` 操作缓存，再调 `tree.rebuildTree()` 触发重渲染。

---

## 三、懒加载策略

```
dataLoader.getChildrenWithData(folderId)
  → 调用 GET /collection/list?folderId=xxx
  → 返回 NodeData[]
```

- 根节点 id 固定为 `"root"`，`getChildrenWithData("root")` 时不传 folderId（或传 0）
- 每次展开文件夹时自动触发，已加载过的节点走缓存，不重复请求

补充一点：当前项目只对根节点做“分页展示”，不是在 `dataLoader` 层做服务端真分页。根节点首次加载时仍然一次拉全，之后只是在渲染层按 `visibleRootCount` 分批显示。

---

## 四、根节点分页策略

当前实现只分页一级节点，子节点仍保持原有懒加载。

流程是：

1. 根节点首次展开时一次拉全一级节点
2. 用 `visibleRootCount` 控制当前可见的根节点数量
3. 组件渲染时对 `rootItem.getChildren()` 做 `slice(0, visibleRootCount)`
4. 列表底部放哨兵元素，进入滚动容器可视区后触发 `loadMoreRootItems`

这意味着当前分页属于：

- 数据层全量加载
- 展示层渐进展开
- 触发层自动触底加载

如果要看复用边界和迁移步骤，直接看上面的分析文档。

---

## 五、拖拽移动策略

```
onDrop(draggedItems, target)
  → 调用 PUT /collection/move { id, targetFolderId }
  → 成功后：
      removeItemsFromParents(draggedItems, (parent, newIds) => {
        parent.updateCachedChildrenIds(newIds)
      })
      insertItemsAtTarget(ids, target, (parent, newIds) => {
        parent.updateCachedChildrenIds(newIds)
      })
      tree.rebuildTree()
```

`canDrop` 限制：只能拖入 folder 类型节点（`target.item.isFolder()`）。

---

## 六、真实后端接口

当前已经落成的真实接口如下：

- `POST /collection/folder`：新建文件夹
- `POST /collection/file`：新建文档
- `PUT /collection/folder/rename`：重命名文件夹
- `PUT /collection/file/rename`：重命名文档
- `PUT /collection/move`：移动文档或文件夹到目标文件夹
- `GET /collection/list?folderId=...`：获取某个文件夹下的直接子节点，不传 `folderId` 时读取根节点
- `DELETE /collection/file/:id`：删除文档
- `DELETE /collection/folder/:id`：删除文件夹及其全部子孙节点

后端使用 Node 原生 `http` 实现，数据保存在本地 JSON 文件中，重启服务后仍能保留上一次操作结果。

## 七、新建文件夹策略

1. 调用 `POST /collection/folder { name }` 获得新 `folderId`
2. 构造 `NodeData`，调 `tree.getItemInstance(parentId).updateCachedChildrenIds([...oldIds, newId])`
3. 同时 `tree.getItemInstance(newId).updateCachedData(newNodeData)`
4. `tree.rebuildTree()`

如果新建的是根节点，还会同步扩大 `visibleRootCount`，保证新增项立刻可见。

---

## 八、删除策略

1. 调用删除接口
2. 从父节点缓存中移除该 id：`parent.updateCachedChildrenIds(newIds)`
3. `tree.rebuildTree()`

如果删除的是根节点，还需要同步让分页状态收敛到新的可见范围。

---

## 九、重命名策略

使用 `renamingFeature`：
- 双击或右键节点触发 `item.startRenaming()`
- `onRename(item, value)` 中按节点类型调用文件夹 / 文档重命名接口
- 成功后同步更新本地缓存，并对父节点重新排序

---

## 十、关键 API 速查

```ts
// 懒加载
item.invalidateChildrenIds()          // 强制重新加载子节点
item.updateCachedChildrenIds(ids)     // 直接写入子节点缓存
item.updateCachedData(data)           // 直接写入节点数据缓存

// 树重建
tree.rebuildTree()                    // 数据变更后必须调用

// 拖拽工具函数
insertItemsAtTarget(ids, target, cb)  // 插入到目标位置
removeItemsFromParents(items, cb)     // 从原父节点移除

// 重命名
item.startRenaming()
item.getRenameInputProps()
tree.completeRenaming()
tree.abortRenaming()
```
