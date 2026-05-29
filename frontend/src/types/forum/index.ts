export interface ForumBoard {
  id: number;
  name: string;
  description: string | null;
  thread_count: number;
  created_at: string;
}

export interface PostAuthor {
  id: number;
  username: string;
  avatar_url: string | null;
}

export interface ThreadItem {
  id: number;
  title: string | null;
  content: string;
  author: PostAuthor | null;
  image_urls: string[];
  is_pinned: boolean;
  is_locked: boolean;
  view_count: number;
  reply_count: number;
  last_reply_at: string | null;
  created_at: string;
}

export interface ReplyItem {
  id: number;
  content: string;
  author: PostAuthor | null;
  parent_id: number | null;
  parent_author: string | null;
  parent_content: string | null;
  image_urls: string[];
  like_count: number;
  created_at: string;
  updated_at: string | null;
}

export interface ThreadDetail extends ThreadItem {
  board_id: number;
  board_name: string;
  like_count: number;
  updated_at: string;
  replies: ReplyItem[];
}
