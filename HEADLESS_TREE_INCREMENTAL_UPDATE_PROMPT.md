# Headless Tree 增量更新改造 Prompt

```md
请在当前基于 `@headless-tree/core` / `@headless-tree/react` 的树项目中，完成一次“从全量刷新改为局部增量更新”的改造。

已知前提：
- 当前项目已经有完整的树相关接口
- 当前项目已经有一个可工作的树实现
- 但现在在“新建、删除、重命名、拖拽移动”等操作后，整个树看起来会重新刷新一遍

本次改造目标：
- 不再在每次操作后重新请求整棵树并整体替换树数据
- 改成只更新“当前节点 + 受影响父节点 + 必要祖先”
- 尽量保持现有交互不变
- 减少无关分支的重新渲染、重新请求、展开态抖动和整树闪动感

你需要先检查当前项目是否存在以下典型实现：

```ts
await api.xxx()
const nextWholeTree = await api.fetchWholeTree()
setTreeData(nextWholeTree)
```

或者其他等价的“操作后整树重拉 / 整树重建 / 整树替换 state”写法。

如果存在，请将它们改造成局部更新方案。

实现约束：
- 不要为了这次改造引入服务端真分页
- 不要重写现有业务接口层
- 不要把逻辑散落到多个组件里
- 优先把增量更新逻辑收敛到树 hook、store 或 tree adapter 层
- 不要给树容器增加变化频繁的 `key`
- 不要每改一个节点就调用一次 `tree.rebuildTree()`
- 保留现有懒加载、展开、选择、拖拽、重命名等已有能力

建议的实现方向：

1. 建立或补齐节点缓存与父子关系缓存
   至少需要具备：
   - `itemId -> NodeData`
   - `folderId -> childrenIds`

2. 在 tree 适配层补出这几个核心能力
   - `writeItemCache(data)`
   - `removeItemCache(itemId)`
   - `syncFolderChildren(folderId)`
   - `refreshFoldersFromServer(folderIds)`
   - 如有祖先统计信息，支持自动向上收集祖先并刷新

3. 各类操作按下面方式改造

   - 重命名：
     - 不要刷新整棵树
     - 只更新当前节点缓存
     - 如果同级排序依赖名称，再更新父节点 `childrenIds`
     - 最后统一 `tree.rebuildTree()`

   - 新建：
     - 不要刷新整棵树
     - 调用创建接口后，只刷新“新节点所在父节点”
     - 如祖先有数量、汇总、计数展示，再补刷新必要祖先

   - 删除：
     - 不要刷新整棵树
     - 删除后移除本地缓存
     - 如果删除的是文件夹，递归清理已加载子孙缓存
     - 然后只刷新原父节点和必要祖先

   - 拖拽移动：
     - 不要刷新整棵树
     - 移动后只刷新原父节点和目标父节点
     - 如祖先展示聚合信息，再补刷新必要祖先

4. 将刷新粒度从“全树”收敛为“受影响分支”
   受影响分支通常包括：
   - 当前节点
   - 原父节点
   - 新父节点
   - 必要祖先

推荐的伪代码结构如下：

```ts
const treeRef = useRef<TreeInstance<NodeData> | null>(null);
const itemDataCacheRef = useRef<Record<string, NodeData>>({
  [ROOT_ID]: { id: ROOT_ID, type: 'folder', name: 'root', parentId: null },
});

function writeItemCache(data: NodeData) {
  itemDataCacheRef.current[data.id] = data;
  treeRef.current?.getItemInstance(data.id).updateCachedData(data);
}

function removeItemCache(itemId: string) {
  delete itemDataCacheRef.current[itemId];
}

async function syncFolderChildren(folderId: string) {
  const nodes = await fetchChildren(folderId === ROOT_ID ? undefined : folderId);
  nodes.forEach(writeItemCache);

  treeRef.current
    ?.getItemInstance(folderId)
    .updateCachedChildrenIds(sortChildIds(nodes.map((node) => node.id)));
}

function collectAncestorFolderIds(folderIds: string[]) {
  // 基于 itemDataCacheRef.current 中的 parentId 向上收集祖先
}

async function refreshFoldersFromServer(folderIds: string[]) {
  const relatedIds = collectAncestorFolderIds(folderIds);

  for (const folderId of relatedIds) {
    await syncFolderChildren(folderId);
  }

  treeRef.current?.rebuildTree();
}

async function renameItem(item: ItemInstance<NodeData>, nextName: string) {
  const nextData = await api.rename(item.getId(), nextName);
  writeItemCache(nextData);
  item.updateCachedData(nextData);

  const parent = item.getParent();
  if (parent) {
    parent.updateCachedChildrenIds(
      sortChildIds(parent.getChildren().map((child) => child.getId())),
    );
  }

  treeRef.current?.rebuildTree();
}

async function createUnderParent(parentId: string, payload: CreatePayload) {
  await api.create(payload, parentId);
  await refreshFoldersFromServer([parentId]);
}

async function removeTreeItem(item: ItemInstance<NodeData>) {
  const parentId = item.getParent()?.getId() ?? ROOT_ID;
  await api.remove(item.getId());
  removeItemCache(item.getId());
  await refreshFoldersFromServer([parentId]);
}

async function moveTreeItem(item: ItemInstance<NodeData>, targetFolderId: string) {
  const sourceParentId = item.getParent()?.getId() ?? ROOT_ID;
  await api.move(item.getId(), targetFolderId);
  await refreshFoldersFromServer([sourceParentId, targetFolderId]);
}
```

如果当前项目不是直接使用 `headless-tree` 的内部缓存，而是自己有 Zustand / Redux / 自研 store，也请保留同样的更新思路：
- 不要维护“每次都整体替换”的完整嵌套树作为唯一真相
- 优先使用：
  - `nodesById`
  - `childrenIdsByParentId`
- 每次操作后只更新受影响的几项

推荐改造顺序：

1. 先改“重命名”
   原因：
   - 最容易做成纯局部更新
   - 最容易验证整树是否还会闪

2. 再改“新建 / 删除”
   原因：
   - 主要影响父节点 children 列表
   - 改造复杂度适中

3. 最后改“拖拽移动”
   原因：
   - 涉及原父节点和目标父节点两边同步
   - 逻辑最复杂

验收标准：
- 重命名后，只有当前节点文案变化；无关分支不闪、不重新请求
- 新建后，新节点只出现在对应父节点下；无关分支不闪
- 删除后，只在原父节点下消失；无关分支不闪
- 拖拽移动后，只影响原父节点和目标父节点；无关分支不闪
- 已展开的无关分支不收起
- 懒加载逻辑不回归
- 现有拖拽、选择、重命名能力不回归
- 不再存在“操作一次后整棵树像重刷”的明显感知

请在完成后输出：
- 你识别到的“导致整树刷新的旧实现路径”是什么
- 你把增量更新逻辑放到了哪些文件 / 模块
- 各操作分别改成了怎样的局部更新路径
- 还有哪些残留风险或后续可继续优化的点
```
