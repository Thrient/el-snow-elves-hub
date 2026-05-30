export interface UploadSession {
  upload_id: string;
  total_chunks: number;
  expires_at: string;
}

export interface FileCheckResult {
  exists: boolean;
  fingerprint_id: number | null;
}
