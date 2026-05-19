import {
  createPublicEditorDraft,
  createPublicEditorPreviewDraft,
  finalizePublicEditorPreviewDraft,
  finalizePublicEditorDraft,
  getPublicEditorDraft,
  getPublicEditorPreviewDraft,
  listPublicEditorDraftFiles,
  listPublicEditorPreviewDraftFiles,
  updatePublicEditorDraft,
  updatePublicEditorPreviewDraft,
  uploadPublicEditorDraftFile,
  uploadPublicEditorPreviewDraftFile,
} from '../../api';
import type { PublicEditorDraftFile } from '../../api';

export interface PublicEditorDraftResponse {
  token: string;
  version?: number;
  updated_at?: string;
  payloadParsed?: Record<string, unknown>;
}

export interface PublicDesignEditorAdapter {
  createDraft: (payload: Record<string, unknown>) => Promise<PublicEditorDraftResponse>;
  getDraft: (token: string) => Promise<PublicEditorDraftResponse>;
  updateDraft: (token: string, patch: Record<string, unknown>) => Promise<PublicEditorDraftResponse | void>;
  listDraftFiles?: (token: string) => Promise<PublicEditorDraftFile[]>;
  uploadDraftFile: (
    token: string,
    file: File,
    onProgress?: (progress: number) => void,
  ) => Promise<PublicEditorDraftFile>;
  finalizeDraft?: (token: string, payload: Record<string, unknown>) => Promise<void>;
}

type WebsiteBffAdapterOptions = {
  baseUrl: string;
  credentials?: RequestCredentials;
};

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  let message = response.statusText || 'Ошибка сервера';
  try {
    const body = await response.json() as { message?: string; error?: string };
    message = body.message || body.error || message;
  } catch {
    // ignore non-json error bodies
  }
  throw new Error(`${response.status}: ${message}`);
}

function joinBffPath(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function uploadFileWithProgress(
  url: string,
  file: File,
  credentials: RequestCredentials | undefined,
  onProgress?: (progress: number) => void,
): Promise<PublicEditorDraftFile> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    if (credentials === 'include') request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      try {
        const body = request.responseText ? JSON.parse(request.responseText) : null;
        if (request.status >= 200 && request.status < 300) {
          resolve(body as PublicEditorDraftFile);
          return;
        }
        reject(new Error(`${request.status}: ${body?.message || body?.error || request.statusText}`));
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Не удалось загрузить файл'));
      }
    };
    request.onerror = () => reject(new Error('Нет ответа от сервера'));
    const formData = new FormData();
    formData.append('file', file);
    request.send(formData);
  });
}

export function createWebsiteBffPublicDesignEditorAdapter({
  baseUrl,
  credentials = 'same-origin',
}: WebsiteBffAdapterOptions): PublicDesignEditorAdapter {
  return {
    createDraft(payload) {
      return fetch(joinBffPath(baseUrl, '/drafts'), {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((response) => readJsonResponse<PublicEditorDraftResponse>(response));
    },
    getDraft(token) {
      return fetch(joinBffPath(baseUrl, `/drafts/${encodeURIComponent(token)}`), { credentials })
        .then((response) => readJsonResponse<PublicEditorDraftResponse>(response));
    },
    updateDraft(token, patch) {
      return fetch(joinBffPath(baseUrl, `/drafts/${encodeURIComponent(token)}`), {
        method: 'PATCH',
        credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }).then((response) => readJsonResponse<PublicEditorDraftResponse>(response));
    },
    listDraftFiles(token) {
      return fetch(joinBffPath(baseUrl, `/drafts/${encodeURIComponent(token)}/files`), { credentials })
        .then((response) => readJsonResponse<PublicEditorDraftFile[]>(response));
    },
    uploadDraftFile(token, file, onProgress) {
      return uploadFileWithProgress(
        joinBffPath(baseUrl, `/drafts/${encodeURIComponent(token)}/files`),
        file,
        credentials,
        onProgress,
      );
    },
    async finalizeDraft(token, payload) {
      await fetch(joinBffPath(baseUrl, `/drafts/${encodeURIComponent(token)}/finalize`), {
        method: 'POST',
        credentials,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then((response) => readJsonResponse<Record<string, unknown>>(response));
    },
  };
}

export const crmPreviewPublicDesignEditorAdapter: PublicDesignEditorAdapter = {
  async createDraft(payload) {
    const res = await createPublicEditorPreviewDraft(payload);
    return res.data as PublicEditorDraftResponse;
  },
  async getDraft(token) {
    const res = await getPublicEditorPreviewDraft(token);
    return res.data as PublicEditorDraftResponse;
  },
  async updateDraft(token, patch) {
    const res = await updatePublicEditorPreviewDraft(token, patch);
    return res.data as PublicEditorDraftResponse;
  },
  async listDraftFiles(token) {
    const res = await listPublicEditorPreviewDraftFiles(token);
    return res.data;
  },
  async uploadDraftFile(token, file, onProgress) {
    const res = await uploadPublicEditorPreviewDraftFile(token, file, (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    return res.data;
  },
  async finalizeDraft(token, payload) {
    await finalizePublicEditorPreviewDraft(token, payload);
  },
};

/**
 * Adapter for a production website integration.
 * In production these API calls should point to the website backend/proxy, not
 * directly to CRM from the browser with WEBSITE_ORDER_API_KEY.
 */
export const publicWebsiteDesignEditorAdapter: PublicDesignEditorAdapter = {
  async createDraft(payload) {
    const res = await createPublicEditorDraft(payload);
    return res.data as PublicEditorDraftResponse;
  },
  async getDraft(token) {
    const res = await getPublicEditorDraft(token);
    return res.data as PublicEditorDraftResponse;
  },
  async updateDraft(token, patch) {
    const res = await updatePublicEditorDraft(token, patch);
    return res.data as PublicEditorDraftResponse;
  },
  async listDraftFiles(token) {
    const res = await listPublicEditorDraftFiles(token);
    return res.data;
  },
  async uploadDraftFile(token, file, onProgress) {
    const res = await uploadPublicEditorDraftFile(token, file, (event) => {
      if (event.total) onProgress?.(Math.round((event.loaded / event.total) * 100));
    });
    return res.data;
  },
  async finalizeDraft(token, payload) {
    await finalizePublicEditorDraft(token, payload);
  },
};
