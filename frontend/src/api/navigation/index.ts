import { api } from "@/api/axios";
import type { RoutePublic } from "@/types";

export const navigationApi = {
  getRoutes: () => api.get<RoutePublic[]>("/api/v1/routes"),
};
