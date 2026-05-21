import { type FC } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Result } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/auth";
import { useRoutesStore } from "../../store/routes";
import { resolveIcon } from "../../components/IconResolver";
import type { MenuProps } from "antd";

const { Sider, Content } = Layout;

const AdminLayout: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const routes = useRoutesStore((s) => s.routes);
  const adminRoute = routes.find((r) => r.path === "/admin");
  const adminChildren = adminRoute?.children || [];

  if (!user) {
    return <Result status="403" title="请先登录" extra={<Button type="primary" onClick={() => navigate("/login")}>去登录</Button>} />;
  }
  if (!hasPerm("admin:access")) {
    return <Result status="403" title="无权限" subTitle="需要管理员权限" extra={<Button onClick={() => navigate("/")}>返回首页</Button>} />;
  }

  const menuItems: MenuProps["items"] = adminChildren.map((child) => {
    const IconComp = resolveIcon(child.icon);
    return {
      key: child.path,
      icon: IconComp ? <IconComp /> : undefined,
      label: child.title,
    };
  });

  return (
    <Layout style={{ flex: 1, minHeight: 0, background: "#faf8f5" }}>
      <Sider width={200} style={{ background: "#fff", borderRight: "1px solid #e8e3dc" }}>
        <div style={{ padding: "16px 20px", fontWeight: 600, fontSize: 13, color: "#6b5e55", borderBottom: "1px solid #e8e3dc" }}>
          管理后台
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: "none", paddingTop: 8 }}
        />
        <div style={{ padding: "12px 16px" }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")} block style={{ color: "#b8afa6" }}>
            返回前台
          </Button>
        </div>
      </Sider>
      <Content style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: 24 }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default AdminLayout;
