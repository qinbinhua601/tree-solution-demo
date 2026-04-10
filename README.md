# 文档收藏夹树 — 技术方案

## 目录结构

```
solution/
├── README.md              ← 本文档（方案说明）
└── src/
    ├── api/
    │   └── collection.ts  ← 接口封装
    ├── hooks/
    │   └── useCollectionTree.ts  ← 树数据逻辑 hook
    └── components/
        ├── CollectionTree.tsx    ← 树容器组件
        └── TreeItem.tsx          ← 单个节点渲染
```

---

## 一、库能力映射

| 需求 | 使用的 headless-tree 能力 |
|------|--------------------------|
| 懒加载子节点 | `asyncDataLoaderFeature` + `dataLoader.getChildrenWithData` |
| 拖拽移动 | `dragAndDropFeature` + `onDrop` + `insertItemsAtTarget` / `removeItemsFromParents` |
| 键盘拖拽 | `keyboardDragAndDropFeature` |
| 文件夹重命名 | `renamingFeature` + `onRename` |
| 新建/删除节点 | 操作本地缓存后调 `item.invalidateChildrenIds()` + `tree.rebuildTree()` |

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
  → 返回 { id, data: NodeData }[]
```

- 根节点 id 固定为 `"root"`，`getChildrenWithData("root")` 时不传 folderId（或传 0）
- 每次展开文件夹时自动触发，已加载过的节点走缓存，不重复请求

---

## 四、拖拽移动策略

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

## 五、新建文件夹策略

1. 调用 `POST /collection/folder { name }` 获得新 `folderId`
2. 构造 `NodeData`，调 `tree.getItemInstance(parentId).updateCachedChildrenIds([...oldIds, newId])`
3. 同时 `tree.getItemInstance(newId).updateCachedData(newNodeData)`
4. `tree.rebuildTree()`

---

## 六、删除策略

1. 调用删除接口
2. 从父节点缓存中移除该 id：`parent.updateCachedChildrenIds(newIds)`
3. `tree.rebuildTree()`

---

## 七、重命名策略

使用 `renamingFeature`：
- 双击节点触发 `item.startRenaming()`
- `onRename(item, value)` 中调用 `PUT /collection/folder { folderId, name }`
- 成功后 `item.updateCachedData({ ...item.getItemData(), name: value })`

---

## 八、关键 API 速查

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
