import { useEffect, type FC } from "react";
import { useNavigate, useLocation, useRoutes } from "react-router-dom";
import { ConfigProvider, Layout, Menu, Button } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useAuthStore } from "./store/auth";
import { buildRoutes, buildMenuItems } from "./router";

const { Header, Content, Footer } = Layout;

const AppShell: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const hasPerm = useAuthStore((s) => s.hasPerm);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const routes = buildRoutes(hasPerm);
  const menuItems = buildMenuItems(hasPerm);

  return (
    <Layout style={{ minHeight: "100vh", background: "#faf8f5", overflow: "hidden" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          background: "#fff",
          borderBottom: "1px solid #e8e3dc",
          padding: "0 24px",
          position: "sticky",
          top: 0,
          zIndex: 100,
          height: 52,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            fontSize: 17,
            marginRight: 40,
            cursor: "pointer",
            color: "#3d3630",
            letterSpacing: "0.04em",
          }}
          onClick={() => navigate("/")}
        >
          时雪-创意工坊
        </div>

        <Menu
          mode="horizontal"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, border: "none", background: "transparent" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {user ? (
            <>
              <span style={{ fontSize: 13, color: "#6b5e55", fontWeight: 500, cursor: "pointer" }}
                onClick={() => navigate("/profile")}>
                {user.username}
              </span>
              <Button
                size="small"
                type="text"
                onClick={() => { logout(); navigate("/"); }}
                style={{ color: "#b8afa6" }}
              >
                退出
              </Button>
            </>
          ) : (
            <Button
              size="small"
              type="text"
              icon={<UserOutlined />}
              onClick={() => navigate("/login")}
              style={{ color: "#6b5e55" }}
            >
              登录
            </Button>
          )}
        </div>
      </Header>

      <Content style={{ padding: "24px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {useRoutes(routes)}
      </Content>

      <Footer style={{ textAlign: "center", color: "#b8afa6", fontSize: 12, background: "transparent" }}>
        时雪-创意工坊 © {new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

const App: FC = () => (
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: "#d4513b",
        borderRadius: 8,
        fontFamily: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`,
      },
    }}
  >
    <AppShell />
  </ConfigProvider>
);

export default App;
