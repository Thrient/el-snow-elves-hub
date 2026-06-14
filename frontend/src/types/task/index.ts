export interface TaskItem {
  id: number;
  title: string;
  description: string | null;
  author_id: number;
  author_name: string;
  author_avatar_url: string | null;
  category: string;
  tags: string | null;
  version: string;
  current_version: string;
  file_size: number | null;
  cover_url: string | null;
  status: string;
  download_count: number;
  like_count: number;
  comment_count: number;
  liked: boolean;
  created_at: string;
  versions: TaskVersionItem[];
}

export interface TaskVersionItem {
  id: number;
  version: string;
  file_name: string | null;
  file_size: number | null;
  changelog: string | null;
  created_at: string | null;
}

export interface CommentItem {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  user_avatar_url: string | null;
  content: string;
  parent_id: number | null;
  created_at: string;
}
