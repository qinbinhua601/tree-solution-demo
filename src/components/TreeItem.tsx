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
  onStartInlineCreate: (parentId: string, type: 'folder' | 'file') => Promise<void>;
  onSubmitInlineCreate: (tempId: string, name: string) => Promise<void>;
  onCancelInlineCreate: (tempId?: string) => void;
}

export function TreeItem({
  item,
  onAddSubFolder,
  onRemoveFolder,
  onRemoveFile,
  onAddFile,
  onStartInlineCreate,
  onSubmitInlineCreate,
  onCancelInlineCreate,
}: Props) {
  const data = item.getItemData();
  const isFolder = item.isFolder();
  const isPendingCreation = !!data?.isPendingCreation;
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
    if (isPendingCreation) return;
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
    await onStartInlineCreate(item.getId(), 'folder');
  };

  const handleAddFile = () => {
    closeMenu();
    void onStartInlineCreate(item.getId(), 'file');
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* 节点行 */}
      <div
        {...item.getProps()}
        style={{
          paddingLeft: level * 18 + 12,
          paddingRight: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 40,
          cursor: 'pointer',
          background: item.isDragTarget() ? '#e8f1ff' : 'transparent',
          borderRadius: 10,
          userSelect: 'none',
          transition: 'background 120ms ease',
        }}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => !isPendingCreation && item.startRenaming?.()}
      >
        {isFolder && (
          <span style={{ width: 14, fontSize: 11, color: '#7a8699' }}>
            {isLoading ? '…' : item.isExpanded() ? '▾' : '▸'}
          </span>
        )}

        <span style={{ fontSize: 16 }}>{isFolder ? '📁' : '📄'}</span>

        {isRenaming ? (
          <input
            {...item.getRenameInputProps?.()}
            autoFocus
            style={{ flex: 1, fontSize: 14, border: '1px solid #c7d2e1', borderRadius: 8, padding: '6px 8px', color: '#111827', background: '#fff' }}
          />
        ) : isPendingCreation ? (
          <InlineCreateInput
            itemId={item.getId()}
            type={data?.type ?? 'file'}
            onSubmit={onSubmitInlineCreate}
            onCancel={onCancelInlineCreate}
          />
        ) : (
          <>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#152033' }}>
              {data?.name}
            </span>
            {isFolder && !isPendingCreation && (
              <span
                style={{
                  flexShrink: 0,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: '#eef4fb',
                  color: '#54708e',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {data?.documentCount ?? 0} 篇
              </span>
            )}
          </>
        )}
      </div>

      {/* 右键菜单 */}
      {menu && (
        <div
          style={{
            position: 'absolute',
            left: level * 18 + 12,
            top: 44,
            background: '#fff',
            border: '1px solid #d6dfeb',
            borderRadius: 12,
            boxShadow: '0 18px 40px rgba(16, 24, 40, 0.12)',
            zIndex: 100,
            minWidth: 160,
            overflow: 'hidden',
          }}
        >
          {isFolder && (
            <>
              <MenuItem label="新建子文件夹" onClick={() => void handleAddSub()} />
              <MenuItem label="新建文档" onClick={handleAddFile} />
            </>
          )}
          <MenuItem label="重命名" onClick={() => { closeMenu(); item.startRenaming?.(); }} />
          <MenuItem label="删除" onClick={() => void handleDelete()} danger />
        </div>
      )}
    </div>
  );
}

function InlineCreateInput({
  itemId,
  type,
  onSubmit,
  onCancel,
}: {
  itemId: string;
  type: 'folder' | 'file';
  onSubmit: (tempId: string, name: string) => Promise<void>;
  onCancel: (tempId?: string) => void;
}) {
  const [value, setValue] = useState('');
  const hasHandledRef = useRef(false);

  const finish = (mode: 'submit' | 'cancel') => {
    if (hasHandledRef.current) {
      return;
    }

    hasHandledRef.current = true;

    if (mode === 'submit' && value.trim()) {
      void onSubmit(itemId, value);
      return;
    }

    onCancel(itemId);
  };

  return (
    <input
      autoFocus
      placeholder={type === 'folder' ? '输入子文件夹名称' : '输入文档名称'}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish('submit')}
      onKeyDown={(event) => {
        event.stopPropagation();

        if (event.key === 'Enter') {
          event.preventDefault();
          finish('submit');
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          finish('cancel');
        }
      }}
      style={{
        flex: 1,
        fontSize: 14,
        border: '1px solid #c7d2e1',
        borderRadius: 8,
        padding: '6px 8px',
        color: '#111827',
        background: '#fff',
      }}
    />
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
        padding: '10px 14px',
        fontSize: 14,
        cursor: 'pointer',
        color: danger ? '#d32f2f' : '#333',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = '#f4f7fb')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'transparent')}
    >
      {label}
    </div>
  );
}
