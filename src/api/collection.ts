// src/api/collection.ts
// 接口封装

export interface NodeData {
  id: string;
  type: 'folder' | 'file';
  name: string;
}

interface ApiResponse<T = void> {
  status: 0 | number;
  data?: T;
}

const BASE = '/collection';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const json: ApiResponse<T> = await res.json();
  if (json.status !== 0) throw new Error(`API error: ${url}`);
  return json.data as T;
}

/** 获取某文件夹下一层节点（folderId 不传则为根目录） */
export function fetchChildren(folderId?: string): Promise<NodeData[]> {
  const params = folderId && folderId !== 'root' ? `?folderId=${folderId}` : '';
  return request<NodeData[]>(`${BASE}/list${params}`);
}

/** 删除文件夹 */
export function deleteFolder(folderId: string): Promise<void> {
  return request(`${BASE}/folder/${folderId}`, { method: 'DELETE' });
}

/** 删除文件 */
export function deleteFile(fileId: string): Promise<void> {
  return request(`${BASE}/file/${fileId}`, { method: 'DELETE' });
}

/** 移动文件夹或文件到目标文件夹 */
export function moveNode(id: string, targetFolderId: string): Promise<void> {
  return request(`${BASE}/move`, {
    method: 'PUT',
    body: JSON.stringify({ id, targetFolderId }),
  });
}

/** 修改文件夹名称 */
export function renameFolder(folderId: string, name: string): Promise<void> {
  return request(`${BASE}/folder/rename`, {
    method: 'PUT',
    body: JSON.stringify({ folderId, name }),
  });
}

/** 新建文件夹，返回新 folderId */
export async function createFolder(name: string, parentId?: string): Promise<string> {
  const data = await request<string[]>(`${BASE}/folder`, {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
  return data[0];
}

/** 新建文件，返回新 fileId */
export async function createFile(name: string, parentId: string): Promise<string> {
  const data = await request<string[]>(`${BASE}/file`, {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
  return data[0];
}
