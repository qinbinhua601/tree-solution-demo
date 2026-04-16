# Headless Tree 增量更新迁移说明

## 这份文档解决什么问题

如果另一个项目已经有：

- 完整的树相关接口
- 现有的树组件和交互
- 一个“能用但每次操作后整棵树看起来都刷新”的实现

那么这份文档的目标是：

- 帮它理解当前 demo 避免“整棵树重刷”的核心思路
- 指出哪些能力值得迁移，哪些不要照搬
- 给出一套最小改造路径，让它可以逐步改成“只更新受影响分支”

这不是一份分页方案文档。

虽然当前 demo 里也有“根节点渐进分页”，但对另一个项目真正有价值的，是“操作后只同步受影响节点和受影响父节点”的增量更新策略。

---

## 先说结论

如果一个树项目在“新建、删除、重命名、拖拽移动”之后，整个树都像重新加载了一遍，通常是因为它用了下面这种更新方式：

```ts
await api.xxx()
const nextWholeTree = await api.fetchWholeTree()
setTreeData(nextWholeTree)
```

这种写法的问题不是“功能错了”，而是它会带来这些现象：

- 所有节点都会重新走一遍渲染
- 展开状态、局部加载感、滚动位置更容易抖动
- 用户会感觉“整棵树闪了一下”
- 代码会越来越依赖“每次操作后全量重取”

当前 demo 的思路是换成下面这种模式：

```ts
await api.xxx()
await refreshFoldersFromServer([affectedFolderId1, affectedFolderId2])
tree.rebuildTree()
```

也就是：

1. 操作成功后，不重新拉整棵树
2. 只刷新受影响的父节点，必要时补刷新祖先节点
3. 当前节点数据能本地改的就本地改
4. 最后统一做一次 `tree.rebuildTree()`

---

## 当前 demo 真正可迁移的部分

当前项目里最值得迁移的不是“根节点分页”，而是下面这几个能力：

- 节点数据缓存：`itemId -> NodeData`
- 子节点列表缓存：`folderId -> childrenIds`
- 只刷新指定文件夹：`syncFolderChildren(folderId)`
- 批量刷新受影响分支：`refreshFoldersFromServer(folderIds)`
- 本地直接补丁节点数据：`item.updateCachedData(data)`
- 本地直接补丁子节点顺序：`item.updateCachedChildrenIds(ids)`
- 数据更新完成后统一 `tree.rebuildTree()`

在当前仓库里，对应参考点主要在这里：

- [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:49)
- 尤其是 `syncFolderChildren` / `refreshFoldersFromServer` [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:117)
- 重命名只更新当前节点和父节点排序 [src/hooks/useCollectionTree.ts](/Users/alexq/Desktop/digging/tree-solution-demo/src/hooks/useCollectionTree.ts:361)

---

## 不要照搬的部分

如果另一个项目没有根节点分页需求，下面这些都不要硬搬：

- `visibleRootCount`
- 根节点 `slice`
- 底部哨兵和自动加载更多
- 根目录分页状态收敛逻辑

这些是 demo 为了“根节点渐进展示”加的，不是解决“整棵树刷新”的必要条件。

换句话说：

- “局部更新”是这次迁移的核心
- “根节点分页”只是 demo 里的附加能力

---

## 迁移目标

改造后的另一个项目，理想状态应该是：

- 新建子节点后，只有对应父文件夹的子列表变化
- 删除节点后，只有原父文件夹和必要祖先信息变化
- 重命名节点后，只有当前节点文案变化；如果排序依赖名称，再更新父级顺序
- 拖拽移动后，只影响原父级和新父级
- 已展开但无关的分支不闪、不收起、不重新请求

用户感知上会从：

- “整个树刷新了一下”

变成：

- “只是我刚操作的那一支更新了”

---

## 推荐的数据责任拆分

建议把另一个项目的树逻辑拆成三层。

### 1. 接口层

只负责调用后端接口，不负责拼树、不负责全量重建 state。

例如：

- `fetchChildren(folderId)`
- `createFolder(name, parentId)`
- `deleteNode(id)`
- `renameNode(id, name)`
- `moveNode(id, targetFolderId)`

