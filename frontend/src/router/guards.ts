import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/auth";

export function useNavigationGuard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const wasUser = useRef(!!user);

  useEffect(() => {
    if (loading) return;

    // 从已登录变成未登录：被踢下线 → 跳登录
    if (wasUser.current && !user) {
      navigate("/login");
    }
    wasUser.current = !!user;
  }, [user, loading, navigate]);
}
