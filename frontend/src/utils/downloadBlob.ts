import type { AxiosResponse } from 'axios';

export function filenameFromContentDisposition(header: string | undefined, fallback: string): string {
  if (!header) return fallback;
  const filenameMatch = header.match(/filename\*?=(?:UTF-8'')?((['"]).*?\2|[^;\n]*)/i)
    ?? header.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (!filenameMatch?.[1]) return fallback;
  let filename = filenameMatch[1].replace(/['"]/g, '');
  try {
    filename = decodeURIComponent(filename);
  } catch {
    // оставляем как есть
  }
  return filename || fallback;
}

export function downloadAxiosBlob(
  response: Pick<AxiosResponse<BlobPart>, 'data' | 'headers'>,
  fallbackName: string,
  mimeType: string,
): void {
  const headers = response.headers as Record<string, string | undefined> | undefined;
  const contentType = String(headers?.['content-type'] || mimeType);
  const blob = new Blob([response.data], { type: contentType });
  const filename = filenameFromContentDisposition(headers?.['content-disposition'], fallbackName);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function getApiErrorMessage(error: unknown, fallback = 'Ошибка'): Promise<string> {
  const err = error as { message?: string; responseData?: unknown };
  const data = err.responseData;
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      const json = JSON.parse(await data.text()) as { message?: string; error?: string };
      return json.message || json.error || err.message || fallback;
    } catch {
      return err.message || fallback;
    }
  }
  return err?.message || fallback;
}
