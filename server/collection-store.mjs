import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeedState } from './seed-data.mjs';

const ROOT_ID = 'root';

export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export class CollectionStore {
  constructor({ dbPath }) {
    this.dbPath = dbPath;
    this.state = loadState(dbPath);
  }

  listChildren(folderId) {
    const parentId = normalizeParentId(folderId);
    const getDocumentCount = createDocumentCountGetter(this.state.nodes);

    return this.state.nodes
      .filter((node) => node.parentId === parentId)
      .sort(compareNodes)
      .map((node) => toNodeData(node, getDocumentCount, this.state.nodes));
  }

  createFolder({ name, parentId }) {
    const normalizedName = assertName(name, '文件夹名称不能为空');
    const normalizedParentId = normalizeParentId(parentId);

    this.ensureFolder(normalizedParentId);

    const node = {
      id: `folder-${this.state.folderSeq++}`,
      type: 'folder',
      name: normalizedName,
      parentId: normalizedParentId,
    };

    this.state.nodes.push(node);
    this.persist();
    return toNodeData(node, () => 0, this.state.nodes);
  }

  createFile({ name, parentId }) {
    const normalizedName = assertName(name, '文档名称不能为空');
    const normalizedParentId = normalizeParentId(parentId);

    this.ensureFolder(normalizedParentId);

    const node = {
      id: `file-${this.state.fileSeq++}`,
      type: 'file',
      name: normalizedName,
      parentId: normalizedParentId,
    };

    this.state.nodes.push(node);
    this.persist();
    return toNodeData(node, () => 0, this.state.nodes);
  }

  renameFolder({ folderId, name }) {
    const folder = this.getNodeOrThrow(folderId, 'folder', '文件夹不存在');
    folder.name = assertName(name, '文件夹名称不能为空');
    this.persist();
    return toNodeData(folder, createDocumentCountGetter(this.state.nodes), this.state.nodes);
  }

  renameFile({ fileId, name }) {
    const file = this.getNodeOrThrow(fileId, 'file', '文档不存在');
    file.name = assertName(name, '文档名称不能为空');
    this.persist();
    return toNodeData(file, createDocumentCountGetter(this.state.nodes), this.state.nodes);
  }

  moveNode({ id, targetFolderId }) {
    const node = this.getNodeOrThrow(id, null, '节点不存在');
    const normalizedTargetFolderId = normalizeParentId(targetFolderId);

    this.ensureFolder(normalizedTargetFolderId);

    if (node.type === 'folder') {
      if (node.id === normalizedTargetFolderId) {
        throw new ApiError(400, '文件夹不能移动到自身下');
      }

      if (isDescendant(this.state.nodes, normalizedTargetFolderId, node.id)) {
        throw new ApiError(400, '文件夹不能移动到自己的子孙节点下');
      }
    }

    node.parentId = normalizedTargetFolderId;
    this.persist();
  }

  deleteFolder(folderId) {
    const folder = this.getNodeOrThrow(folderId, 'folder', '文件夹不存在');
    const idsToDelete = new Set([folder.id]);

    const collectDescendants = (parentId) => {
      this.state.nodes
        .filter((node) => node.parentId === parentId)
        .forEach((child) => {
          idsToDelete.add(child.id);
          if (child.type === 'folder') {
            collectDescendants(child.id);
          }
        });
    };

    collectDescendants(folder.id);
    this.state.nodes = this.state.nodes.filter((node) => !idsToDelete.has(node.id));
    this.persist();
  }

  deleteFile(fileId) {
    this.getNodeOrThrow(fileId, 'file', '文档不存在');
    this.state.nodes = this.state.nodes.filter((node) => node.id !== fileId);
    this.persist();
  }

  ensureFolder(parentId) {
    if (parentId === null) {
      return;
    }

    this.getNodeOrThrow(parentId, 'folder', '目标文件夹不存在');
  }

  getNodeOrThrow(id, expectedType, errorMessage) {
    if (!id) {
      throw new ApiError(400, errorMessage);
    }

    const node = this.state.nodes.find((item) => item.id === id);

    if (!node || (expectedType && node.type !== expectedType)) {
      throw new ApiError(404, errorMessage);
    }

    return node;
  }

  persist() {
    writeFileSync(this.dbPath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
  }
}

function loadState(dbPath) {
  ensureDbFile(dbPath);

  const raw = JSON.parse(readFileSync(dbPath, 'utf8'));
  const folderSeq = Number(raw.folderSeq);
  const fileSeq = Number(raw.fileSeq);
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : null;

  if (!Number.isFinite(folderSeq) || !Number.isFinite(fileSeq) || !nodes) {
    throw new Error(`Invalid collection db file: ${dbPath}`);
  }

  return {
    folderSeq,
    fileSeq,
    nodes,
  };
}

function ensureDbFile(dbPath) {
  const folderPath = dirname(dbPath);

  if (!existsSync(folderPath)) {
    mkdirSync(folderPath, { recursive: true });
  }

  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, `${JSON.stringify(createSeedState(), null, 2)}\n`, 'utf8');
  }
}

function normalizeParentId(parentId) {
  if (!parentId || parentId === ROOT_ID) {
    return null;
  }

  return parentId;
}

function assertName(name, message) {
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName) {
    throw new ApiError(400, message);
  }

  return normalizedName;
}

function compareNodes(left, right) {
  if (left.type !== right.type) {
    return left.type === 'folder' ? -1 : 1;
  }

  return left.name.localeCompare(right.name, 'zh-CN');
}

function toNodeData(node, getDocumentCount, nodes) {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    parentId: node.parentId,
    documentCount: node.type === 'file' ? 1 : getDocumentCount(node.id),
    hasChildren: node.type === 'folder' ? hasChildNodes(node.id, nodes) : false,
  };
}

function hasChildNodes(parentId, nodes) {
  return nodes?.some((node) => node.parentId === parentId) ?? false;
}

function createDocumentCountGetter(nodes) {
  const cache = new Map();

  const getDocumentCount = (folderId) => {
    if (cache.has(folderId)) {
      return cache.get(folderId);
    }

    let total = 0;

    nodes.forEach((node) => {
      if (node.parentId !== folderId) {
        return;
      }

      total += node.type === 'file'
        ? 1
        : getDocumentCount(node.id);
    });

    cache.set(folderId, total);
    return total;
  };

  return getDocumentCount;
}

function isDescendant(nodes, targetParentId, sourceFolderId) {
  let cursor = targetParentId;

  while (cursor) {
    if (cursor === sourceFolderId) {
      return true;
    }

    cursor = nodes.find((node) => node.id === cursor)?.parentId ?? null;
  }

  return false;
}
