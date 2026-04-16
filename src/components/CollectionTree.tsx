// src/components/CollectionTree.tsx
// 树容器：渲染整棵树，提供"新建根目录文件夹"入口

import React, { useEffect, useRef, useState } from 'react';
import type { ItemInstance } from '@headless-tree/core';
import type { NodeData } from '../api/collection';
import { useCollectionTree } from '../hooks/useCollectionTree';
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger';
import { TreeItem } from './TreeItem';

export function CollectionTree() {
  const {
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
  } =
    useCollectionTree();

  const [newNodeName, setNewNodeName] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pendingScrollNodeId, setPendingScrollNodeId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const rootItem = tree.getRootItem();
  const rootItems = rootItem.getChildren();
  const visibleRootItems = rootItems.slice(0, visibleRootCount);
  const totalRootCount = rootItems.length;
  const totalDocumentCount = rootItems.reduce(
    (total, item) => total + (item.getItemData()?.documentCount ?? 0),
    0,
  );
  const hasMoreRootItems = totalRootCount > visibleRootCount;

  const getErrorMessage = (error: unknown) => (
    error instanceof Error ? error.message : '操作失败，请稍后重试'
  );

  useEffect(() => {
    if (!pendingScrollNodeId) {
      return;
    }

    const scrollArea = scrollRef.current;
    const target = scrollArea?.querySelector<HTMLElement>(`[data-node-id="${pendingScrollNodeId}"]`);

    if (!scrollArea || !target) {
      return;
    }

    const containerRect = scrollArea.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const isOutOfView = targetRect.top < containerRect.top || targetRect.bottom > containerRect.bottom;

    if (isOutOfView) {
      target.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }

    setPendingScrollNodeId(null);
  }, [pendingScrollNodeId, visibleRootCount, tree]);

  const handleAddRootFolder = async () => {
    const name = newNodeName.trim();
    if (!name) return;

    try {
      const createdNode = await addRootFolder(name);
      setPendingScrollNodeId(createdNode.id);
      setFeedback({ type: 'success', message: `已在根目录创建文件夹“${name}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleAddRootFile = async () => {
    const name = newNodeName.trim();
    if (!name) return;

    try {
      const createdNode = await addRootFile(name);
      setPendingScrollNodeId(createdNode.id);
      setFeedback({ type: 'success', message: `已在根目录创建文档“${name}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  useInfiniteScrollTrigger({
    rootRef: scrollRef,
    targetRef: sentinelRef,
    enabled: hasMoreRootItems,
    onIntersect: loadMoreRootItems,
  });

  const handleAddSubFolder = async (parentId: string, name: string) => {
    try {
      const createdNode = await addSubFolder(parentId, name);
      setPendingScrollNodeId(createdNode.id);
      setFeedback({ type: 'success', message: `已创建子文件夹“${name}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleAddFile = async (parentId: string, name: string) => {
    try {
      const createdNode = await addFile(parentId, name);
      setPendingScrollNodeId(createdNode.id);
      setFeedback({ type: 'success', message: `已创建文档“${name}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleRemoveFolder = async (item: ItemInstance<NodeData>) => {
    try {
      await removeFolder(item);
      setFeedback({ type: 'success', message: `已删除文件夹“${item.getItemData()?.name ?? ''}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleRemoveFile = async (item: ItemInstance<NodeData>) => {
    try {
      await removeFile(item);
      setFeedback({ type: 'success', message: `已删除文档“${item.getItemData()?.name ?? ''}”` });
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleStartInlineCreate = async (parentId: string, type: 'folder' | 'file') => {
    try {
      await startPendingCreation(parentId, type);
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  const handleSubmitInlineCreate = async (tempId: string, name: string) => {
    try {
      const createdNode = await submitPendingCreation(tempId, name);
      if (createdNode && name.trim()) {
        setPendingScrollNodeId(createdNode.id);
        setFeedback({ type: 'success', message: `已创建“${name.trim()}”` });
      }
    } catch (error) {
      setFeedback({ type: 'error', message: getErrorMessage(error) });
    }
  };

  return (
    <div className="tree-shell">
      <div className="tree-tips">
        右键文件夹可新建子文件夹 / 文档，右键任意节点可重命名或删除，拖拽节点可移动到目标文件夹。
      </div>

      <div className="tree-summary">
        总文档数
        <strong>{totalDocumentCount}</strong>
      </div>

      {feedback && (
        <div className={`tree-feedback tree-feedback-${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      <div className="tree-toolbar">
        <input
          className="tree-input"
          value={newNodeName}
          onChange={(e) => setNewNodeName(e.target.value)}
          placeholder="输入根目录节点名称…"
          onKeyDown={(e) => e.key === 'Enter' && handleAddRootFolder()}
        />
        <button
          className="tree-add-button"
          onClick={handleAddRootFolder}
        >
          新建文件夹
        </button>
        <button
          className="tree-add-button tree-add-button-secondary"
          onClick={handleAddRootFile}
        >
          新建文档
        </button>
      </div>

      <div ref={scrollRef} className="tree-scroll-area">
        <div
          {...tree.getContainerProps('文档收藏夹')}
          className="tree-container"
        >
          {visibleRootItems.map((item: ItemInstance<NodeData>) => (
            <NestedTreeItem
              key={item.getKey()}
              item={item}
              onAddSubFolder={handleAddSubFolder}
              onRemoveFolder={handleRemoveFolder}
              onRemoveFile={handleRemoveFile}
              onAddFile={handleAddFile}
              onStartInlineCreate={handleStartInlineCreate}
              onSubmitInlineCreate={handleSubmitInlineCreate}
              onCancelInlineCreate={cancelPendingCreation}
            />
          ))}
        </div>

        <div ref={sentinelRef} className={`tree-status ${isLoadingMoreRootItems ? 'is-loading' : ''}`}>
          {isLoadingMoreRootItems ? (
            <span className="tree-status-spinner" aria-label="加载中" />
          ) : hasMoreRootItems ? (
            ''
          ) : totalRootCount > 0 ? (
            '没有更多'
          ) : (
            '暂无一级节点'
          )}
        </div>
      </div>
    </div>
  );
}

interface NestedTreeItemProps {
  item: ItemInstance<NodeData>;
  onAddSubFolder: (parentId: string, name: string) => Promise<void>;
  onRemoveFolder: (item: ItemInstance<NodeData>) => Promise<void>;
  onRemoveFile: (item: ItemInstance<NodeData>) => Promise<void>;
  onAddFile: (parentId: string, name: string) => Promise<void>;
  onStartInlineCreate: (parentId: string, type: 'folder' | 'file') => Promise<void>;
  onSubmitInlineCreate: (tempId: string, name: string) => Promise<void>;
  onCancelInlineCreate: (tempId?: string) => void;
}

function NestedTreeItem({
  item,
  onAddSubFolder,
  onRemoveFolder,
  onRemoveFile,
  onAddFile,
  onStartInlineCreate,
  onSubmitInlineCreate,
  onCancelInlineCreate,
}: NestedTreeItemProps) {
  return (
    <>
      <TreeItem
        item={item}
        onAddSubFolder={onAddSubFolder}
        onRemoveFolder={onRemoveFolder}
        onRemoveFile={onRemoveFile}
        onAddFile={onAddFile}
        onStartInlineCreate={onStartInlineCreate}
        onSubmitInlineCreate={onSubmitInlineCreate}
        onCancelInlineCreate={onCancelInlineCreate}
      />

      {item.isFolder() && item.isExpanded() && item.getChildren().map((child) => (
        <NestedTreeItem
          key={child.getKey()}
          item={child}
          onAddSubFolder={onAddSubFolder}
          onRemoveFolder={onRemoveFolder}
          onRemoveFile={onRemoveFile}
          onAddFile={onAddFile}
          onStartInlineCreate={onStartInlineCreate}
          onSubmitInlineCreate={onSubmitInlineCreate}
          onCancelInlineCreate={onCancelInlineCreate}
        />
      ))}
    </>
  );
}
