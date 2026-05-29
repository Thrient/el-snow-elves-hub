export interface AuthUser {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  role_names: string[];
  permissions: string[] | null;
}

export interface UserDownload {
  task_id: number;
  task_title: string;
  downloaded_at: string;
}

export interface UserLike {
  task_id: number;
  task_title: string;
  created_at: string;
}
