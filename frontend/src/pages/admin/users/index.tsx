import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Checkbox, message, Tag, Space, Popconfirm, Tooltip } from "antd";
import { SettingOutlined, StopOutlined, CheckCircleOutlined, DeleteOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { adminApi } from "@/api/admin";
import type { AdminUser, RoleItem } from "@/types";

const UsersPage: FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm("user:assign");

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([adminApi.listUsers(), adminApi.listRoles()]);
      setUsers(u); setRoles(r);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const saveRoles = async () => {
    if (!editUser) return;
    setSaving(true);
    try {
      await adminApi.updateUserRoles(editUser.id, editRoleIds);
      message.success("角色已更新");
      setUsers((prev) => prev.map((u) => u.id === editUser.id ? {
        ...u,
        role_ids: editRoleIds,
        role_names: editRoleIds.map((rid) => roles.find((r) => r.id === rid)?.name || "").filter(Boolean),
        permissions: editRoleIds.flatMap((rid) => roles.find((r) => r.id === rid)?.permissions.map((p) => p.code) || []),
      } : u));
      setEditUser(null);
    } catch { message.error("更新失败"); }
    finally { setSaving(false); }
  };

  const toggleDisable = async (user: AdminUser) => {
    try {
      const res = await adminApi.disableUser(user.id);
      message.success(res.is_disabled ? "已禁用" : "已启用");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_disabled: res.is_disabled } : u)));
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
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <h2 className="text-[1.125rem] font-600 text-[#3d3630] mb-6">用户管理</h2>
      <Table
        dataSource={users} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3"
        scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          {
            title: "用户名", dataIndex: "username",
            render: (name: string, record: AdminUser) =>
              record.is_disabled
                ? <Tooltip title="已禁用"><span className="text-[#b8afa6] line-through">{name}</span></Tooltip>
                : name,
          },
          { title: "邮箱", dataIndex: "email" },
          canManage ? {
            title: "角色", width: 160,
            render: (_: unknown, record: AdminUser) => (
              <Button size="small" icon={<SettingOutlined />} onClick={() => { setEditUser(record); setEditRoleIds([...record.role_ids]); }}>
                分配角色{record.role_names?.length ? ` (${record.role_names.length})` : ""}
              </Button>
            ),
          } : {
            title: "角色", width: 140,
            render: (_: unknown, record: AdminUser) =>
              record.role_names?.length
                ? record.role_names.map((n) => <Tag key={n}>{n}</Tag>)
                : <span className="text-[#b8afa6] text-[0.6875rem]">未分配</span>,
          },
          {
            title: "注册时间", dataIndex: "created_at", width: 170,
            render: (v: string) => new Date(v).toLocaleString("zh-CN"),
          },
          ...(canManage ? [{
            title: "操作", width: 160,
            render: (_: unknown, record: AdminUser) => (
              <Space size={4}>
                <Popconfirm title={record.is_disabled ? "确认启用？" : "确认禁用？"} onConfirm={() => toggleDisable(record)}>
                  <Button size="small" type="text"
                    icon={record.is_disabled ? <CheckCircleOutlined /> : <StopOutlined />}
                    danger={!record.is_disabled}
                    className={record.is_disabled ? "text-[#22c55e]" : ""}>
                    {record.is_disabled ? "启用" : "禁用"}
                  </Button>
                </Popconfirm>
                {!isSuperAdmin(record) && (
                  <Popconfirm title="确认删除该用户？此操作不可恢复" onConfirm={() => deleteUser(record)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />}>删除</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          }] : []),
        ]}
      />

      <Modal title={`分配角色 — ${editUser?.username}`} open={!!editUser}
        onCancel={() => setEditUser(null)} onOk={saveRoles} okText="保存" cancelText="取消"
        confirmLoading={saving} width={420}>
        <div className="py-3">
          <div className="text-[0.75rem] text-[#6b7280] mb-3">
            为 <strong>{editUser?.username}</strong> 选择角色
            {editUser?.role_names?.length
              ? <span className="ml-1">（当前：<Tag className="text-[0.6875rem]">{editUser.role_names.join(", ")}</Tag>）</span>
              : <span className="ml-1 text-[#b8afa6]">（当前无角色）</span>}
          </div>
          <Checkbox.Group value={editRoleIds} onChange={(values) => setEditRoleIds(values as number[])}
            className="flex flex-col gap-2">
            {roles.map((r) => (
              <Checkbox key={r.id} value={r.id}>
                <span className="text-[0.8125rem] font-500">{r.name}</span>
                {r.description && <span className="text-[0.6875rem] text-[#b8afa6] ml-1.5">{r.description}</span>}
                <span className="text-[0.625rem] text-[#9ca3af] ml-1.5">{r.permissions.length} 项权限</span>
              </Checkbox>
            ))}
          </Checkbox.Group>
        </div>
      </Modal>
    </div>
  );
};

export const page = "UsersPage";
export default UsersPage;
