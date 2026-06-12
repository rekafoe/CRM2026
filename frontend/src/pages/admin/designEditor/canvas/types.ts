export type EditorMode = 'basic' | 'advanced';

export type ResolveImageFileUrl = (
  file: File,
  onProgress?: (progress: number) => void,
) => Promise<string | null | undefined>;
