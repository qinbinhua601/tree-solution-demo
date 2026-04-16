// src/hooks/useCollectionTree.ts
// 树数据逻辑 hook：封装 asyncDataLoader、拖拽、CRUD 操作

import { useCallback, useRef, useState } from 'react';
import {
  asyncDataLoaderFeature,
  dragAndDropFeature,
  keyboardDragAndDropFeature,
  renamingFeature,
  selectionFeature,
  hotkeysCoreFeature,
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
  renameFile,
  createFolder,
  createFile,
  type NodeData,
} from '../api/collection';

export const ROOT_ID = 'root';
const ROOT_PAGE_SIZE = 10;
const LOAD_MORE_DELAY = 300;

interface PendingCreationState {
  id: string;
  parentId: string;
  type: 'folder' | 'file';
  saving: boolean;
}

function getDropParentId(target: DragTarget<NodeData>) {
  return target.item.getId();
}

function getParentId(item: ItemInstance<NodeData>) {
  return item.getParent()?.getId() ?? ROOT_ID;
}

export function useCollectionTree() {
  // 保存 tree 实例引用，供 CRUD 操作使用
  const treeRef = useRef<TreeInstance<NodeData> | null>(null);
  const itemDataCacheRef = useRef<Record<string, NodeData>>({
    [ROOT_ID]: { id: ROOT_ID, type: 'folder', name: 'root', parentId: null, documentCount: 0 },
  });
  const rootLoadedRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const pendingCreationRef = useRef<PendingCreationState | null>(null);
  const [visibleRootCount, setVisibleRootCount] = useState(ROOT_PAGE_SIZE);
  const [, bumpRootVersion] = useState(0);
  const [isLoadingMoreRootItems, setIsLoadingMoreRootItems] = useState(false);
  const [, bumpPendingVersion] = useState(0);

  const writeItemCache = useCallback((data: NodeData) => {
    itemDataCacheRef.current[data.id] = data;
    treeRef.current?.getItemInstance(data.id).updateCachedData(data);
  }, []);

  const setPendingCreationState = useCallback((next: PendingCreationState | null) => {
    pendingCreationRef.current = next;
    bumpPendingVersion((version) => version + 1);
  }, []);

  const compareNodeIds = useCallback((leftId: string, rightId: string) => {
    const left = itemDataCacheRef.current[leftId];
    const right = itemDataCacheRef.current[rightId];

    if (!left || !right) return 0;
    if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;

    return left.name.localeCompare(right.name, 'zh-CN');
  }, []);

  const sortChildIds = useCallback((ids: string[]) => {
    return [...ids].sort(compareNodeIds);
  }, [compareNodeIds]);

  const removeItemCache = useCallback((itemId: string) => {
    delete itemDataCacheRef.current[itemId];
  }, []);

  const removeItemCacheTree = useCallback((item: ItemInstance<NodeData>) => {
    for (const child of item.getChildren()) {
      removeItemCacheTree(child);
    }
    removeItemCache(item.getId());
  }, [removeItemCache]);

  const removePendingCreationNode = useCallback((pending: PendingCreationState) => {
    const tree = treeRef.current;
    const parent = tree?.getItemInstance(pending.parentId);

    if (parent) {
      parent.updateCachedChildrenIds(
        parent.getChildren()
          .filter((child) => child.getId() !== pending.id)
          .map((child) => child.getId()),
      );
    }

    removeItemCache(pending.id);
    tree?.rebuildTree();
  }, [removeItemCache]);

  const syncFolderChildren = useCallback(async (
    folderId: string,
    options?: { rootVisibleDelta?: number },
  ) => {
    const nodes = await fetchChildren(folderId === ROOT_ID ? undefined : folderId);
    const tree = treeRef.current;

    nodes.forEach(writeItemCache);
    tree?.getItemInstance(folderId).updateCachedChildrenIds(sortChildIds(nodes.map((node) => node.id)));

    if (folderId === ROOT_ID) {
      rootLoadedRef.current = true;
      writeItemCache({
        ...itemDataCacheRef.current[ROOT_ID],
        documentCount: nodes.reduce((total, node) => total + node.documentCount, 0),
      });
      setVisibleRootCount((count) => {
        if (nodes.length === 0) {
          return ROOT_PAGE_SIZE;
        }

        const clamped = Math.min(count, nodes.length);
        const nextCount = options?.rootVisibleDelta && nodes.length > clamped
          ? Math.min(clamped + options.rootVisibleDelta, nodes.length)
          : clamped;

        return Math.max(nextCount, Math.min(ROOT_PAGE_SIZE, nodes.length));
      });
      bumpRootVersion((version) => version + 1);
    }
  }, [sortChildIds, writeItemCache]);

  const collectAncestorFolderIds = useCallback((folderIds: string[]) => {
    const seen = new Set<string>();
    const result: string[] = [];

    folderIds.forEach((folderId) => {
      let currentId: string | null = folderId;

      while (currentId && !seen.has(currentId)) {
        seen.add(currentId);
        result.push(currentId);

        if (currentId === ROOT_ID) {
          break;
        }

        currentId = itemDataCacheRef.current[currentId]?.parentId ?? ROOT_ID;
      }
    });

    return result;
  }, []);

  const refreshFoldersFromServer = useCallback(async (
    folderIds: string[],
    options?: { rootVisibleDelta?: number },
  ) => {
    const ancestorFolderIds = collectAncestorFolderIds(folderIds);

    for (const folderId of ancestorFolderIds) {
      await syncFolderChildren(folderId, {
        rootVisibleDelta: folderId === ROOT_ID ? options?.rootVisibleDelta : undefined,
      });
    }

    treeRef.current?.rebuildTree();
  }, [collectAncestorFolderIds, syncFolderChildren]);

  const cancelPendingCreation = useCallback((tempId?: string) => {
    const pending = pendingCreationRef.current;
    if (!pending) return;
    if (tempId && pending.id !== tempId) return;

    setPendingCreationState(null);
    removePendingCreationNode(pending);
  }, [removePendingCreationNode, setPendingCreationState]);

  const startPendingCreation = useCallback(async (
    parentId: string,
    type: 'folder' | 'file',
  ) => {
    cancelPendingCreation();

    const tree = treeRef.current;
    if (!tree) return;

    const parent = tree.getItemInstance(parentId);
    if (!parent.isExpanded()) {
      parent.expand();
      await tree.waitForItemChildrenLoaded(parentId);
    }

    const tempId = `pending-${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tempData: NodeData = {
      id: tempId,
      type,
      name: '',
      parentId: parentId === ROOT_ID ? null : parentId,
      documentCount: 0,
      isPendingCreation: true,
    };

    writeItemCache(tempData);
    parent.updateCachedChildrenIds([...parent.getChildren().map((child) => child.getId()), tempId]);
    setPendingCreationState({
      id: tempId,
      parentId,
      type,
      saving: false,
    });
    tree.rebuildTree();
  }, [cancelPendingCreation, setPendingCreationState, writeItemCache]);

  const submitPendingCreation = useCallback(async (tempId: string, rawName: string) => {
    const pending = pendingCreationRef.current;
    if (!pending || pending.id !== tempId || pending.saving) {
      return;
    }

    const name = rawName.trim();
    if (!name) {
      cancelPendingCreation(tempId);
      return;
    }

    setPendingCreationState({ ...pending, saving: true });

    try {
      if (pending.type === 'folder') {
        await createFolder(name, pending.parentId === ROOT_ID ? undefined : pending.parentId);
      } else {
        await createFile(name, pending.parentId === ROOT_ID ? undefined : pending.parentId);
      }

      await refreshFoldersFromServer(
        [pending.parentId],
        pending.parentId === ROOT_ID ? { rootVisibleDelta: 1 } : undefined,
      );
      removeItemCache(tempId);
      setPendingCreationState(null);
    } catch (error) {
      setPendingCreationState(null);
      removePendingCreationNode(pending);
      throw error;
    }
  }, [refreshFoldersFromServer, removeItemCache, removePendingCreationNode, setPendingCreationState]);

  // ── dataLoader ──────────────────────────────────────────────────────────────
  const dataLoader = {
    /** 获取节点自身数据（已在 getChildrenWithData 中写入缓存，这里只做兜底） */
    getItem: (itemId: string): NodeData => {
      return itemDataCacheRef.current[itemId] ?? {
        id: itemId,
        type: 'folder',
        name: itemId,
        parentId: null,
        documentCount: 0,
      };
    },

    /** 懒加载子节点：调接口，返回 { id, data }[] */
    getChildrenWithData: async (
      itemId: string,
    ): Promise<{ id: string; data: NodeData }[]> => {
      const folderId = itemId === ROOT_ID ? undefined : itemId;
      const nodes = await fetchChildren(folderId);
      nodes.forEach(writeItemCache);
      if (itemId === ROOT_ID) {
        rootLoadedRef.current = true;
        writeItemCache({
          ...itemDataCacheRef.current[ROOT_ID],
          documentCount: nodes.reduce((total, node) => total + node.documentCount, 0),
        });
        setVisibleRootCount(ROOT_PAGE_SIZE);
        bumpRootVersion((version) => version + 1);
        return nodes.map((n) => ({ id: n.id, data: n }));
      }
      return nodes.map((n) => ({ id: n.id, data: n }));
    },
  };

  // ── 拖拽 onDrop ─────────────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (items: ItemInstance<NodeData>[], target: DragTarget<NodeData>) => {
      const tree = treeRef.current;
      if (!tree) return;

      // headless-tree 的 target.item 始终是“新的父节点”：
      // - 直接拖到文件夹上：target.item 就是该文件夹
      // - 拖到兄弟节点之间：target.item 是公共父节点
      const targetFolderId = getDropParentId(target);

      // 直接丢到折叠文件夹上时，先展开它，再继续移动和本地缓存更新。
      if (!target.item.isExpanded()) {
        target.item.expand();
        await tree.waitForItemChildrenLoaded(target.item.getId());
      }

      const sourceParents = new Map(items.map((item) => [item.getId(), getParentId(item)]));
      const itemsToMove = items.filter((item) => sourceParents.get(item.getId()) !== targetFolderId);

      if (!itemsToMove.length) {
        return;
      }

      await Promise.all(itemsToMove.map((item) => moveNode(item.getId(), targetFolderId)));
      await refreshFoldersFromServer(
        [
          ...itemsToMove.map((item) => sourceParents.get(item.getId()) ?? ROOT_ID),
          targetFolderId,
        ],
        {
          rootVisibleDelta:
            targetFolderId === ROOT_ID
              ? itemsToMove.filter((item) => sourceParents.get(item.getId()) !== ROOT_ID).length
              : 0,
        },
      );
    },
    [refreshFoldersFromServer],
  );

  // ── canDrop：只允许拖入文件夹 ────────────────────────────────────────────────
  const canDrop = useCallback(
    (items: ItemInstance<NodeData>[], target: DragTarget<NodeData>) => {
      if (!target.item.isFolder()) {
        return false;
      }

      const targetFolderId = getDropParentId(target);

      // 打开 headless-tree 的 reparent 能力后，只允许“换父级”的有序拖拽，
      // 继续保持当前 demo 不支持同级自由排序。
      if (
        'childIndex' in target &&
        items.every((item) => getParentId(item) === targetFolderId)
      ) {
        return false;
      }

      return items.every((item) => {
        if (item.getId() === targetFolderId) {
          return false;
        }

        let cursor: ItemInstance<NodeData> | undefined = target.item;
        while (cursor) {
          if (cursor.getId() === item.getId()) {
            return false;
          }
          cursor = cursor.getParent() ?? undefined;
        }

        return true;
      });
    },
    [],
  );

  // ── renamingFeature 回调 ─────────────────────────────────────────────────────
  const onRename = useCallback(
    async (item: ItemInstance<NodeData>, value: string) => {
      const nextName = value.trim();
      const currentData = item.getItemData();

      if (!nextName || !currentData || currentData.name === nextName || currentData.isPendingCreation) {
        return;
      }

      const nextData = currentData.type === 'folder'
        ? await renameFolder(item.getId(), nextName)
        : await renameFile(item.getId(), nextName);

      writeItemCache(nextData);
      item.updateCachedData(nextData);

      const parent = item.getParent();
      if (parent) {
        parent.updateCachedChildrenIds(
          sortChildIds(parent.getChildren().map((child: ItemInstance<NodeData>) => child.getId())),
        );
      }

      if (parent?.getId() === ROOT_ID) {
        bumpRootVersion((version) => version + 1);
      }

      treeRef.current?.rebuildTree();
    },
    [sortChildIds, writeItemCache],
  );

  const canRename = useCallback(
    (item: ItemInstance<NodeData>) => item.getId() !== ROOT_ID && !item.getItemData()?.isPendingCreation,
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
    canReorder: true,
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

  const loadMoreRootItems = useCallback(async () => {
    const root = treeRef.current?.getItemInstance(ROOT_ID);
    if (!rootLoadedRef.current || !root || loadingMoreRef.current) return;
    if (visibleRootCount >= root.getChildren().length) return;

    loadingMoreRef.current = true;
    setIsLoadingMoreRootItems(true);

    await new Promise((resolve) => window.setTimeout(resolve, LOAD_MORE_DELAY));
    setVisibleRootCount((count) => Math.min(count + ROOT_PAGE_SIZE, root.getChildren().length));

    loadingMoreRef.current = false;
    setIsLoadingMoreRootItems(false);
  }, [visibleRootCount]);

  // ── CRUD 操作 ────────────────────────────────────────────────────────────────

  /** 新建根目录文件夹 */
  const addRootFolder = useCallback(async (name: string) => {
    await createFolder(name);
    await refreshFoldersFromServer([ROOT_ID], { rootVisibleDelta: 1 });
  }, [refreshFoldersFromServer]);

  /** 新建根目录文档 */
  const addRootFile = useCallback(async (name: string) => {
    await createFile(name);
    await refreshFoldersFromServer([ROOT_ID], { rootVisibleDelta: 1 });
  }, [refreshFoldersFromServer]);

  /** 新建子文件夹到指定父文件夹 */
  const addSubFolder = useCallback(
    async (parentId: string, name: string) => {
      await createFolder(name, parentId);
      await refreshFoldersFromServer([parentId]);
    },
    [refreshFoldersFromServer],
  );

  /** 删除文件夹 */
  const removeFolder = useCallback(
    async (item: ItemInstance<NodeData>) => {
      const parentId = getParentId(item);
      await deleteFolder(item.getId());
      removeItemCacheTree(item);
      await refreshFoldersFromServer([parentId]);
    },
    [refreshFoldersFromServer, removeItemCacheTree],
  );

  /** 删除文件 */
  const removeFile = useCallback(
    async (item: ItemInstance<NodeData>) => {
      const parentId = getParentId(item);
      await deleteFile(item.getId());
      removeItemCache(item.getId());
      await refreshFoldersFromServer([parentId]);
    },
    [refreshFoldersFromServer, removeItemCache],
  );

  /** 新建文档 */
  const addFile = useCallback(
    async (parentId: string, name: string) => {
      await createFile(name, parentId);
      await refreshFoldersFromServer([parentId]);
    },
    [refreshFoldersFromServer],
  );

  return {
    tree,
    isLoadingMoreRootItems,
    loadMoreRootItems,
    visibleRootCount,
    addRootFolder,
    addRootFile,
    addSubFolder,
    removeFolder,
    removeFile,
    addFile,
    startPendingCreation,
    submitPendingCreation,
    cancelPendingCreation,
  };
}
