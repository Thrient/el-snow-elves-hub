import axios from "axios";

const publicApi = axios.create({ baseURL: "/api/v1" });

export interface RoutePublic {
  id: number;
  path: string;
  title: string;
  icon: string | null;
  parent_id: number | null;
  perm: string | null;
  component: string | null;
  children?: RoutePublic[];
}

export const routesApi = {
  getRoutes: async (): Promise<RoutePublic[]> => {
    const token = localStorage.getItem("token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const { data } = await publicApi.get<RoutePublic[]>("/routes", { headers });
    return data;
  },
};
