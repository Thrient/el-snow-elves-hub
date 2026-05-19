import { useEffect, useState, type FC } from "react";
import { useNavigate, useLocation, useRoutes } from "react-router-dom";
import { ConfigProvider, Layout, Menu, Button, Badge, Popover, List, Spin } from "antd";
import { UserOutlined, BellOutlined } from "@ant-design/icons";
import { useAuthStore } from "./store/auth";
import { useRoutesStore } from "./store/routes";
import { useDynamicRoutes, useDynamicMenuItems } from "./router";
import { notificationApi, type NotificationItem } from "./api/notifications";

const { Header, Content, Footer } = Layout;

const AppShell: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const fetchRoutes = useRoutesStore((s) => s.fetchRoutes);
  const routesLoading = useRoutesStore((s) => s.loading);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  // 用户变化时重新拉取路由
  useEffect(() => {
    fetchRoutes();
  }, [user, fetchRoutes]);

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifPopover, setNotifPopover] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<NotificationItem[]>([]);

  // 首次加载 + SSE 实时推送未读数
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    const token = localStorage.getItem("token");
    if (!token) return;

    notificationApi.unreadCount().then(setUnreadCount);
    const es = new EventSource(`/api/v1/notifications/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const n = JSON.parse(e.data);
        if (n.id) {
          setUnreadCount((c) => c + 1);
          setRecentNotifs((prev) => [n, ...prev].slice(0, 5));
        }
      } catch {}
    };
    es.onerror = () => { /* SSE will auto-reconnect */ };
    return () => es.close();
  }, [user]);

  const loadRecentNotifs = () => {
    if (!user) return;
    notificationApi.list(1).then((d) => setRecentNotifs(d.items.slice(0, 5)));
  };

  const routes = useDynamicRoutes();
  const menuItems = useDynamicMenuItems();

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
              <Popover
                placement="bottomRight"
                trigger="click"
                open={notifPopover}
                onOpenChange={(v) => { setNotifPopover(v); if (v) { loadRecentNotifs(); notificationApi.unreadCount().then(setUnreadCount); } }}
                content={
                  <div style={{ width: 320 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#3d3630" }}>消息通知</span>
                      <Button type="link" size="small" style={{ fontSize: 11 }} onClick={() => { setNotifPopover(false); navigate("/notifications"); }}>
                        查看全部
                      </Button>
                    </div>
                    {recentNotifs.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#b8afa6", fontSize: 12 }}>暂无通知</div>
                    ) : (
                      <List
                        size="small"
                        dataSource={recentNotifs}
                        renderItem={(n) => (
                          <List.Item
                            style={{ cursor: "pointer", background: n.is_read ? "transparent" : "#fef3ef", borderRadius: 6, padding: "6px 8px", marginBottom: 2 }}
                            onClick={async () => {
                              if (!n.is_read) {
                                setUnreadCount((c) => Math.max(0, c - 1));
                                setRecentNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
                              }
                              notificationApi.markRead(n.id);
                              setNotifPopover(false);
                              if (n.link) navigate(n.link);
                            }}
                          >
                            <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                              <div style={{ color: n.is_read ? "#6b5e55" : "#3d3630", fontWeight: n.is_read ? 400 : 500 }}>
                                {n.content}
                              </div>
                              <div style={{ fontSize: 10, color: "#c4bbb2", marginTop: 2 }}>
                                {new Date(n.created_at).toLocaleString("zh-CN")}
                              </div>
                            </div>
                          </List.Item>
                        )}
                      />
                    )}
                  </div>
                }
              >
                <Badge count={unreadCount} size="small" offset={[-2, 2]}>
                  <Button type="text" size="small" icon={<BellOutlined />} style={{ color: "#6b5e55" }} />
                </Badge>
              </Popover>
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
        {routesLoading ? (
          <Spin size="large" style={{ display: "block", marginTop: "20vh" }} />
        ) : (
          useRoutes(routes)
        )}
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
