import type { FC } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { useAppMenu } from "@/router";
import NotificationBell from "@/components/NotificationBell";

const { Header } = Layout;

const AppHeader: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const menuItems = useAppMenu();

  return (
    <Header
      style={{
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        background: "#fff",
        borderBottom: "1px solid #e8e3dc",
        padding: "0 24px",
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
            <NotificationBell />
            <span
              style={{ fontSize: 13, color: "#6b5e55", fontWeight: 500, cursor: "pointer" }}
              onClick={() => navigate("/profile")}
            >
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
  );
};

export default AppHeader;
