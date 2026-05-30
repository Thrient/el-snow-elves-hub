import { api } from "@/api/axios";
import type { VersionItem } from "@/types";

export const releaseApi = {
  list: () =>
    api.get<{ code: number; data: VersionItem[] }>("/api/v1/versions").then((r) => r.data),

  download: (id: number) => `/api/v1/versions/${id}/download`,
};
