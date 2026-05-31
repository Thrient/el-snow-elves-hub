export interface AdminStats {
  user_count: number;
  version_count: number;
  desktop_online: number;
  web_online: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role_names: string[];
  role_ids: number[];
  permissions: string[] | null;
  is_disabled: boolean;
  created_at: string;
}

export interface PermItem {
  id: number;
  code: string;
  name: string;
}

export interface RoleItem {
  id: number;
  name: string;
  description: string;
  permissions: { code: string; name: string }[];
}

export interface AdminVersion {
  id: number;
  version: string;
  platform: string;
  changelog: string | null;
  is_latest: boolean;
  is_mandatory: boolean;
  file_count: number | null;
  created_at: string;
}

export interface AdminTask {
  id: number;
  title: string;
  author_id: number;
  author_name: string;
  category: string;
  tags: string;
  version: string;
  description: string;
  status: string;
  download_count: number;
  like_count: number;
  file_size: number | null;
  cover_url: string | null;
  reviewed: boolean;
  created_at: string;
}

export interface AdminPost {
  id: number; title: string; content: string;
  author_name: string; board_id: number; status: string;
  reviewed: boolean; image_urls: string[]; created_at: string;
}

export interface RouteAdmin {
  id: number;
  path: string;
  title: string;
  icon: string | null;
  parent_id: number | null;
  perm: string | null;
  enabled: boolean;
  in_menu: boolean;
  sort_order: number;
  component: string | null;
  created_at: string;
  updated_at: string;
}
