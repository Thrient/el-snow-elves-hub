import axios from "axios";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export interface UploadSession {
  upload_id: string;
  total_chunks: number;
  expires_at: string;
}

export interface FileCheckResult {
  exists: boolean;
  fingerprint_id: number | null;
}

export const uploadApi = {
  /** Check if file already exists (instant upload via SHA256) */
  check: async (sha256: string): Promise<FileCheckResult> => {
    const { data } = await API.post<{ code: number; data: FileCheckResult }>("/files/check", { sha256 });
    return data.data;
  },

  /** Initialize a chunked upload session */
  init: async (filename: string, totalSize: number, totalChunks: number): Promise<UploadSession> => {
    const { data } = await API.post<{ code: number; data: UploadSession }>("/uploads/init", {
      filename, total_size: totalSize, total_chunks: totalChunks,
    });
    return data.data;
  },

  /** Upload a single chunk */
  uploadChunk: async (uploadId: string, chunkIndex: number, blob: Blob): Promise<void> => {
    const form = new FormData();
    form.append("chunk", blob);
    await API.post(`/uploads/${uploadId}/chunk?n=${chunkIndex}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  /** Complete the upload, assemble chunks */
  complete: async (uploadId: string): Promise<{ fingerprint_id: number }> => {
    const { data } = await API.post<{ code: number; data: { fingerprint_id: number } }>(`/uploads/${uploadId}/complete`);
    return data.data;
  },
};

/** Compute SHA256 of a File incrementally, with progress callback */
export function computeSHA256(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunkSize = CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);
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
        // Concatenate all chunks and hash
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
      const start = currentChunk * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };

    readNext();
  });
}
