import { type FC } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Result } from "antd";
import { DashboardOutlined, UserOutlined, TeamOutlined, SafetyCertificateOutlined, DownloadOutlined, AppstoreOutlined, ArrowLeftOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/auth";
import type { MenuProps } from "antd";

const { Sider, Content } = Layout;

const AdminLayout: FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);

  if (!user) {
    return <Result status="403" title="请先登录" extra={<Button type="primary" onClick={() => navigate("/login")}>去登录</Button>} />;
  }
  if (!hasPerm("admin.access")) {
    return <Result status="403" title="无权限" subTitle="需要管理员权限" extra={<Button onClick={() => navigate("/")}>返回首页</Button>} />;
  }

  const menuItems: MenuProps["items"] = [
    ...(hasPerm("dashboard.view") ? [{ key: "/admin/dashboard", icon: <DashboardOutlined />, label: "仪表盘" }] : []),
    ...(hasPerm("users.manage") ? [{ key: "/admin/users", icon: <UserOutlined />, label: "用户管理" }] : []),
    ...(hasPerm("users.manage") ? [{ key: "/admin/roles", icon: <TeamOutlined />, label: "角色管理" }] : []),
    ...(hasPerm("users.manage") ? [{ key: "/admin/permissions", icon: <SafetyCertificateOutlined />, label: "权限列表" }] : []),
    ...(hasPerm("versions.manage") ? [{ key: "/admin/versions", icon: <DownloadOutlined />, label: "下载版本" }] : []),
    ...(hasPerm("tasks.approve") ? [{ key: "/admin/tasks", icon: <AppstoreOutlined />, label: "任务管理" }] : []),
  ];

  return (
    <Layout style={{ minHeight: "calc(100vh - 52px - 70px)", background: "#faf8f5" }}>
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
        <div style={{ position: "absolute", bottom: 16, left: 0, right: 0, padding: "0 16px" }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/")} block style={{ color: "#b8afa6" }}>
            返回前台
          </Button>
        </div>
      </Sider>
      <Content style={{ padding: 24, overflow: "auto" }}>
        <Outlet />
      </Content>
    </Layout>
  );
};

export default AdminLayout;
