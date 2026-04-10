// src/components/CollectionTree.tsx
// 树容器：渲染整棵树，提供"新建根目录文件夹"入口

import React, { useState } from 'react';
import { useCollectionTree } from '../hooks/useCollectionTree';
import { TreeItem } from './TreeItem';

export function CollectionTree() {
  const { tree, addRootFolder, addSubFolder, removeFolder, removeFile, addFile } =
    useCollectionTree();

  const [newFolderName, setNewFolderName] = useState('');

  const handleAddRoot = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    await addRootFolder(name);
    setNewFolderName('');
  };

  return (
    <div style={{ fontFamily: 'sans-serif', width: 280, color: '#1f2937' }}>
      {/* 工具栏：新建根目录文件夹 */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 4px', borderBottom: '1px solid #eee' }}>
        <input
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          placeholder="新建根目录文件夹…"
          onKeyDown={(e) => e.key === 'Enter' && handleAddRoot()}
          style={{ flex: 1, fontSize: 13, padding: '2px 6px', border: '1px solid #ccc', borderRadius: 3, color: '#111827', background: '#fff' }}
        />
        <button
          onClick={handleAddRoot}
          style={{ fontSize: 13, padding: '2px 8px', borderRadius: 3, border: '1px solid #ccc', cursor: 'pointer', color: '#111827', background: '#fff' }}
        >
          +
        </button>
      </div>

      {/* 树容器 */}
      <div
        {...tree.getContainerProps('文档收藏夹')}
        style={{ outline: 'none', paddingTop: 4, position: 'relative' }}
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
            background: '#1a73e8',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}
