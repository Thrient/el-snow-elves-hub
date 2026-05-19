import { create } from "zustand";
import { routesApi, type RoutePublic } from "../api/routes";

interface RoutesState {
  routes: RoutePublic[];
  loading: boolean;
  error: string | null;
  fetchRoutes: () => Promise<void>;
  getFlatRoutes: () => RoutePublic[];
}

export const useRoutesStore = create<RoutesState>((set, get) => ({
  routes: [],
  loading: false,
  error: null,

  fetchRoutes: async () => {
    set({ loading: true, error: null });
    try {
      const routes = await routesApi.getRoutes();
      set({ routes, loading: false });
    } catch {
      set({ error: "加载路由失败", loading: false });
    }
  },

  getFlatRoutes: () => {
    const flat: RoutePublic[] = [];
    const walk = (items: RoutePublic[]) => {
      for (const item of items) {
        flat.push(item);
        if (item.children) walk(item.children);
      }
    };
    walk(get().routes);
    return flat;
  },
}));
