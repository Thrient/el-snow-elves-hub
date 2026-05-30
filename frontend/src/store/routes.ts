import { create } from "zustand";
import { navigationApi } from "@/api/navigation";
import type { RoutePublic } from "@/types";

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
      const routes = await navigationApi.getRoutes();
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
