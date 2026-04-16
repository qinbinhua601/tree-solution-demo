# Headless Tree 整树刷新原因排查 Prompt

```md
请先不要改代码，先判断“为什么每次树操作后整棵树都会像刷新一遍”。

请按下面 7 类原因排查，并明确告诉我命中了哪一类：

1. 操作后重新拉整棵树，再整体 `setTreeData`
2. 每次操作后重建整份嵌套树对象
3. 树容器 / tree 实例因为 `key` 或依赖变化而 remount
4. 操作后把根节点或全局 children cache 整体失效
5. 展开态 / 选择态和数据源一起被整包替换
6. `tree.rebuildTree()` 调用过于粗暴或过于频繁
7. 节点 `key` 不稳定，导致大量节点被重新挂载

请优先查看：
- 树的核心 hook / store / adapter
- `useTree(...)`、`dataLoader`、`getChildrenWithData`
- 新建 / 删除 / 重命名 / 拖拽 的实现入口
- Tree 容器组件和 TreeItem 组件
- API 层里获取整棵树或刷新树的方法
- 展开态相关代码
- 是否有变化频繁的 `key`

请重点搜索这些关键词：
`fetchWholeTree` `getTree` `setTreeData` `refreshTree` `reloadTree` `invalidate` `rebuildTree` `useTree` `getChildrenWithData` `expandedKeys` `expandedItems` `key=`

请最终输出：
- 最可能命中的原因编号
- 对应的关键文件
- 触发“整棵树刷新感”的旧更新路径
- 为什么它会导致整树像重刷
- 最小改法应该是什么
```
