import { api } from "@/api/axios";

export interface PendingReview {
  id: number;
  content_type: string;
  content_id: number;
  title: string;
  reason: string | null;
  created_at: string;
}

export interface PendingListResponse {
  items: PendingReview[];
  total: number;
  page: number;
  size: number;
}

export const reviewApi = {
  pending: (page = 1, size = 20): Promise<PendingListResponse> =>
    api.get<{ code: number; data: PendingListResponse }>(
      `/api/v1/reviews/pending?page=${page}&size=${size}`
    ).then(r => r.data),

  decide: (recordId: number, status: string, reason?: string) =>
    api.post(`/api/v1/reviews/${recordId}/decide`, { status, reason }),
};
