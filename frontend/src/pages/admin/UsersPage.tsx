import { useEffect, useState, type FC } from "react";
import { Table, Select, message, Tag, Space } from "antd";
import { adminApi, type AdminUser, type RoleItem } from "../../api/admin";

const UsersPage: FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([adminApi.listUsers(), adminApi.listRoles()]);
      setUsers(u);
      setRoles(r);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId: number, roleId: number) => {
    try {
      await adminApi.updateUserRole(userId, roleId);
      message.success("角色已更新");
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role_id: roleId, role_name: roles.find((r) => r.id === roleId)?.name || null, permissions: roles.find((r) => r.id === roleId)?.permissions.map((p) => p.code) || null } : u));
    } catch { message.error("更新失败"); }
  };

  const isSuperAdmin = (u: AdminUser) => u.permissions?.includes("*") || false;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", marginBottom: 24 }}>用户管理</h2>
      <Table
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "用户名", dataIndex: "username" },
          { title: "邮箱", dataIndex: "email" },
          {
            title: "角色", width: 140,
            render: (_: unknown, record: AdminUser) => (
              <Select
                value={record.role_id}
                size="small"
                style={{ width: 120 }}
                placeholder="未分配"
                allowClear
                onChange={(v) => changeRole(record.id, v)}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            ),
          },
          {
            title: "权限", width: 220,
            render: (_: unknown, record: AdminUser) => (
              <Space size={2} wrap>
                {isSuperAdmin(record) ? (
                  <Tag color="red">超级管理员（全部权限）</Tag>
                ) : record.permissions?.length ? (
                  record.permissions.map((p) => <Tag key={p} style={{ fontSize: 10 }}>{p}</Tag>)
                ) : (
                  <span style={{ fontSize: 11, color: "#b8afa6" }}>无权限</span>
                )}
              </Space>
            ),
          },
          {
            title: "注册时间", dataIndex: "created_at", width: 170,
            render: (v: string) => new Date(v).toLocaleString("zh-CN"),
          },
        ]}
      />
    </div>
  );
};

export default UsersPage;
