// src/api/collection.ts
// 接口封装

export interface NodeData {
  id: string;
  type: 'folder' | 'file';
  name: string;
  parentId: string | null;
  documentCount: number;
  hasChildren?: boolean;
  isPendingCreation?: boolean;
}

interface ApiResponse<T = void> {
  status: 0 | number;
  data?: T;
  message?: string;
}

const BASE = (import.meta.env.VITE_COLLECTION_API_BASE ?? '/collection').replace(/\/$/, '');

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const json = await res.json() as ApiResponse<T>;

  if (!res.ok || json.status !== 0) {
    throw new Error(json.message ?? `API error: ${path}`);
  }

  return json.data as T;
}

/** 获取某文件夹下一层节点（folderId 不传则为根目录） */
export function fetchChildren(folderId?: string): Promise<NodeData[]> {
  const params = folderId && folderId !== 'root'
    ? `?${new URLSearchParams({ folderId }).toString()}`
    : '';
  return request<NodeData[]>(`/list${params}`);
}

/** 删除文件夹 */
export function deleteFolder(folderId: string): Promise<void> {
  return request(`/folder/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
}

/** 删除文件 */
export function deleteFile(fileId: string): Promise<void> {
  return request(`/file/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}

/** 移动文件夹或文件到目标文件夹 */
export function moveNode(id: string, targetFolderId: string): Promise<void> {
  return request('/move', {
    method: 'PUT',
    body: JSON.stringify({ id, targetFolderId }),
  });
}

/** 修改文件夹名称 */
export function renameFolder(folderId: string, name: string): Promise<NodeData> {
  return request('/folder/rename', {
    method: 'PUT',
    body: JSON.stringify({ folderId, name }),
  });
}

/** 修改文档名称 */
export function renameFile(fileId: string, name: string): Promise<NodeData> {
  return request('/file/rename', {
    method: 'PUT',
    body: JSON.stringify({ fileId, name }),
  });
}

/** 新建文件夹 */
export function createFolder(name: string, parentId?: string): Promise<NodeData> {
  return request('/folder', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
}

/** 新建文档 */
export function createFile(name: string, parentId?: string): Promise<NodeData> {
  return request('/file', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
}
