import { api } from "@/api/axios";
import type { UploadSession } from "@/types";

const CHUNK_SIZE = 5 * 1024 * 1024;       // 5MB
const DIRECT_THRESHOLD = 5 * 1024 * 1024; // ≤5MB direct upload

// ── Check result types ──
interface BatchCheckResult {
  existing: { sha256: string; record_id: number }[];
  missing: string[];
}

// ── Upload result ──
export interface UploadResult {
  file: File;
  sha256: string;
  record_id: number;
}

// ── Internal API ──
const uploadApi = {
  /** Batch pre-check (always uses batch mode, single file wraps to array) */
  check: (sha256_list: string[]): Promise<BatchCheckResult> =>
    api.post<{ code: number; data: BatchCheckResult }>("/api/v1/files/check", { sha256: sha256_list })
      .then((r) => r.data),

  /** Init chunked session (pass sha256 for server-side resume) */
  init: (filename: string, totalSize: number, totalChunks: number, sha256?: string): Promise<UploadSession> =>
    api.post<{ code: number; data: UploadSession }>("/api/v1/uploads/init", {
      filename, total_size: totalSize, total_chunks: totalChunks, sha256,
    }).then((r) => r.data),

  /** Upload a single chunk */
  uploadChunk: (uploadId: string, chunkIndex: number, blob: Blob) => {
    const form = new FormData();
    form.append("chunk", blob);
    return api.post(`/api/v1/uploads/${uploadId}/chunk?n=${chunkIndex}`, form);
  },

  /** Query upload session status — for resume */
  status: (uploadId: string): Promise<{
    upload_id: string; filename: string; total_size: number;
    total_chunks: number; uploaded_chunks: number[]; status: string;
  }> =>
    api.get<{ code: number; data: any }>(`/api/v1/uploads/${uploadId}`).then((r) => r.data),

  /** Complete chunked upload (no hash — backend computes from chunk data) */
  complete: (uploadId: string): Promise<{ record_id: number }> =>
    api.post<{ code: number; data: { record_id: number } }>(`/api/v1/uploads/${uploadId}/complete`, {})
      .then((r) => r.data),

  /** Small file direct upload (single request, server computes hash) */
  direct: (file: File): Promise<{ record_id: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ code: number; data: { record_id: number } }>("/api/v1/uploads/direct", form)
      .then((r) => r.data);
  },
};

// ── SHA256 computation (reads file once in 5MB steps, no full-file memory) ──
function computeSHA256(file: File, onProgress?: (pct: number) => void): Promise<string> {
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
          resolve(Array.from(new Uint8Array(hash))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join(""));
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

// ── Progress callback type ──
export type UploadProgress = {
  phase: "hashing" | "checking" | "uploading" | "done";
  current: number;   // current file index (0-based)
  total: number;     // total file count
  filePct?: number;  // current file progress (0-100)
};

// ══════════════════════════════════════════════════
// Unified upload entry point
// ══════════════════════════════════════════════════

/**
 * Unified file/folder upload
 * - file ≤5MB: direct upload POST /uploads/direct
 * - file >5MB: chunked POST /uploads/init → chunk → complete
 * - Batch pre-check: single POST /files/check for all files
 * - Frontend computes SHA256 once per file
 * - Backend computes hash from uploaded data, complete doesn't pass hash
 * - Server-side resume: init with sha256, backend finds existing session
 *
 * @param items Single file, file array, or FileList
 * @param onProgress Optional progress callback
 * @returns Upload results array (same order as input)
 */
export async function upload(
  items: File | File[] | FileList,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult[]> {
  const files = items instanceof File
    ? [items]
    : Array.from(items as Iterable<File>);

  if (files.length === 0) return [];

  const total = files.length;

  // ── Phase 1: Compute SHA256 for each file (serial, one read each) ──
  onProgress?.({ phase: "hashing", current: 0, total, filePct: 0 });
  const filesWithHash: Array<{ file: File; sha256: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sha256 = await computeSHA256(file, (pct) => {
      onProgress?.({ phase: "hashing", current: i, total, filePct: pct });
    });
    filesWithHash.push({ file, sha256 });
  }

  // ── Phase 2: Batch pre-check ──
  onProgress?.({ phase: "checking", current: 0, total, filePct: 0 });
  const sha256List = filesWithHash.map((f) => f.sha256);
  const { existing, missing } = await uploadApi.check(sha256List);
  const existingMap = new Map(existing.map((e) => [e.sha256, e.record_id]));
  const missingSet = new Set(missing);

  // ── Phase 3: Upload missing files ──
  const results: UploadResult[] = [];
  let uploadIndex = 0;
  const missingFiles = filesWithHash.filter((f) => missingSet.has(f.sha256));
  const totalUpload = missingFiles.length;

  onProgress?.({ phase: "uploading", current: 0, total: totalUpload, filePct: 0 });

  for (const { file, sha256 } of missingFiles) {
    const uploadResult = await uploadSingle(file, sha256, (pct) => {
      onProgress?.({ phase: "uploading", current: uploadIndex, total: totalUpload, filePct: pct });
    });
    results.push({ file, sha256, record_id: uploadResult.record_id });
    uploadIndex++;
  }

  // ── Existing files: return known record_ids ──
  for (const { file, sha256 } of filesWithHash) {
    const recordId = existingMap.get(sha256);
    if (recordId != null) {
      results.push({ file, sha256, record_id: recordId });
    }
  }

  // Sort by original order
  const resultMap = new Map(results.map((r) => [r.file, r]));
  onProgress?.({ phase: "done", current: total, total });

  return files.map((f) => resultMap.get(f)!);
}

// ── Single file upload dispatcher (with SHA256 server-side resume) ──
async function uploadSingle(
  file: File,
  sha256: string,
  onProgress?: (pct: number) => void,
): Promise<{ record_id: number }> {
  if (file.size <= DIRECT_THRESHOLD) {
    // ── Small file: direct upload ──
    onProgress?.(50);
    const result = await uploadApi.direct(file);
    onProgress?.(100);
    return result;
  }

  // ═══════════════════════════════════════════════
  // ── Large file: chunked + SHA256 server resume ──
  // ═══════════════════════════════════════════════
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // init with sha256 → backend finds existing session if same file was uploading
  // Browser crash/restart + re-select file = same SHA256 = same session = chunks preserved
  const session = await uploadApi.init(file.name, file.size, totalChunks, sha256);

  // Query uploaded chunks (new session returns empty, resume returns existing)
  const status = await uploadApi.status(session.upload_id);
  const uploadedSet = new Set<number>(status.uploaded_chunks ?? []);

  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) {
      onProgress?.(Math.round((i + 1) / totalChunks * 100));
      continue;  // ← Skip already-uploaded chunks (resume)
    }
    const start = i * CHUNK_SIZE;
    const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
    await uploadApi.uploadChunk(session.upload_id, i, blob);
    onProgress?.(Math.round((i + 1) / totalChunks * 100));
  }

  onProgress?.(100);
  return uploadApi.complete(session.upload_id);
}

// ── Legacy compatibility wrapper (single-file callers: task/forum) ──
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ record_id: number }> {
  const results = await upload(file, (p) => {
    if (p.total === 1) onProgress?.(p.filePct ?? 0);
  });
  return { record_id: results[0].record_id };
}
