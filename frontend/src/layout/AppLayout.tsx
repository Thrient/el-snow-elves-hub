import { useEffect, type FC } from "react";
import { Layout, Spin } from "antd";
import { useAuthStore } from "@/store/auth";
import { useRoutesStore } from "@/store/routes";
import { useAppRoutes } from "@/router";
import { useAuthGuard } from "@/hooks/useAuthGuard";
import { useNavigationGuard } from "@/router/guards";
import AppHeader from "@/components/AppHeader";


const {Content, Footer} = Layout;

const AppLayout: FC = () => {
  const user = useAuthStore((s) => s.user);
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const fetchRoutes = useRoutesStore((s) => s.fetchRoutes);
  const routesLoading = useRoutesStore((s) => s.loading);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);
  useEffect(() => {
    void fetchRoutes();
  }, [user, fetchRoutes]);

  useAuthGuard();
  useNavigationGuard();

  const routeElement = useAppRoutes();

  return (
    <Layout style={{minHeight: "100vh", display: "flex", flexDirection: "column", background: "#faf7f1"}}>
      <AppHeader/>

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