### 2. Tree 适配层

这是这次改造最关键的一层。

它负责：

- 持有本地节点缓存
- 把接口返回结果写回 `headless-tree` 的缓存
- 只刷新受影响文件夹
- 为 CRUD / 拖拽提供统一的更新入口

建议把主要逻辑都收敛在这里，不要散到各个组件里。

### 3. 组件层

只负责渲染、绑定事件、调用适配层动作。

组件层不要做这些事：

- 每次操作后自己重新请求整棵树
- 自己维护整棵树的嵌套结构
- 用一个大 `setState(nextWholeTree)` 把整棵树替换掉

---

## 迁移时的核心原则

### 原则 1：不要把“树结构”当成唯一真相

不要继续维护一份完整嵌套树对象作为渲染主数据源，例如：

```ts
type TreeNode = {
  id: string;
  name: string;
  children: TreeNode[];
};
```

如果每次操作都依赖“重建整棵嵌套树”，就很难做到局部更新。

更适合 `headless-tree` 的方式是：

- 单节点数据缓存：`itemDataCache`
- 父子关系缓存：`childrenIdsCache`

### 原则 2：能局部补丁，就不要全量重拉

例如重命名时，通常不需要重新请求整个父级，更不需要请求全树。

只要：

```ts
item.updateCachedData(nextData)
```

如果排序依赖名称，再补一次：

```ts
parent.updateCachedChildrenIds(sortedIds)
```

### 原则 3：刷新“父节点”，而不是刷新“当前节点子树之外的一切”

新建、删除、移动，本质上改变的都是某个父节点的 `childrenIds`。

因此最常见的刷新单位应该是：

- 原父节点
- 新父节点
- 必要时它们的祖先节点统计信息

### 原则 4：最后统一 rebuild

一轮缓存变更做完后，再统一：

```ts
tree.rebuildTree()
```

不要每改一个节点就 rebuild 一次。

---

## 建议直接补出来的最小能力

如果另一个项目现在已经有接口，也已经接了 `headless-tree`，建议先补下面这几个函数。

### 1. 写节点缓存

```ts
function writeItemCache(data: NodeData) {
  itemDataCacheRef.current[data.id] = data;
  treeRef.current?.getItemInstance(data.id).updateCachedData(data);
}
```

作用：

- 保存节点最新数据
- 同步写进 `headless-tree` 的 item cache

### 2. 刷新单个文件夹的子节点

```ts
async function syncFolderChildren(folderId: string) {
  const nodes = await fetchChildren(folderId === ROOT_ID ? undefined : folderId);
  const tree = treeRef.current;

  nodes.forEach(writeItemCache);
  tree?.getItemInstance(folderId).updateCachedChildrenIds(
    sortChildIds(nodes.map((node) => node.id)),
  );
}
```

作用：

- 用服务端返回结果覆盖指定父节点的子节点列表
- 不波及无关分支

### 3. 批量刷新受影响文件夹

```ts
async function refreshFoldersFromServer(folderIds: string[]) {
  const relatedFolderIds = collectAncestorFolderIds(folderIds);

  for (const folderId of relatedFolderIds) {
    await syncFolderChildren(folderId);
  }

  treeRef.current?.rebuildTree();
}
```

作用：

- 把多个受影响父级统一刷新
- 如果祖先节点有计数、汇总信息，也顺手同步

### 4. 删除本地缓存

```ts
function removeItemCache(itemId: string) {
  delete itemDataCacheRef.current[itemId];
}
```

如果删除的是文件夹，建议递归删掉它已加载的子孙缓存。

---

## 各类操作应该怎么改

下面是最关键的迁移映射。

### 一、新建

#### 旧实现里常见写法

```ts
await createNode(...)
const wholeTree = await fetchWholeTree()
setTreeData(wholeTree)
```

#### 建议改成

```ts
await createNode(...)
await refreshFoldersFromServer([parentId])
```

#### 原理

新建真正变化的是：

- 父节点的 `childrenIds`
- 新节点本身的数据

只要重新拉一遍这个父节点的直接子节点列表，就够了。

#### 什么时候要补祖先刷新

