// src/components/TreeItem.tsx
// 单个节点渲染：文件夹 / 文件，支持展开、重命名、右键菜单（删除/新建子文件夹）

import React, { useEffect, useRef, useState } from 'react';
import type { ItemInstance } from '@headless-tree/core';
import type { NodeData } from '../api/collection';

interface Props {
  item: ItemInstance<NodeData>;
  onAddSubFolder: (parentId: string, name: string) => Promise<void>;
  onRemoveFolder: (item: ItemInstance<NodeData>) => Promise<void>;
  onRemoveFile: (item: ItemInstance<NodeData>) => Promise<void>;
  onAddFile: (parentId: string, name: string) => Promise<void>;
}

export function TreeItem({
  item,
  onAddSubFolder,
  onRemoveFolder,
  onRemoveFile,
  onAddFile,
}: Props) {
  const data = item.getItemData();
  const isFolder = item.isFolder();
  const level = item.getItemMeta().level;
  const isLoading = item.isLoading?.();
  const isRenaming = item.isRenaming?.();

  const [menu, setMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setMenu(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu(true);
  };

  const closeMenu = () => setMenu(false);

  const handleDelete = async () => {
    closeMenu();
    if (isFolder) await onRemoveFolder(item);
    else await onRemoveFile(item);
  };

  const handleAddSub = async () => {
    closeMenu();
    const name = window.prompt('新建子文件夹名称');
    if (name) await onAddSubFolder(item.getId(), name);
  };

  const handleAddFile = () => {
    closeMenu();
    const name = window.prompt('新建文档名称');
    if (!name) return;
    void onAddFile(item.getId(), name);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* 节点行 */}
      <div
        {...item.getProps()}
        style={{
          paddingLeft: level * 16 + 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          cursor: 'pointer',
          background: item.isDragTarget() ? '#e8f0fe' : 'transparent',
          borderRadius: 4,
          userSelect: 'none',
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => isFolder && item.startRenaming?.()}
      >
        {/* 展开箭头 */}
        {isFolder && (
          <span style={{ width: 12, fontSize: 10, color: '#666' }}>
            {isLoading ? '…' : item.isExpanded() ? '▾' : '▸'}
          </span>
        )}

        {/* 图标 */}
          <span>{isFolder ? '📁' : '📄'}</span>

        {/* 名称 / 重命名输入框 */}
        {isRenaming ? (
          <input
            {...item.getRenameInputProps?.()}
            autoFocus
            style={{ flex: 1, fontSize: 13, border: '1px solid #aaa', borderRadius: 3, padding: '0 4px', color: '#111827', background: '#fff' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827' }}>
            {data?.name}
          </span>
        )}
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          style={{
            position: 'absolute',
            left: level * 16 + 8,
            top: 32,
            background: '#fff',
            border: '1px solid #ddd',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,.15)',
            zIndex: 100,
            minWidth: 140,
          }}
        >
          {isFolder && (
            <>
              <MenuItem label="新建子文件夹" onClick={() => void handleAddSub()} />
              <MenuItem label="新建文档" onClick={handleAddFile} />
              <MenuItem label="重命名" onClick={() => { closeMenu(); item.startRenaming?.(); }} />
            </>
          )}
          <MenuItem label="删除" onClick={() => void handleDelete()} danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '6px 12px',
        fontSize: 13,
        cursor: 'pointer',
        color: danger ? '#d32f2f' : '#333',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = '#f5f5f5')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
    >
      {label}
    </div>
  );
}
