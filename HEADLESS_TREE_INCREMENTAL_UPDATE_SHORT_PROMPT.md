# Headless Tree 增量更新简短说明

```md
先不要急着改代码，请先定位“为什么每次树操作后整棵树都会像刷新一遍”。

请优先看：
- 树的核心 hook / store / adapter
- `useTree(...)`、`dataLoader`、`getChildrenWithData`
- 新建 / 删除 / 重命名 / 拖拽 的实现入口
- Tree 容器组件和 TreeItem 组件
- API 层里获取整棵树或刷新树的方法
- 展开态相关代码
- 是否给树容器传了会频繁变化的 `key`

请重点搜索这些关键词：
`useTree` `getChildrenWithData` `onDrop` `onRename` `setTreeData` `refreshTree` `reloadTree` `rebuildTree` `expandedKeys` `key=`

先输出：
- 是哪条旧更新路径导致整棵树刷新感
- 哪些文件最关键
- 新建 / 删除 / 重命名 / 拖拽分别应该如何改成“只更新当前节点 + 受影响父节点 + 必要祖先”

改造目标不是分页，而是把更新单位从“整棵树”改成“受影响分支”。
```
