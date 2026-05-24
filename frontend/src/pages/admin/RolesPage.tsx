import { useEffect, useMemo, useState, type FC } from "react";
import { Table, Button, Modal, Checkbox, Input, message, Tag, Popconfirm, Space, Collapse } from "antd";
import { PlusOutlined, SettingOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi, type RoleItem, type PermItem } from "../../api/admin";
import { useAuthStore } from "../../store/auth";

const RolesPage: FC = () => {
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [allPerms, setAllPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editRole, setEditRole] = useState<RoleItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm("role:create");

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([adminApi.listRoles(), adminApi.listPermissions()]);
      setRoles(r);
      setAllPerms(p);
    } catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openPermEdit = (role: RoleItem) => {
    setEditRole(role);
    setSelectedIds(allPerms.filter((p) => role.permissions.some((rp) => rp.code === p.code)).map((p) => p.id));
  };

  const savePerms = async () => {
    if (!editRole) return;
    try {
      await adminApi.updateRolePermissions(editRole.id, selectedIds);
      message.success("权限已更新");
      setEditRole(null);
      load();
    } catch { message.error("更新失败"); }
  };

  const createRole = async () => {
    if (!formName.trim()) return message.warning("角色名不能为空");
    setSaving(true);
    try {
      await adminApi.createRole({ name: formName.trim(), description: formDesc.trim() || undefined });
      message.success("角色已创建");
      setCreateOpen(false);
      setFormName("");
      setFormDesc("");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "创建失败");
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (id: number) => {
    try {
      await adminApi.deleteRole(id);
      message.success("已删除");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "删除失败");
    }
  };

  const hasWildcard = (role: RoleItem) => role.permissions.some((p) => p.code === "*");

  // 按前缀分组权限（admin / user / role / perm / version / task / forum / route / comment）
  const permGroups = useMemo(() => {
    const groups: Record<string, PermItem[]> = {};
    const filtered = allPerms.filter((p) => p.code !== "*");
    for (const p of filtered) {
      const prefix = p.code.split(":")[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [allPerms]);

  const groupLabels: Record<string, string> = {
    admin: "管理后台",
    user: "用户管理",
    role: "角色管理",
    perm: "权限管理",
    version: "版本管理",
    task: "任务管理",
    forum: "论坛",
    route: "路由管理",
    comment: "评论管理",
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: 0 }}>角色管理</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建角色</Button>
        )}
      </div>

      <Table
        dataSource={roles}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        scroll={{ y: "calc(100vh - 330px)" }}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 60 },
          { title: "角色名", dataIndex: "name", width: 120 },
          { title: "描述", dataIndex: "description", render: (v: string | null) => v || "-" },
          {
            title: "权限", width: 360,
            render: (_: unknown, record: RoleItem) => (
              <span>
                {hasWildcard(record) ? (
                  <Tag color="red">超级管理员（全部权限）</Tag>
                ) : record.permissions.length ? (
                  record.permissions.map((p) => <Tag key={p.code} style={{ fontSize: 10 }}>{p.name}</Tag>)
                ) : (
                  <span style={{ fontSize: 11, color: "#b8afa6" }}>无权限</span>
                )}
              </span>
            ),
          },
          {
            title: "操作", width: 120,
            render: (_: unknown, record: RoleItem) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => openPermEdit(record)}>
                  权限
                </Button>
                {canManage && record.name !== "admin" && (
                  <Popconfirm title="确定删除此角色?" onConfirm={() => removeRole(record.id)} okText="删除" cancelText="取消">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* Edit permissions modal */}
      <Modal
        title={`编辑权限 — ${editRole?.name}`}
        open={!!editRole}
        onCancel={() => setEditRole(null)}
        onOk={savePerms}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <div style={{ padding: "12px 0", maxHeight: "60vh", overflowY: "auto" }}>
          <Checkbox
            checked={selectedIds.includes(allPerms.find((p) => p.code === "*")?.id ?? -1)}
            onChange={(e) => {
              const wildcardId = allPerms.find((p) => p.code === "*")?.id;
              if (!wildcardId) return;
              if (e.target.checked) setSelectedIds([wildcardId]);
              else setSelectedIds([]);
            }}
            style={{ marginBottom: 16, fontWeight: 600 }}
          >
            超级管理员（全部权限）
          </Checkbox>

          {!selectedIds.includes(allPerms.find((p) => p.code === "*")?.id ?? -1) && (
            <Collapse
              size="small"
              defaultActiveKey={permGroups.map(([key]) => key)}
              items={permGroups.map(([prefix, perms]) => {
                const groupIds = perms.map((p) => p.id);
                const allChecked = groupIds.every((id) => selectedIds.includes(id));
                const someChecked = groupIds.some((id) => selectedIds.includes(id));
                return {
                  key: prefix,
                  label: (
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{groupLabels[prefix] || prefix}</span>
                      <Tag style={{ fontSize: 10 }}>{perms.length}</Tag>
                    </span>
                  ),
                  extra: (
                    <Checkbox
                      checked={allChecked}
                      indeterminate={!allChecked && someChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => [...new Set([...prev, ...groupIds])]);
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      全选
                    </Checkbox>
                  ),
                  children: (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {perms.map((p) => (
                        <Checkbox
                          key={p.id}
                          checked={selectedIds.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds((prev) => [...prev, p.id]);
                            } else {
                              setSelectedIds((prev) => prev.filter((id) => id !== p.id));
                            }
                          }}
                        >
                          <span style={{ fontSize: 13 }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: "#b8afa6", marginLeft: 4 }}>{p.code}</span>
                        </Checkbox>
                      ))}
                    </div>
                  ),
                };
              })}
            />
          )}
        </div>
      </Modal>

      {/* Create role modal */}
      <Modal
        title="新建角色"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createRole}
        okText="创建"
        cancelText="取消"
        confirmLoading={saving}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>角色名 *</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: 内容审核员" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>描述</label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="可选" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RolesPage;
