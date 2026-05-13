import {
  createPublicEditorDraft,
  createPublicEditorPreviewDraft,
  finalizePublicEditorPreviewDraft,
  finalizePublicEditorDraft,
  getPublicEditorDraft,
  getPublicEditorPreviewDraft,
  updatePublicEditorDraft,
  updatePublicEditorPreviewDraft,
  uploadPublicEditorDraftFile,
  uploadPublicEditorPreviewDraftFile,
} from '../../api';

export interface PublicEditorDraftResponse {
  token: string;
  payloadParsed?: Record<string, unknown>;
}

export interface PublicDesignEditorAdapter {
  createDraft: (payload: Record<string, unknown>) => Promise<PublicEditorDraftResponse>;
  getDraft: (token: string) => Promise<PublicEditorDraftResponse>;
  updateDraft: (token: string, patch: Record<string, unknown>) => Promise<void>;
  uploadDraftFile: (token: string, file: File) => Promise<{ id?: number; url: string; originalName?: string }>;
  finalizeDraft?: (token: string, payload: Record<string, unknown>) => Promise<void>;
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
    await updatePublicEditorPreviewDraft(token, patch);
  },
  async uploadDraftFile(token, file) {
    const res = await uploadPublicEditorPreviewDraftFile(token, file);
    return { id: res.data.id, url: res.data.url, originalName: res.data.originalName };
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
    await updatePublicEditorDraft(token, patch);
  },
  async uploadDraftFile(token, file) {
    const res = await uploadPublicEditorDraftFile(token, file);
    return { id: res.data.id, url: res.data.url, originalName: res.data.originalName };
  },
  async finalizeDraft(token, payload) {
    await finalizePublicEditorDraft(token, payload);
  },
};
