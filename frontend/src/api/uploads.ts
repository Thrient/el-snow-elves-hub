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
  file_id: number | null;
}

export const uploadApi = {
  /** Check if file already exists (instant upload) */
  check: async (md5: string): Promise<FileCheckResult> => {
    const { data } = await API.post<{ code: number; data: FileCheckResult }>("/files/check", { md5 });
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
  complete: async (uploadId: string): Promise<{ file_id: number }> => {
    const { data } = await API.post<{ code: number; data: { file_id: number } }>(`/uploads/${uploadId}/complete`);
    return data.data;
  },
};

/** Compute MD5 of a File incrementally, with progress callback */
export function computeMD5(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    // Dynamic import of spark-md5
    import("spark-md5").then(({ default: SparkMD5 }) => {
      const spark = new SparkMD5.ArrayBuffer();
      const chunkSize = CHUNK_SIZE;
      const totalChunks = Math.ceil(file.size / chunkSize);
      let currentChunk = 0;
      const reader = new FileReader();

      reader.onload = (e) => {
        if (!e.target?.result) return reject(new Error("Read failed"));
        spark.append(e.target.result as ArrayBuffer);
        currentChunk++;
        onProgress?.(Math.round((currentChunk / totalChunks) * 100));
        if (currentChunk < totalChunks) {
          readNext();
        } else {
          resolve(spark.end());
        }
      };

      reader.onerror = () => reject(new Error("Read error"));

      const readNext = () => {
        const start = currentChunk * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        reader.readAsArrayBuffer(file.slice(start, end));
      };

      readNext();
    }).catch(reject);
  });
}
