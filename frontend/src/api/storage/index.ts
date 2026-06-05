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

  chunk: (sha256: string, n: number, total: number, filename: string, blob: Blob, onProgress?: (e: ProgressEvent) => void) => {
    const form = new FormData();
    form.append("chunk", blob);
    return api.upload(
      `/api/v1/uploads/chunk?sha256=${encodeURIComponent(sha256)}&n=${n}&total=${total}&filename=${encodeURIComponent(filename)}`,
      form,
      onProgress,
    );
  },

  complete: (sha256: string, totalChunks: number): Promise<{ fingerprint_id: number }> =>
    api.post<{ code: number; data: { fingerprint_id: number } }>("/api/v1/uploads/complete", { sha256, total_chunks: totalChunks })
      .then((r) => r.data),

  direct: (file: File, onProgress?: (e: ProgressEvent) => void): Promise<{ fingerprint_id: number }> => {
    const form = new FormData();
    form.append("file", file);
    return api.upload("/api/v1/uploads/direct", form, onProgress);
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
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ── Global concurrency pool ──

const PARALLEL_LIMIT = 3;

async function pooledUpload(
  tasks: Array<() => Promise<void>>,
): Promise<void> {
  const running = new Set<Promise<void>>();
  for (const task of tasks) {
    const p = task().then(() => { running.delete(p); });
    running.add(p);
    if (running.size >= PARALLEL_LIMIT) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);
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

  // Smooth animation for existing files (skip if no progress callback)
  if (onProgress && basePct > hashEndPct) {
    await new Promise<void>((resolve) => {
      smoothProgress(hashEndPct, basePct, 600,
        (pct) => onProgress?.({ overallPct: pct, phase: "uploading", detail: `${formatBytes(existingBytes)} 秒传` }),
        resolve,
      );
    });
  }

  // ── Phase 4: Upload remaining files (basePct → 100%, byte-weighted, global pool) ──
  const results: UploadResult[] = [];

  // 4a. Already-existing files (no upload needed)
  for (const { file, sha256 } of filesWithHash) {
    const fpId = existingMap.get(sha256);
    if (fpId != null) {
      results.push({ file, sha256, fingerprint_id: fpId });
    }
  }

  // 4b. Init chunked files, collect metadata
  const filesToUpload = filesWithHash.filter(f => !existingMap.has(f.sha256));
  const metas: Array<{
    file: File; sha256: string; totalChunks: number; uploadedSet: Set<number>;
  }> = [];

  for (const { file, sha256 } of filesToUpload) {
    if (file.size <= DIRECT_THRESHOLD) {
      metas.push({ file, sha256, totalChunks: 0, uploadedSet: new Set() });
    } else {
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const { chunks: existingChunks } = await uploadApi.init(sha256, totalChunks, file.name);
      metas.push({ file, sha256, totalChunks, uploadedSet: new Set(existingChunks) });
    }
  }

  // 4c. Global byte counter + progress emitter
  let globalUploadedBytes = 0;
  const emitProgress = () => {
    if (remainingBytes <= 0) return;
    const pct = basePct + (globalUploadedBytes / remainingBytes) * (100 - basePct);
    onProgress?.({
      overallPct: Math.min(pct, 99.9),
      phase: "uploading",
      detail: `${formatBytes(globalUploadedBytes)} / ${formatBytes(remainingBytes)}`,
    });
  };
  emitProgress();

  // 4d. Build all tasks (direct + chunked) into one flat array
  const allTasks: Array<() => Promise<void>> = [];
  const directResults: Array<{ file: File; sha256: string; fingerprint_id: number }> = [];

  for (const meta of metas) {
    if (meta.totalChunks === 0) {
      // ── Direct upload (≤10MB): one task per file ──
      allTasks.push(async () => {
        let last = 0;
        const { fingerprint_id } = await uploadApi.direct(meta.file, (e: ProgressEvent) => {
          globalUploadedBytes += e.loaded - last;
          last = e.loaded;
          emitProgress();
        });
        globalUploadedBytes += meta.file.size - last;
        emitProgress();
        directResults.push({ file: meta.file, sha256: meta.sha256, fingerprint_id });
      });
    } else {
      // ── Chunked upload: count already-uploaded, create task per remaining chunk ──
      for (const idx of meta.uploadedSet) {
        const chunkSize = Math.min(CHUNK_SIZE, meta.file.size - idx * CHUNK_SIZE);
        globalUploadedBytes += chunkSize;
      }
      emitProgress();

      for (let i = 0; i < meta.totalChunks; i++) {
        if (meta.uploadedSet.has(i)) continue;
        const chunkIndex = i;
        allTasks.push(async () => {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, meta.file.size);
          const blob = meta.file.slice(start, end);
          let last = 0;
          await uploadApi.chunk(
            meta.sha256, chunkIndex, meta.totalChunks, meta.file.name, blob,
            (e: ProgressEvent) => {
              globalUploadedBytes += e.loaded - last;
              last = e.loaded;
              emitProgress();
            },
          );
          globalUploadedBytes += blob.size - last;
          emitProgress();
        });
      }
    }
  }

  // 4e. Execute global pool (limit=3, hardcoded in pooledUpload)
  await pooledUpload(allTasks);

  // 4f. Collect direct upload results
  results.push(...directResults);

  // 4g. Complete chunked files
  for (const meta of metas) {
    if (meta.totalChunks > 0) {
      const { fingerprint_id } = await uploadApi.complete(meta.sha256, meta.totalChunks);
      results.push({ file: meta.file, sha256: meta.sha256, fingerprint_id });
    }
  }

  // ── Phase 5: Done ──
  onProgress?.({ overallPct: 100, phase: "done", detail: "完成" });
  const resultMap = new Map(results.map((r) => [r.file, r]));
  return files.map((f) => resultMap.get(f)!);
}

// ── Legacy wrapper ──
export async function uploadFile(
  file: File,
  onProgress?: (pct: number, phase: string) => void,
): Promise<{ fingerprint_id: number }> {
  const results = await upload(file, (p) => {
    onProgress?.(p.overallPct, p.phase);
  });
  return { fingerprint_id: results[0].fingerprint_id };
}
