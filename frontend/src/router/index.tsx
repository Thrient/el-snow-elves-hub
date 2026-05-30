import { type FC, type ReactNode, useMemo } from "react";
import { Navigate, useRoutes, type RouteObject } from "react-router-dom";
import { useRoutesStore } from "@/store/routes";
import { resolveIcon } from "@/components/IconResolver";
import RouteGuard from "@/components/RouteGuard";
import type { RoutePublic } from "@/types";

// ── Auto component registry ──
import AdminLayout from "@/layout/AdminLayout";

const pageMods = import.meta.glob("../pages/**/*.tsx", { eager: true }) as Record<string, { default: FC<any>; page?: string }>;

const registry = new Map<string, FC<any>>();
registry.set("AdminLayout", AdminLayout);
for (const mod of Object.values(pageMods)) { if (mod?.page) registry.set(mod.page, mod.default); }

let _names: string[] | null = null;
export function getComponentNames(): string[] {
  if (!_names) _names = [...registry.keys()].sort();
  return _names;
}

function getComponent(name: string | null): FC<any> {
  if (name && registry.has(name)) return registry.get(name)!;
  return NotFound;
}

const NotFound: FC = () => (
  <div className="text-center py-20 text-[#b8afa6]">404 · 页面不存在</div>
);

// ── Route tree builder ──

function buildRoutes(items: RoutePublic[], parentPath = ""): RouteObject[] {
  return items.map((route) => {
    const Comp = getComponent(route.component);
    const isLayout = route.component === "AdminLayout";

    const content = <Comp title={route.title} />;
    const element = route.perm
      ? <RouteGuard perm={route.perm}>{content}</RouteGuard>
      : content;

    const localPath = parentPath && route.path.startsWith(parentPath + "/")
      ? route.path.slice(parentPath.length + 1)
      : route.path;

    const obj: RouteObject = { path: localPath, element: element as ReactNode };

    if (route.children?.length) {
      obj.children = buildRoutes(route.children, route.path);
      if (isLayout) {
        obj.children.unshift({
          index: true,
          element: <Navigate to={route.children[0].path} replace />,
        });
      }
    }

    return obj;
  });
}

// ── Hooks ──

export function useAppRoutes() {
  const routes = useRoutesStore((s) => s.routes);

  const routeObjects = useMemo(() => {
    const tree = buildRoutes(routes);
    tree.push({ path: "*", element: <NotFound /> });
    return tree;
  }, [routes]);

  return useRoutes(routeObjects);
}

type MenuItem = { key: string; icon?: ReactNode; label: string; children?: MenuItem[] };

export function useAppMenu(): MenuItem[] {
  const routes = useRoutesStore((s) => s.routes);

  return useMemo(() => {
    function build(items: RoutePublic[]): MenuItem[] {
      return items
        .filter((r) => r.in_menu)
        .map((route) => {
          const IconComp = resolveIcon(route.icon);
          const item: MenuItem = { key: route.path, icon: IconComp ? <IconComp /> : undefined, label: route.title };
          if (route.children?.length) item.children = build(route.children);
          return item;
        });
    }
    return build(routes);
  }, [routes]);
}
