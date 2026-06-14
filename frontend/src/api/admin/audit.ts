import { api } from "@/api/axios";

export interface AuditLogItem {
  id: number;
  user_id: number | null;
  username: string;
  action: string;
  resource_type: string;
  resource_id: number | null;
  detail: string;
  ip: string;
  created_at: string;
}

export const auditApi = {
  list: (params: Record<string, unknown>) =>
    api.get<{ code: number; data: { items: AuditLogItem[]; total: number; page: number; pages: number } }>("/api/v1/admin/audit-logs", { params }).then((r) => r.data),
};
