export interface VersionItem {
  id: number;
  version: string;
  platform: string;
  changelog: string | null;
  is_latest: boolean;
  is_mandatory: boolean;
  file_count: number;
  created_at: string;
}
