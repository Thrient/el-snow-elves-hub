import { api } from "@/api/axios";

export interface PendingReview {
  id: number;
  content_type: string;
  content_id: number;
  title: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface PendingListResponse {
  items: PendingReview[];
  total: number;
}

export const reviewApi = {
  list: (params: { page?: number; size?: number; status?: string }): Promise<PendingListResponse> =>
    api.get<{ code: number; data: PendingListResponse }>(
      `/api/v1/reviews/pending`,
      { params: { page: params.page ?? 1, size: params.size ?? 20, status: params.status ?? "pending" } }
    ).then(r => r.data),

  decide: (recordId: number, status: string, reason?: string) =>
    api.post(`/api/v1/reviews/${recordId}/decide`, { status, reason }),
};
