import axios from "axios";
import { DOWNLOAD_HOST } from "./config";

const API = axios.create({ baseURL: "/api/v1" });

API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface VersionItem {
  id: number;
  version: string;
  platform: string;
  changelog: string | null;
  is_latest: boolean;
  is_mandatory: boolean;
  file_count: number;
  created_at: string;
}

export const versionsApi = {
  list: () =>
    API.get<{ code: number; data: VersionItem[] }>("/versions").then((r) => r.data.data),

  download: (id: number) => `${DOWNLOAD_HOST}/api/v1/versions/${id}/download`,
};
