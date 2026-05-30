import { useEffect } from "react";
import { bus } from "@/event/bus";
import { useAuthStore } from "@/store/auth";

export function useAuthGuard() {
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    bus.on("auth:expired", logout);
    return () => bus.off("auth:expired", logout);
  }, [logout]);
}
