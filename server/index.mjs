import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { CollectionStore, ApiError } from './collection-store.mjs';

const PORT = Number(process.env.PORT ?? 3001);
const store = new CollectionStore({
  dbPath: resolve(process.cwd(), 'server/data/runtime/collection-db.json'),
});

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const result = await routeRequest(request, url);
    sendJson(response, result.statusCode, {
      status: 0,
      data: result.data,
    });
  } catch (error) {
    const statusCode =
      error instanceof ApiError
        ? error.statusCode
        : 500;

    sendJson(response, statusCode, {
      status: 1,
      message: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`Collection API is listening on http://localhost:${PORT}`);
});

async function routeRequest(request, url) {
  const { pathname, searchParams } = url;

  if (pathname === '/health' && request.method === 'GET') {
    return {
      statusCode: 200,
      data: {
        ok: true,
      },
    };
  }

  if (pathname === '/collection/list' && request.method === 'GET') {
    return {
      statusCode: 200,
      data: store.listChildren(searchParams.get('folderId')),
    };
  }

  if (pathname === '/collection/folder' && request.method === 'POST') {
    const body = await readJsonBody(request);
    return {
      statusCode: 201,
      data: store.createFolder(body),
    };
  }

  if (pathname === '/collection/file' && request.method === 'POST') {
    const body = await readJsonBody(request);
    return {
      statusCode: 201,
      data: store.createFile(body),
    };
  }

  if (pathname === '/collection/folder/rename' && request.method === 'PUT') {
    const body = await readJsonBody(request);
    return {
      statusCode: 200,
      data: store.renameFolder(body),
    };
  }

  if (pathname === '/collection/file/rename' && request.method === 'PUT') {
    const body = await readJsonBody(request);
    return {
      statusCode: 200,
      data: store.renameFile(body),
    };
  }

  if (pathname === '/collection/move' && request.method === 'PUT') {
    const body = await readJsonBody(request);
    store.moveNode(body);
    return {
      statusCode: 200,
    };
  }

  if (pathname.startsWith('/collection/folder/') && request.method === 'DELETE') {
    const folderId = decodeURIComponent(pathname.slice('/collection/folder/'.length));
    store.deleteFolder(folderId);
    return {
      statusCode: 200,
    };
  }

  if (pathname.startsWith('/collection/file/') && request.method === 'DELETE') {
    const fileId = decodeURIComponent(pathname.slice('/collection/file/'.length));
    store.deleteFile(fileId);
    return {
      statusCode: 200,
    };
  }

  throw new ApiError(404, `Unsupported API: ${request.method} ${pathname}`);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8').trim();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON');
  }
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(`${JSON.stringify(body)}\n`);
}
