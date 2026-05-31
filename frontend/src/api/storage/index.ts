import { api } from "@/api/axios";
import type { UploadSession, FileCheckResult } from "@/types";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadApi = {
  check: (sha256: string): Promise<FileCheckResult> =>
    api.post<{ code: number; data: FileCheckResult }>("/api/v1/files/check", { sha256 }).then((r) => r.data),

  init: (filename: string, totalSize: number, totalChunks: number): Promise<UploadSession> =>
    api.post<{ code: number; data: UploadSession }>("/api/v1/uploads/init", {
      filename, total_size: totalSize, total_chunks: totalChunks,
    }).then((r) => r.data),

  uploadChunk: (uploadId: string, chunkIndex: number, blob: Blob) => {
    const form = new FormData();
    form.append("chunk", blob);
    return api.post(`/api/v1/uploads/${uploadId}/chunk?n=${chunkIndex}`, form);
  },

  complete: (uploadId: string): Promise<{ record_id: number }> =>
    api.post<{ code: number; data: { record_id: number } }>(`/api/v1/uploads/${uploadId}/complete`).then((r) => r.data),
};

/**
 * 统一文件上传 — 返回 { record_id }，消费端用 record_id 调用业务接口
 */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ record_id: number }> {
  const sha256 = await computeSHA256(file, (p) => onProgress?.(Math.round(p * 0.1)));
  const check = await uploadApi.check(sha256);
  if (check.exists && check.record_id) return { record_id: check.record_id };

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const session = await uploadApi.init(file.name, file.size, totalChunks);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    await uploadApi.uploadChunk(session.upload_id, i, blob);
    onProgress?.(10 + Math.round((i + 1) / totalChunks * 90));
  }

  return uploadApi.complete(session.upload_id);
}

export function computeSHA256(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks: ArrayBuffer[] = [];
    let currentChunk = 0;
    const reader = new FileReader();

    reader.onload = (e) => {
      if (!e.target?.result) return reject(new Error("Read failed"));
      chunks.push(e.target.result as ArrayBuffer);
      currentChunk++;
      onProgress?.(Math.round((currentChunk / totalChunks) * 100));
      if (currentChunk < totalChunks) {
        readNext();
      } else {
        const totalLength = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const c of chunks) {
          merged.set(new Uint8Array(c), offset);
          offset += c.byteLength;
        }
        crypto.subtle.digest("SHA-256", merged).then((hash) => {
          const hex = Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          resolve(hex);
        }).catch(reject);
      }
    };

    reader.onerror = () => reject(new Error("Read error"));

    const readNext = () => {
      const start = currentChunk * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };

    readNext();
  });
}
