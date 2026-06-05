import { api } from "@/api/axios";

const CHUNK_SIZE = 5 * 1024 * 1024;       // 5MB
const DIRECT_THRESHOLD = 10 * 1024 * 1024; // ≤10MB direct upload

// ── Check result ──
interface BatchCheckResult {
  existing: { sha256: string; fingerprint_id: number }[];
  missing: string[];
}

// ── Upload result ──
export interface UploadResult {
  file: File;
  sha256: string;
  fingerprint_id: number;
}

// ── Internal API ──
const uploadApi = {
  check: (sha256_list: string[]): Promise<BatchCheckResult> =>
    api.post<{ code: number; data: BatchCheckResult }>("/api/v1/files/check", { sha256: sha256_list })
      .then((r) => r.data),

  init: (sha256: string, totalChunks: number, filename: string): Promise<{
    exists: boolean; chunks: number[]; total_chunks: number;
  }> =>
    api.post<{ code: number; data: any }>("/api/v1/uploads/init", { sha256, total_chunks: totalChunks, filename })
      .then((r) => r.data),

  chunk: (sha256: string, n: number, total: number, filename: string, blob: Blob) => {
    const form = new FormData();
    form.append("chunk", blob);
    return api.post(
      `/api/v1/uploads/chunk?sha256=${encodeURIComponent(sha256)}&n=${n}&total=${total}&filename=${encodeURIComponent(filename)}`,
      form
    );
  },

  complete: (sha256: string, totalChunks: number): Promise<{ fingerprint_id: number }> =>
    api.post<{ code: number; data: { fingerprint_id: number } }>("/api/v1/uploads/complete", { sha256, total_chunks: totalChunks })
      .then((r) => r.data),

  direct: (file: File): Promise<{ fingerprint_id: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ code: number; data: { fingerprint_id: number } }>("/api/v1/uploads/direct", form)
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

// ── Helpers ──

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function smoothProgress(
  from: number, to: number, durationMs: number,
  onFrame: (pct: number) => void,
  onDone: () => void,
): void {
  if (from >= to || durationMs <= 0) { onDone(); return; }
  const start = performance.now();
  const step = () => {
    const t = Math.min((performance.now() - start) / durationMs, 1);
    onFrame(from + (to - from) * t);
    if (t < 1) requestAnimationFrame(step); else onDone();
  };
  requestAnimationFrame(step);
}

// ── Progress callback type ──
export type UploadProgress = {
  overallPct: number;          // 0-100 unified, feed directly to <Progress percent>
  phase: "hashing" | "checking" | "uploading" | "done";
  detail?: string;             // e.g. "3.2 MB / 10 MB" or "SHA256 5/10"
};

// ══════════════════════════════════════════════════
// Unified upload entry point
// ══════════════════════════════════════════════════

export async function upload(
  items: File | File[] | FileList,
  onProgress?: (p: UploadProgress) => void,
): Promise<UploadResult[]> {
  const files = items instanceof File
    ? [items]
    : Array.from(items as Iterable<File>);

  if (files.length === 0) return [];

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  // ── Phase 1: Compute SHA256 (0% → 20%, byte-weighted) ──
  let hashedBytes = 0;
  onProgress?.({ overallPct: 0, phase: "hashing", detail: `SHA256 0/${files.length}` });

  const filesWithHash: Array<{ file: File; sha256: string }> = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const sha256 = await computeSHA256(file, (pct) => {
      const currentHashed = hashedBytes + (file.size * pct / 100);
      const overallPct = totalBytes > 0 ? (currentHashed / totalBytes) * 20 : 0;
      onProgress?.({ overallPct, phase: "hashing", detail: `SHA256 ${i + 1}/${files.length}` });
    });
    filesWithHash.push({ file, sha256 });
    hashedBytes += file.size;
    const overallPct = totalBytes > 0 ? (hashedBytes / totalBytes) * 20 : 0;
    onProgress?.({ overallPct, phase: "hashing", detail: `SHA256 ${i + 1}/${files.length}` });
  }

  // ── Phase 2: Batch pre-check (hold at 20%) ──
  const hashEndPct = totalBytes > 0 ? (hashedBytes / totalBytes) * 20 : 20;
  onProgress?.({ overallPct: hashEndPct, phase: "checking", detail: `检测 ${filesWithHash.length} 个文件...` });
  const sha256List = filesWithHash.map((f) => f.sha256);
  const { existing } = await uploadApi.check(sha256List);
  const existingMap = new Map(existing.map((e) => [e.sha256, e.fingerprint_id]));

  // ── Phase 3: Animate existing files (20% → basePct over 600ms) ──
  const existingBytes = filesWithHash
    .filter((f) => existingMap.has(f.sha256))
    .reduce((s, f) => s + f.file.size, 0);
  const basePct = 20 + (totalBytes > 0 ? (existingBytes / totalBytes) * 80 : 0);
  const remainingBytes = totalBytes - existingBytes;

  // Smooth animation for existing files
  await new Promise<void>((resolve) => {
    smoothProgress(hashEndPct, basePct, 600,
      (pct) => onProgress?.({ overallPct: pct, phase: "uploading", detail: `${formatBytes(existingBytes)} 秒传` }),
      resolve,
    );
  });

  // ── Phase 4: Upload remaining files (basePct → 100%, byte-weighted) ──
  const results: UploadResult[] = [];
  let uploadedBytes = 0;

  onProgress?.({ overallPct: basePct, phase: "uploading", detail: `${formatBytes(0)} / ${formatBytes(remainingBytes)}` });

  for (let i = 0; i < filesWithHash.length; i++) {
    const { file, sha256 } = filesWithHash[i];
    const fpId = existingMap.get(sha256);
    if (fpId != null) {
      results.push({ file, sha256, fingerprint_id: fpId });
      continue;
    }
    const uploadResult = await uploadSingle(file, sha256, (pct) => {
      const currentUploaded = uploadedBytes + (file.size * pct / 100);
      const overallPct = basePct + (remainingBytes > 0 ? (currentUploaded / remainingBytes) * (100 - basePct) : 0);
      onProgress?.({ overallPct, phase: "uploading", detail: `${formatBytes(currentUploaded)} / ${formatBytes(remainingBytes)}` });
    });
    results.push({ file, sha256, fingerprint_id: uploadResult.fingerprint_id });
    uploadedBytes += file.size;
    const overallPct = basePct + (remainingBytes > 0 ? (uploadedBytes / remainingBytes) * (100 - basePct) : 0);
    onProgress?.({ overallPct: Math.min(overallPct, 100), phase: "uploading", detail: `${formatBytes(uploadedBytes)} / ${formatBytes(remainingBytes)}` });
  }

  // ── Phase 5: Done ──
  onProgress?.({ overallPct: 100, phase: "done", detail: "完成" });
  const resultMap = new Map(results.map((r) => [r.file, r]));
  return files.map((f) => resultMap.get(f)!);
}

// ── Single file dispatch ──
async function uploadSingle(
  file: File, sha256: string,
  onProgress?: (pct: number) => void,
): Promise<{ fingerprint_id: number }> {
  if (file.size <= DIRECT_THRESHOLD) {
    onProgress?.(50);
    const result = await uploadApi.direct(file);
    onProgress?.(100);
    return result;
  }

  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // init: query existing chunks (no session created)
  const { chunks: existingChunks } = await uploadApi.init(sha256, totalChunks, file.name);
  const uploadedSet = new Set(existingChunks);

  for (let i = 0; i < totalChunks; i++) {
    if (uploadedSet.has(i)) continue;  // skip already-uploaded

    const blob = file.slice(i * CHUNK_SIZE, Math.min((i + 1) * CHUNK_SIZE, file.size));
    await uploadApi.chunk(sha256, i, totalChunks, file.name, blob);
    onProgress?.(Math.round((i + 1) / totalChunks * 100));
  }

  onProgress?.(100);
  return uploadApi.complete(sha256, totalChunks);
}

// ── Legacy wrapper ──
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<{ fingerprint_id: number }> {
  const results = await upload(file, (p) => {
    onProgress?.(p.overallPct);
  });
  return { fingerprint_id: results[0].fingerprint_id };
}