如果祖先节点上展示了这类信息，就要顺带刷新祖先：

- 文档总数
- 子树数量
- 聚合状态

这时就不要只刷 `parentId`，而是刷：

```ts
refreshFoldersFromServer([parentId])
```

并让它内部自动向上收集祖先。

### 二、删除

#### 建议改成

```ts
await deleteNode(itemId)
removeItemCache(itemId)
await refreshFoldersFromServer([parentId])
```

如果删的是文件夹：

- 递归移除已加载的子孙缓存
- 再刷新原父节点

#### 原理

删除真正变化的是：

- 原父节点的孩子列表少了一个
- 相关祖先统计可能变化

不需要重拉无关节点。

### 三、重命名

这是最适合做本地补丁的一类操作。

#### 建议改成

```ts
const nextData = await renameNode(itemId, nextName);
writeItemCache(nextData);
item.updateCachedData(nextData);

if (parent && sortDependsOnName) {
  parent.updateCachedChildrenIds(sortChildIds(parent.getChildren().map((child) => child.getId())));
}

tree.rebuildTree();
```

#### 原理

重命名一般不会改变树结构，只会改变：

- 当前节点显示名称
- 可能影响同级排序

所以这是最不应该触发“整棵树刷新”的操作。

### 四、拖拽移动

这是最容易误写成“全量刷新”的操作，但其实也能局部处理。

#### 建议改成

```ts
await moveNode(itemId, targetFolderId)
await refreshFoldersFromServer([sourceParentId, targetFolderId])
```

#### 原理

移动真正变化的是：

- 原父节点少了一个孩子
- 新父节点多了一个孩子
- 被移动节点自身的 `parentId` 变了

因此只需要刷新：

- 原父级
- 新父级
- 必要时它们的祖先

---

## 如果另一个项目不是直接用 headless-tree 缓存，而是自己有 store

也可以迁移思路，不一定非要照搬 API。

关键不是某个方法名，而是“更新粒度”。

即使项目是 Zustand、Redux 或自研 store，也建议改成这种数据结构：

```ts
type NodeMap = Record<string, NodeData>;
type ChildrenMap = Record<string, string[]>;
```

而不是：

```ts
type WholeTreeState = TreeNode[];
```

然后每次操作只改：

- `nodes[itemId]`
- `children[parentId]`
- `children[targetParentId]`

这样就算不用 `headless-tree` 内建缓存，整体思路也是一致的。

---

## 一套建议的改造顺序

为了降低风险，不要一下子把所有动作都重写，建议按下面顺序推进。

### 第一步：先把“重命名”改成局部更新

原因：

- 改造最简单
- 风险最低
- 最容易验证“整棵树是否还会闪”

验收标准：

- 改名后节点文案立刻变
- 无关分支不重载
- 已展开状态不受影响

### 第二步：把“新建 / 删除”改成只刷新父节点

原因：

- 新建删除本质上只影响父节点子列表
- 改造成本可控

验收标准：

- 新建后新节点只出现在对应父级下
- 删除后只在原父级消失
- 无关兄弟分支不闪

### 第三步：把“拖拽移动”改成只刷新原父级和目标父级

原因：

- 逻辑最复杂
- 涉及两个父级和拖拽态

验收标准：

- 被拖走的节点从原父级消失
- 在目标父级出现
- 无关分支不重新加载

---

## 常见反模式

如果另一个项目里看到下面这些写法，基本就是“整棵树刷新感”产生的来源。

### 反模式 1：操作后重新请求整棵树

```ts
await api.xxx()
const tree = await api.getAllTree()
setTreeData(tree)
```

### 反模式 2：给树容器绑定变化频繁的 key

例如：

```tsx
<Tree key={Date.now()} />
```

或者：

```tsx
<Tree key={JSON.stringify(treeData)} />
```

这样会导致整个树组件 remount。

### 反模式 3：把展开状态和数据源一起整包替换

例如每次 `setState({ treeData, expandedKeys })` 都生成一份全新大对象。

这会让局部更新价值被抹平。

### 反模式 4：一个操作里多次 rebuild

例如：

```ts
item.updateCachedData(...)
tree.rebuildTree()
parent.updateCachedChildrenIds(...)
tree.rebuildTree()
```

