import type { NodeData } from '../api/collection';

interface StoreNode extends NodeData {
  parentId: string | null;
}

interface ApiEnvelope<T = void> {
  status: 0 | 1;
  data?: T;
}

const ROOT_ID = 'root';
const ROOT_NODE_COUNT = 35;

const rootNames = [
  '产品方案',
  '设计稿',
  '运营资料',
  '财务归档',
  '法务合同',
  '销售案例',
  '招聘协作',
  '品牌规范',
  '客服知识库',
  '培训材料',
  '审计留档',
  '历史归档',
];

const generatedRootNodes: StoreNode[] = Array.from({ length: ROOT_NODE_COUNT }, (_, index) => {
  const order = index + 1;
  const name = rootNames[index % rootNames.length];
  const prefix = order % 5 === 0 ? 'file' : 'folder';
  const type = prefix === 'folder' ? 'folder' : 'file';

  return {
    id: `${prefix}-root-${order}`,
    type,
    name: type === 'folder'
      ? `${name} ${String(order).padStart(2, '0')}`
      : `根目录文档 ${String(order).padStart(2, '0')}.md`,
    parentId: null,
  };
});

const seedNodes: StoreNode[] = [
  ...generatedRootNodes,
  { id: 'file-roadmap', type: 'file', name: 'Q2 Roadmap.md', parentId: 'folder-product' },
  { id: 'file-prd', type: 'file', name: '收藏功能 PRD.docx', parentId: 'folder-product' },
  { id: 'folder-research', type: 'folder', name: '用户研究', parentId: 'folder-product' },
  { id: 'file-interview', type: 'file', name: '访谈记录 0421.md', parentId: 'folder-research' },
  { id: 'file-ui', type: 'file', name: '新版导航.fig', parentId: 'folder-design' },
  { id: 'folder-assets', type: 'folder', name: '插画素材', parentId: 'folder-design' },
  { id: 'file-icons', type: 'file', name: 'icon-export.zip', parentId: 'folder-assets' },
  { id: 'file-sales-deck', type: 'file', name: '销售提案.pptx', parentId: 'folder-sales' },
  { id: 'file-hr-plan', type: 'file', name: '校招计划.xlsx', parentId: 'folder-hr' },
  { id: 'file-brand-guide', type: 'file', name: '视觉规范.pdf', parentId: 'folder-brand' },
  { id: 'folder-product', type: 'folder', name: '产品方案精选', parentId: null },
  { id: 'folder-design', type: 'folder', name: '设计稿精选', parentId: null },
  { id: 'folder-sales', type: 'folder', name: '销售案例精选', parentId: null },
  { id: 'folder-hr', type: 'folder', name: '招聘协作精选', parentId: null },
  { id: 'folder-brand', type: 'folder', name: '品牌规范精选', parentId: null },
];

const store = new Map<string, StoreNode>(seedNodes.map((node) => [node.id, node]));

let folderSeq = 1000;
let fileSeq = 1000;

const originalFetch = window.fetch.bind(window);

window.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url, window.location.origin);

  if (!url.pathname.startsWith('/collection')) {
    return originalFetch(input, init);
  }

  try {
    const response = await handleCollectionRequest(request, url);
    return jsonResponse(response);
  } catch (error) {
    return jsonResponse({
      status: 1,
      data: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

async function handleCollectionRequest(request: Request, url: URL): Promise<ApiEnvelope<unknown>> {
  const { pathname, searchParams } = url;

  if (pathname === '/collection/list' && request.method === 'GET') {
    const folderId = searchParams.get('folderId');
    return { status: 0, data: listChildren(folderId) };
  }

  if (pathname === '/collection/folder' && request.method === 'POST') {
    const body = await request.json() as { name?: string; parentId?: string };
    const parentId = normalizeParentId(body.parentId);
    const name = body.name?.trim();
    if (!name) throw new Error('Folder name is required');
    ensureFolder(parentId);
    const id = `folder-${folderSeq++}`;
    store.set(id, { id, type: 'folder', name, parentId });
    return { status: 0, data: [id] };
  }

  if (pathname === '/collection/file' && request.method === 'POST') {
    const body = await request.json() as { name?: string; parentId?: string };
    const parentId = normalizeParentId(body.parentId);
    const name = body.name?.trim();
    if (!name) throw new Error('File name is required');
    ensureFolder(parentId);
    const id = `file-${fileSeq++}`;
    store.set(id, { id, type: 'file', name, parentId });
    return { status: 0, data: [id] };
  }

  if (pathname === '/collection/move' && request.method === 'PUT') {
    const body = await request.json() as { id?: string; targetFolderId?: string };
    if (!body.id || !store.has(body.id)) throw new Error('Node not found');
    const parentId = normalizeParentId(body.targetFolderId);
    ensureFolder(parentId);
    const node = store.get(body.id)!;
    if (node.type === 'folder' && isDescendant(parentId, node.id)) {
      throw new Error('Cannot move folder into its descendant');
    }
    store.set(node.id, { ...node, parentId });
    return { status: 0 };
  }

  if (pathname === '/collection/folder/rename' && request.method === 'PUT') {
    const body = await request.json() as { folderId?: string; name?: string };
    const folder = body.folderId ? store.get(body.folderId) : undefined;
    const name = body.name?.trim();
    if (!folder || folder.type !== 'folder') throw new Error('Folder not found');
    if (!name) throw new Error('Folder name is required');
    store.set(folder.id, { ...folder, name });
    return { status: 0 };
  }

  if (pathname.startsWith('/collection/folder/') && request.method === 'DELETE') {
    const folderId = pathname.slice('/collection/folder/'.length);
    const folder = store.get(folderId);
    if (!folder || folder.type !== 'folder') throw new Error('Folder not found');
    removeFolderTree(folderId);
    return { status: 0 };
  }

  if (pathname.startsWith('/collection/file/') && request.method === 'DELETE') {
    const fileId = pathname.slice('/collection/file/'.length);
    const file = store.get(fileId);
    if (!file || file.type !== 'file') throw new Error('File not found');
    store.delete(fileId);
    return { status: 0 };
  }

  throw new Error(`Unsupported API: ${request.method} ${pathname}`);
}

function listChildren(folderId?: string | null): NodeData[] {
  const parentId = normalizeParentId(folderId);
  return Array.from(store.values())
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    })
    .map(({ id, type, name }) => ({ id, type, name }));
}

function normalizeParentId(parentId?: string | null) {
  if (!parentId || parentId === ROOT_ID) return null;
  return parentId;
}

function ensureFolder(parentId: string | null) {
  if (parentId === null) return;
  const parent = store.get(parentId);
  if (!parent || parent.type !== 'folder') throw new Error('Parent folder not found');
}

function removeFolderTree(folderId: string) {
  const children = Array.from(store.values()).filter((node) => node.parentId === folderId);
  for (const child of children) {
    if (child.type === 'folder') removeFolderTree(child.id);
    else store.delete(child.id);
  }
  store.delete(folderId);
}

function isDescendant(targetParentId: string | null, sourceFolderId: string) {
  let cursor = targetParentId;
  while (cursor) {
    if (cursor === sourceFolderId) return true;
    cursor = store.get(cursor)?.parentId ?? null;
  }
  return false;
}

function jsonResponse(body: ApiEnvelope<unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
