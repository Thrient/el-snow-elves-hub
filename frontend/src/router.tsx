import { type FC, type ReactNode } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import { useRoutesStore } from "./store/routes";
import { getComponent } from "./registry";
import { resolveIcon } from "./components/IconResolver";
import RouteGuard from "./components/RouteGuard";
import type { RoutePublic } from "./api/routes";

// ── NavItem (kept for external reference) ──

export interface NavItem {
  path: string;
  title: string;
  icon?: FC;
  perm?: string;
  children?: NavItem[];
}

// ── Helpers ──

function relativePath(childPath: string, parentPath: string): string {
  const base = parentPath.endsWith("/") ? parentPath.slice(0, -1) : parentPath;
  if (childPath.startsWith(base + "/")) return childPath.slice(base.length + 1);
  if (childPath === base) return "";
  return childPath;
}

function wrapElement(component: ReactNode, perm: string | null, _isLayout: boolean): ReactNode {
  if (perm) {
    return <RouteGuard perm={perm}>{component}</RouteGuard>;
  }
  return component;
}

// ── Dynamic route builder ──

export function useDynamicRoutes(): RouteObject[] {
  const routes = useRoutesStore((s) => s.routes);

  function buildRouteObjects(
    items: RoutePublic[],
    parentPath: string = ""
  ): RouteObject[] {
    return items.map((route) => {
      const Component = getComponent(route.component);
      const isLayout = route.component === "AdminLayout";
      const elem = <Component title={route.title} />;
      const guarded = wrapElement(elem, route.perm, isLayout);

      const routeObj: RouteObject = {
        path: parentPath
          ? relativePath(route.path, parentPath)
          : route.path,
        element: guarded as ReactNode,
      };

      if (route.children && route.children.length > 0) {
        routeObj.children = buildRouteObjects(route.children, route.path);
        // Add index redirect for layout routes
        if (isLayout && route.children.length > 0) {
          routeObj.children.unshift({
            index: true,
            element: <Navigate to={route.children[0].path} replace />,
          });
        }
      }

      return routeObj;
    });
  }

  const dynamicRoutes = buildRouteObjects(routes);

  // Catch-all 404
  dynamicRoutes.push({
    path: "*",
    element: (
      <div style={{ textAlign: "center", padding: 80, color: "#b8afa6" }}>
        404 · 页面不存在
      </div>
    ),
  });

  return dynamicRoutes;
}

// ── Dynamic menu builder ──

type MenuItem = {
  key: string;
  icon?: ReactNode;
  label: string;
  children?: MenuItem[];
};

export function useDynamicMenuItems(): MenuItem[] {
  const routes = useRoutesStore((s) => s.routes);

  function buildMenu(items: RoutePublic[]): MenuItem[] {
    return items
      .filter((r) => r.in_menu)
      .map((route) => {
        const IconComp = resolveIcon(route.icon);
        const item: MenuItem = {
          key: route.path,
          icon: IconComp ? <IconComp /> : undefined,
          label: route.title,
        };
        if (route.children && route.children.length > 0) {
          item.children = buildMenu(route.children);
        }
        return item;
      });
  }

  return buildMenu(routes);
}
