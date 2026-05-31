import { useEffect, useRef, useState, type FC } from "react";
import { Layout, Spin } from "antd";
import { useAuthStore } from "@/store/auth";
import { useRoutesStore } from "@/store/routes";
import { useAppRoutes } from "@/router";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useNavigationGuard } from "@/router/guards";
import AppHeader from "@/components/AppHeader";
import { authApi } from "@/api/identity";


const {Content, Footer} = Layout;

const AppLayout: FC = () => {
  const user = useAuthStore((s) => s.user);
  const validateSession = useAuthStore((s) => s.validateSession);
  const fetchRoutes = useRoutesStore((s) => s.fetchRoutes);
  const routesLoading = useRoutesStore((s) => s.loading);

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  // 仅在登录状态变化（有→无 / 无→有）或首次加载时拉取路由
  // 避免 token 刷新导致 user 对象引用变化时重新拉取路由 → 页面卸载
  const isLoggedIn = !!user;
  const wasLoggedIn = useRef(isLoggedIn);
  const hasFetched = useRef(false);
  useEffect(() => {
    if (isLoggedIn !== wasLoggedIn.current || !hasFetched.current) {
      wasLoggedIn.current = isLoggedIn;
      hasFetched.current = true;
      void fetchRoutes();
    }
  }, [isLoggedIn, fetchRoutes]);

  useAuthGuard();
  useNavigationGuard();

  const [sendingVerify, setSendingVerify] = useState(false);
  const [verifySent, setVerifySent] = useState(false);
  const handleResendVerify = async () => {
    setSendingVerify(true);
    try {
      await authApi.resendVerification();
      setVerifySent(true);
    } catch { /* ignore */ }
    finally { setSendingVerify(false); }
  };

  const routeElement = useAppRoutes();

  return (
    <Layout style={{minHeight: "100vh", display: "flex", flexDirection: "column", background: "#faf7f1"}}>
      <AppHeader/>

      {user && !user.email_verified && (
        <div className="flex items-center justify-center gap-3 px-4 py-2.5 text-[0.8125rem] text-[#6b5e55] bg-[#fef7e0] border-b border-solid border-[#f0d78c]">
          <span>你的邮箱尚未验证，请检查收件箱</span>
          {verifySent ? (
            <span className="text-[#52c41a]">已发送</span>
          ) : (
            <span onClick={handleResendVerify} className={`text-[#d4513b] cursor-pointer font-500 hover:underline ${sendingVerify ? "opacity-50 pointer-events-none" : ""}`}>
              {sendingVerify ? "发送中..." : "重新发送验证邮件"}
            </span>
          )}
        </div>
      )}

      <Content className="px-4 sm:px-6 lg:px-8 xl:px-12" style={{flex: 1, display: "flex", flexDirection: "column"}}>
        {routesLoading ? (
          <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}>
            <Spin size="large"/>
          </div>
        ) : (
          routeElement
        )}
      </Content>

      <Footer style={{
        flexShrink: 0,
        height: 40,
        padding: "10px 50px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        color: "#b8afa6",
        fontSize: 12,
        background: "transparent"
      }}>
        时雪-创意工坊 © {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default AppLayout;
