// src/components/CollectionTree.tsx
// 树容器：渲染整棵树，提供"新建根目录文件夹"入口

import React, { useRef, useState } from 'react';
import { useCollectionTree } from '../hooks/useCollectionTree';
import { useInfiniteScrollTrigger } from '../hooks/useInfiniteScrollTrigger';
import { TreeItem } from './TreeItem';

export function CollectionTree() {
  const {
    tree,
    hasMoreRootItems,
    isLoadingMoreRootItems,
    loadMoreRootItems,
    totalRootCount,
    addRootFolder,
    addSubFolder,
    removeFolder,
    removeFile,
    addFile,
  } =
    useCollectionTree();

  const [newFolderName, setNewFolderName] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleAddRoot = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await addRootFolder(name);
    setNewFolderName('');
  };

  useInfiniteScrollTrigger({
    rootRef: scrollRef,
    targetRef: sentinelRef,
    enabled: hasMoreRootItems,
    onIntersect: loadMoreRootItems,
  });

  return (
    <div className="tree-shell">
      {/* 工具栏：新建根目录文件夹 */}
      <div className="tree-toolbar">
        <input
          className="tree-input"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="新建根目录文件夹…"
          onKeyDown={(e) => e.key === 'Enter' && handleAddRoot()}
        />
        <button
          className="tree-add-button"
          onClick={handleAddRoot}
        >
          新建
        </button>
      </div>

      {/* 树容器 */}
      <div ref={scrollRef} className="tree-scroll-area">
        <div
          {...tree.getContainerProps('文档收藏夹')}
          className="tree-container"
        >
          {tree.getItems().map((item) => (
            <TreeItem
              key={item.getKey()}
              item={item}
              onAddSubFolder={addSubFolder}
              onRemoveFolder={removeFolder}
              onRemoveFile={removeFile}
              onAddFile={addFile}
            />
          ))}

          {/* 拖拽放置指示线 */}
          <div
            style={{
              ...tree.getDragLineStyle(0, 0),
              position: 'absolute',
              height: 2,
              background: '#1f6feb',
              pointerEvents: 'none',
            }}
          />
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
