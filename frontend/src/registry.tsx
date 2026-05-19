import { lazy, type ComponentType } from "react";

// ── Eagerly imported pages ──
import HomePage from "./pages/HomePage";
import DownloadPage from "./pages/DownloadPage";
import ForumPage from "./pages/ForumPage";
import ForumBoardPage from "./pages/ForumBoardPage";
import ForumThreadPage from "./pages/ForumThreadPage";
import ForumCreatePage from "./pages/ForumCreatePage";
import ForumSearchPage from "./pages/ForumSearchPage";
import MarketPage from "./pages/MarketPage";
import TaskDetailPage from "./pages/TaskDetailPage";
import RankingPage from "./pages/RankingPage";
import AuthorPage from "./pages/AuthorPage";
import UploadPage from "./pages/UploadPage";
import ProfilePage from "./pages/ProfilePage";
import LoginPage from "./pages/LoginPage";
import NotificationsPage from "./pages/NotificationsPage";
import AdminLayout from "./pages/admin/AdminLayout";
import DashboardPage from "./pages/admin/DashboardPage";
import UsersPage from "./pages/admin/UsersPage";
import RolesPage from "./pages/admin/RolesPage";
import PermissionsPage from "./pages/admin/PermissionsPage";
import VersionsPage from "./pages/admin/VersionsPage";
import TasksPage from "./pages/admin/TasksPage";

// ── Lazily loaded pages ──
const GenericPage = lazy(() => import("./pages/GenericPage"));
const RoutesPage = lazy(() => import("./pages/admin/RoutesPage"));

const componentRegistry: Record<string, ComponentType<any>> = {
  HomePage,
  DownloadPage,
  ForumPage,
  ForumBoardPage,
  ForumThreadPage,
  ForumCreatePage,
  ForumSearchPage,
  MarketPage,
  TaskDetailPage,
  RankingPage,
  AuthorPage,
  UploadPage,
  ProfilePage,
  LoginPage,
  NotificationsPage,
  AdminLayout,
  DashboardPage,
  UsersPage,
  RolesPage,
  PermissionsPage,
  VersionsPage,
  TasksPage,
  RoutesPage,
  GenericPage,
};

export function getComponent(key: string | null): ComponentType<any> {
  if (key && componentRegistry[key]) {
    return componentRegistry[key];
  }
  return GenericPage;
}

export default componentRegistry;
