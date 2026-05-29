export interface TaskItem {
  id: number;
  title: string;
  description: string | null;
  author_id: number;
  author_name: string;
  category: string;
  tags: string | null;
  version: string;
  file_size: number | null;
  cover_url: string | null;
  status: string;
  download_count: number;
  like_count: number;
  comment_count: number;
  liked: boolean;
  created_at: string;
}

export interface CommentItem {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  content: string;
  parent_id: number | null;
  created_at: string;
}
