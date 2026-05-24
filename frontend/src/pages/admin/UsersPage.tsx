import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Checkbox, message, Tag, Space, Popconfirm, Tooltip } from "antd";
import { SettingOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/auth";
import { adminApi, type AdminUser, type RoleItem } from "../../api/admin";

const UsersPage: FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm("user:assign");

  // 编辑角色弹窗
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

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

  const openRoleEdit = (user: AdminUser) => {
    setEditUser(user);
    setEditRoleIds([...user.role_ids]);
  };

  const saveRoles = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await adminApi.updateUserRoles(editUser.id, editRoleIds);
      message.success("角色已更新");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editUser.id
            ? {
                ...u,
                role_ids: editRoleIds,
                role_names: editRoleIds.map((rid) => roles.find((r) => r.id === rid)?.name || "").filter(Boolean),
                permissions: editRoleIds.flatMap((rid) =>
                  roles.find((r) => r.id === rid)?.permissions.map((p) => p.code) || []
                ),
              }
            : u
        )
      );
      setEditUser(null);
    } catch { message.error("更新失败"); }
    finally { setSaving(false); }
  };

  const toggleDisable = async (user: AdminUser) => {
    try {
      const res = await adminApi.disableUser(user.id);
      message.success(res.is_disabled ? "已禁用" : "已启用");
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_disabled: res.is_disabled } : u))
      );
    } catch { message.error("操作失败"); }
  };

  const deleteUser = async (user: AdminUser) => {
    try {
      await adminApi.deleteUser(user.id);
      message.success("已删除");
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch { message.error("删除失败"); }
  };

  const isSuperAdmin = (u: AdminUser) => u.permissions?.includes("*") || false;

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: "0 0 24px" }}>用户管理</h2>
      <Table
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        scroll={{ y: "calc(100vh - 330px)" }}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          {
            title: "用户名",
            dataIndex: "username",
            render: (name: string, record: AdminUser) => (
              <span>
                {record.is_disabled ? (
                  <Tooltip title="已禁用">
                    <span style={{ color: "#b8afa6", textDecoration: "line-through" }}>{name}</span>
                  </Tooltip>
                ) : (
                  name
                )}
              </span>
            ),
          },
          { title: "邮箱", dataIndex: "email" },
          ...(canManage
            ? [
                {
                  title: "角色",
                  width: 160,
                  render: (_: unknown, record: AdminUser) => (
                    <Button
                      size="small"
                      icon={<SettingOutlined />}
                      onClick={() => openRoleEdit(record)}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      分配角色
                      {record.role_names?.length ? ` (${record.role_names.length})` : ""}
                    </Button>
                  ),
                },
              ]
            : [
                {
                  title: "角色",
                  width: 140,
                  render: (_: unknown, record: AdminUser) =>
                    record.role_names?.length ? (
                      record.role_names.map((n) => <Tag key={n}>{n}</Tag>)
                    ) : (
                      <span style={{ color: "#b8afa6", fontSize: 11 }}>未分配</span>
                    ),
                },
              ]),
          {
            title: "注册时间",
            dataIndex: "created_at",
            width: 170,
            render: (v: string) => new Date(v).toLocaleString("zh-CN"),
          },
          ...(canManage
            ? [
                {
                  title: "操作",
                  width: 160,
                  render: (_: unknown, record: AdminUser) => (
                    <Space size={4}>
                      <Popconfirm
                        title={record.is_disabled ? "确认启用？" : "确认禁用？"}
                        onConfirm={() => toggleDisable(record)}
                      >
                        <Button
                          size="small"
                          type="text"
                          icon={record.is_disabled ? <CheckCircleOutlined /> : <StopOutlined />}
                          danger={!record.is_disabled}
                          style={record.is_disabled ? { color: "#22c55e" } : undefined}
                        >
                          {record.is_disabled ? "启用" : "禁用"}
                        </Button>
                      </Popconfirm>
                      {!isSuperAdmin(record) && (
                        <Popconfirm
                          title="确认删除该用户？此操作不可恢复"
                          onConfirm={() => deleteUser(record)}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                          >
                            删除
                          </Button>
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
      />

      {/* 角色分配弹窗 */}
      <Modal
        title={`分配角色 — ${editUser?.username}`}
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        onOk={saveRoles}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={420}
      >
        <div style={{ padding: "12px 0" }}>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            为 <strong>{editUser?.username}</strong> 选择角色
            {editUser?.role_names?.length ? (
              <span style={{ marginLeft: 4 }}>
                （当前：<Tag style={{ fontSize: 11 }}>{editUser.role_names.join(", ")}</Tag>）
              </span>
            ) : (
              <span style={{ marginLeft: 4, color: "#b8afa6" }}>（当前无角色）</span>
            )}
          </div>
          <Checkbox.Group
            value={editRoleIds}
            onChange={(values) => setEditRoleIds(values as number[])}
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
          >
            {roles.map((r) => (
              <Checkbox key={r.id} value={r.id}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                {r.description && (
                  <span style={{ fontSize: 11, color: "#b8afa6", marginLeft: 6 }}>{r.description}</span>
                )}
                <span style={{ fontSize: 10, color: "#9ca3af", marginLeft: 6 }}>
                  {r.permissions.length} 项权限
                </span>
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
