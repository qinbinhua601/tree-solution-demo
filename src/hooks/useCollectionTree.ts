// src/hooks/useCollectionTree.ts
// 树数据逻辑 hook：封装 asyncDataLoader、拖拽、CRUD 操作

import { useCallback, useRef } from 'react';
import {
  asyncDataLoaderFeature,
  dragAndDropFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  hotkeysCoreFeature,
  insertItemsAtTarget,
  removeItemsFromParents,
  type ItemInstance,
  type DragTarget,
  type TreeInstance,
} from '@headless-tree/core';
import { useTree } from '@headless-tree/react';

import {
  fetchChildren,
  deleteFolder,
  deleteFile,
  moveNode,
  renameFolder,
  createFolder,
  createFile,
  type NodeData,
} from '../api/collection';

export const ROOT_ID = 'root';

export function useCollectionTree() {
  // 保存 tree 实例引用，供 CRUD 操作使用
  const treeRef = useRef<TreeInstance<NodeData> | null>(null);
  const itemDataCacheRef = useRef<Record<string, NodeData>>({
    [ROOT_ID]: { id: ROOT_ID, type: 'folder', name: 'root' },
  });

  const writeItemCache = useCallback((data: NodeData) => {
    itemDataCacheRef.current[data.id] = data;
  }, []);

  const removeItemCache = useCallback((itemId: string) => {
    delete itemDataCacheRef.current[itemId];
  }, []);

  const removeItemCacheTree = useCallback((item: ItemInstance<NodeData>) => {
    for (const child of item.getChildren()) {
      removeItemCacheTree(child);
    }
    removeItemCache(item.getId());
  }, [removeItemCache]);

  // ── dataLoader ──────────────────────────────────────────────────────────────
  const dataLoader = {
    /** 获取节点自身数据（已在 getChildrenWithData 中写入缓存，这里只做兜底） */
    getItem: (itemId: string): NodeData => {
      return itemDataCacheRef.current[itemId] ?? { id: itemId, type: 'folder', name: itemId };
    },

    /** 懒加载子节点：调接口，返回 { id, data }[] */
    getChildrenWithData: async (
      itemId: string,
    ): Promise<{ id: string; data: NodeData }[]> => {
      const folderId = itemId === ROOT_ID ? undefined : itemId;
      const nodes = await fetchChildren(folderId);
      nodes.forEach(writeItemCache);
      return nodes.map((n) => ({ id: n.id, data: n }));
    },
  };

  // ── 拖拽 onDrop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (items: ItemInstance<NodeData>[], target: DragTarget<NodeData>) => {
      const tree = treeRef.current;
      if (!tree) return;

      // 确定目标文件夹 id
      const targetFolderId =
        'childIndex' in target
          ? target.item.getId()   // 插入到文件夹内部
          : target.item.getParent()?.getId() ?? ROOT_ID;

      // 逐个调移动接口（通常只拖一个）
      await Promise.all(items.map((item) => moveNode(item.getId(), targetFolderId)));

      // 更新本地缓存
      await removeItemsFromParents(items, (parent, newIds) => {
        parent.updateCachedChildrenIds(newIds);
      });
      await insertItemsAtTarget(
        items.map((i) => i.getId()),
        target,
        (parent, newIds) => {
          parent.updateCachedChildrenIds(newIds);
        },
      );

      tree.rebuildTree();
    },
    [],
  );

  // ── canDrop：只允许拖入文件夹 ────────────────────────────────────────────────
  const canDrop = useCallback(
    (_items: ItemInstance<NodeData>[], target: DragTarget<NodeData>) => {
      // 如果是"插入到某位置"，target.item 是父文件夹
      return target.item.isFolder();
    },
    [],
  );

  // ── renamingFeature 回调 ─────────────────────────────────────────────────────
  const onRename = useCallback(
    async (item: ItemInstance<NodeData>, value: string) => {
      await renameFolder(item.getId(), value);
      const nextData = { ...item.getItemData(), name: value };
      writeItemCache(nextData);
      item.updateCachedData(nextData);
    },
    [writeItemCache],
  );

  const canRename = useCallback(
    (item: ItemInstance<NodeData>) => item.getItemData()?.type === 'folder',
    [],
  );

  // ── useTree ──────────────────────────────────────────────────────────────────
  const tree = useTree<NodeData>({
    rootItemId: ROOT_ID,
    initialState: {
      expandedItems: [ROOT_ID],
    },
    getItemName: (item) => item.getItemData()?.name ?? '',
    isItemFolder: (item) => item.getItemData()?.type === 'folder',
    dataLoader,
    canReorder: false,   // 不需要同级排序，只需拖入文件夹
    onDrop,
    canDrop,
    onRename,
    canRename,
    indent: 16,
    features: [
      asyncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
      keyboardDragAndDropFeature,
      renamingFeature,
    ],
  });

  // 保存引用
  treeRef.current = tree;

  // ── CRUD 操作 ────────────────────────────────────────────────────────────────

  /** 新建根目录文件夹 */
  const addRootFolder = useCallback(async (name: string) => {
    const newId = await createFolder(name);
    const newData: NodeData = { id: newId, type: 'folder', name };
    const root = tree.getItemInstance(ROOT_ID);
    const oldIds = root.getChildren().map((c) => c.getId());
    writeItemCache(newData);
    root.updateCachedData(itemDataCacheRef.current[ROOT_ID]);
    tree.getItemInstance(newId).updateCachedData(newData);
    root.updateCachedChildrenIds([...oldIds, newId]);
    tree.rebuildTree();
  }, [tree, writeItemCache]);

  /** 新建子文件夹到指定父文件夹 */
  const addSubFolder = useCallback(
    async (parentId: string, name: string) => {
      const newId = await createFolder(name, parentId);
      const newData: NodeData = { id: newId, type: 'folder', name };
      const parent = tree.getItemInstance(parentId);
      const oldIds = parent.getChildren().map((c) => c.getId());
      writeItemCache(newData);
      tree.getItemInstance(newId).updateCachedData(newData);
      parent.updateCachedChildrenIds([...oldIds, newId]);
      tree.rebuildTree();
    },
    [tree, writeItemCache],
  );

  /** 删除文件夹 */
  const removeFolder = useCallback(
    async (item: ItemInstance<NodeData>) => {
      await deleteFolder(item.getId());
      const parent = item.getParent();
      if (!parent) return;
      removeItemCacheTree(item);
      const newIds = parent.getChildren()
        .filter((c) => c.getId() !== item.getId())
        .map((c) => c.getId());
      parent.updateCachedChildrenIds(newIds);
      tree.rebuildTree();
    },
    [removeItemCacheTree, tree],
  );

  /** 删除文件 */
  const removeFile = useCallback(
    async (item: ItemInstance<NodeData>) => {
      await deleteFile(item.getId());
      const parent = item.getParent();
      if (!parent) return;
      removeItemCache(item.getId());
      const newIds = parent.getChildren()
        .filter((c) => c.getId() !== item.getId())
        .map((c) => c.getId());
      parent.updateCachedChildrenIds(newIds);
      tree.rebuildTree();
    },
    [removeItemCache, tree],
  );

  /** 新建文档（调用方自行提供 fileId 和 name，接口由业务层处理） */
  const addFile = useCallback(
    async (parentId: string, name: string) => {
      const fileId = await createFile(name, parentId);
      const newData: NodeData = { id: fileId, type: 'file', name };
      const parent = tree.getItemInstance(parentId);
      const oldIds = parent.getChildren().map((c) => c.getId());
      writeItemCache(newData);
      tree.getItemInstance(fileId).updateCachedData(newData);
      parent.updateCachedChildrenIds([...oldIds, fileId]);
      tree.rebuildTree();
    },
    [tree, writeItemCache],
  );

  return {
    tree,
    addRootFolder,
    addSubFolder,
    removeFolder,
    removeFile,
    addFile,
  };
}