更推荐：

```ts
item.updateCachedData(...)
parent.updateCachedChildrenIds(...)
tree.rebuildTree()
```

---

## 判断改造是否成功的观察点

可以不用性能工具，先用肉眼和日志判断。

### 肉眼观察

- 改名时，只有当前节点文字变化
- 新建时，只有目标父级展开区域变化
- 删除时，无关区域不闪
- 拖拽后，只有原父级和新父级变化

### 日志观察

在这些地方打印日志：

- `fetchChildren(folderId)`
- `refreshFoldersFromServer(folderIds)`
- 组件 render

理想情况是：

- 改名时不应触发全树所有文件夹的 `fetchChildren`
- 新建 / 删除时只会看到受影响父级相关日志
- 拖拽时最多出现原父级和目标父级相关刷新

---

## 一个适合直接抄过去的伪代码骨架

下面这段不是要一字不差照搬，而是建议另一个项目按这个职责结构落地。

```ts
const treeRef = useRef<TreeInstance<NodeData> | null>(null);
const itemDataCacheRef = useRef<Record<string, NodeData>>({
  [ROOT_ID]: { id: ROOT_ID, name: 'root', type: 'folder', parentId: null },
});

function writeItemCache(data: NodeData) {
  itemDataCacheRef.current[data.id] = data;
  treeRef.current?.getItemInstance(data.id).updateCachedData(data);
}

function removeItemCache(id: string) {
  delete itemDataCacheRef.current[id];
}

async function syncFolderChildren(folderId: string) {
  const nodes = await fetchChildren(folderId === ROOT_ID ? undefined : folderId);
  nodes.forEach(writeItemCache);
  treeRef.current
    ?.getItemInstance(folderId)
    .updateCachedChildrenIds(sortChildIds(nodes.map((node) => node.id)));
}

function collectAncestorFolderIds(folderIds: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const folderId of folderIds) {
    let currentId: string | null = folderId;

    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      result.push(currentId);
      currentId = itemDataCacheRef.current[currentId]?.parentId ?? ROOT_ID;

      if (currentId === ROOT_ID && !seen.has(ROOT_ID)) {
        seen.add(ROOT_ID);
        result.push(ROOT_ID);
        break;
      }
    }
  }

  return result;
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

async function removeItem(item: ItemInstance<NodeData>) {
  const parentId = item.getParent()?.getId() ?? ROOT_ID;
  await api.remove(item.getId());
  removeItemCache(item.getId());
  await refreshFoldersFromServer([parentId]);
}

async function moveItem(item: ItemInstance<NodeData>, targetFolderId: string) {
  const sourceParentId = item.getParent()?.getId() ?? ROOT_ID;
  await api.move(item.getId(), targetFolderId);
  await refreshFoldersFromServer([sourceParentId, targetFolderId]);
}
```

---

## 给另一个项目的最小实施建议

如果它想最低成本验证这套思路，建议只做这三件事：

1. 在树 hook 或 store 里补出 `writeItemCache`、`syncFolderChildren`、`refreshFoldersFromServer`
2. 把“重命名”改成只更新当前节点和父级排序
3. 把“新建 / 删除 / 移动”改成只刷新受影响父级，而不是全量刷新

只要这三步生效，用户对“整棵树在刷”的感知通常就会明显下降。

---

## 这份 demo 可以当作什么参考

当前仓库可以作为“局部更新思路参考”，但不建议整个复制过去。

原因是它还包含当前 demo 自己的业务耦合：

- 根节点渐进分页
- 根目录统计信息
- 内联创建临时节点
- 当前 demo 的排序规则和交互细节

另一个项目更适合借鉴的是：

- 缓存组织方式
- 受影响分支刷新方式
- CRUD 的更新粒度

而不是照抄全部实现。

---

## 最后一句话总结

这次迁移真正要同步给另一个项目的，不是“怎么重新请求整棵树”，而是：

**把每次操作后的更新单位，从“全树”改成“当前节点 + 受影响父节点 + 必要祖先”。**

只要它做到这一点，整棵树“每次都刷新一下”的问题，通常就会明显改善。
