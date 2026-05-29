export interface NotificationItem {
  id: number;
  type: string;
  content: string;
  link: string | null;
  sender_name: string | null;
  is_read: boolean;
  created_at: string;
}
