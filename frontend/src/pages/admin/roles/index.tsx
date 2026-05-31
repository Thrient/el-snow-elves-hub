import { useEffect, useMemo, useState, type FC } from "react";
import { Table, Button, Modal, Checkbox, Input, message, Tag, Popconfirm, Space, Collapse } from "antd";
import { PlusOutlined, SettingOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { RoleItem, PermItem } from "@/types";
import { useAuthStore } from "@/store/auth";

const GROUP_LABELS: Record<string, string> = {
  admin: "管理后台", user: "用户管理", role: "角色管理", perm: "权限管理",
  version: "版本管理", task: "任务管理", forum: "论坛", route: "路由管理", comment: "评论管理",
};

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
      setRoles(r); setAllPerms(p);
    } catch { /* ErrorToast */ }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const savePerms = async () => {
    if (!editRole) return;
    try { await adminApi.updateRolePermissions(editRole.id, selectedIds); message.success("权限已更新"); setEditRole(null); void load(); }
    catch { /* ErrorToast */ }
  };

  const createRole = async () => {
    if (!formName.trim()) return message.warning("角色名不能为空");
    setSaving(true);
    try { await adminApi.createRole({ name: formName.trim(), description: formDesc.trim() || undefined }); message.success("角色已创建"); setCreateOpen(false); setFormName(""); setFormDesc(""); void load(); }
    catch (e: any) { message.error(e?.response?.data?.detail || "创建失败"); }
    finally { setSaving(false); }
  };

  const removeRole = async (id: number) => {
    try { await adminApi.deleteRole(id); message.success("已删除"); void load(); }
    catch (e: any) { message.error(e?.response?.data?.detail || "删除失败"); }
  };

  const hasWildcard = (role: RoleItem) => role.permissions.some((p) => p.code === "*");

  const permGroups = useMemo(() => {
    const groups: Record<string, PermItem[]> = {};
    for (const p of allPerms.filter((p) => p.code !== "*")) {
      const prefix = p.code.split(":")[0];
      (groups[prefix] ??= []).push(p);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [allPerms]);

  const wildcardId = allPerms.find((p) => p.code === "*")?.id ?? -1;
  const hasWildcardSelected = selectedIds.includes(wildcardId);

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">角色管理</h2>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>新建角色</Button>}
      </div>

      <Table dataSource={roles} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "ID", dataIndex: "id", width: 60 },
          { title: "角色名", dataIndex: "name", width: 120 },
          { title: "描述", dataIndex: "description", render: (v: string | null) => v || "-" },
          {
            title: "权限", width: 360,
            render: (_: unknown, record: RoleItem) =>
              hasWildcard(record)
                ? <Tag color="red">超级管理员（全部权限）</Tag>
                : record.permissions.length
                  ? record.permissions.map((p) => <Tag key={p.code} className="text-[0.625rem]">{p.name}</Tag>)
                  : <span className="text-[0.6875rem] text-[#b8afa6]">无权限</span>,
          },
          {
            title: "操作", width: 120,
            render: (_: unknown, record: RoleItem) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<SettingOutlined />}
                  onClick={() => { setEditRole(record); setSelectedIds(allPerms.filter((p) => record.permissions.some((rp) => rp.code === p.code)).map((p) => p.id)); }}>
                  权限</Button>
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

      <Modal title={`编辑权限 — ${editRole?.name}`} open={!!editRole}
        onCancel={() => setEditRole(null)} onOk={savePerms} okText="保存" cancelText="取消" width={520}>
        <div className="py-3" style={{ maxHeight: "60vh", overflowY: "auto" }}>
          <Checkbox className="mb-4 font-600"
            checked={hasWildcardSelected}
            onChange={(e) => { if (e.target.checked) setSelectedIds([wildcardId]); else setSelectedIds([]); }}>
            超级管理员（全部权限）
          </Checkbox>

          {!hasWildcardSelected && (
            <Collapse size="small" defaultActiveKey={permGroups.map(([k]) => k)}
              items={permGroups.map(([prefix, perms]) => {
                const groupIds = perms.map((p) => p.id);
                const allChecked = groupIds.every((id) => selectedIds.includes(id));
                const someChecked = groupIds.some((id) => selectedIds.includes(id));
                return {
                  key: prefix,
                  label: (
                    <span className="flex items-center gap-2">
                      <span className="text-[0.8125rem] font-500">{GROUP_LABELS[prefix] || prefix}</span>
                      <Tag className="text-[0.625rem]">{perms.length}</Tag>
                    </span>
                  ),
                  extra: (
                    <Checkbox checked={allChecked} indeterminate={!allChecked && someChecked}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds((prev) => [...new Set([...prev, ...groupIds])]);
                        else setSelectedIds((prev) => prev.filter((id) => !groupIds.includes(id)));
                      }}
                      onClick={(e) => e.stopPropagation()}>全选</Checkbox>
                  ),
                  children: (
                    <div className="flex flex-col gap-1">
                      {perms.map((p) => (
                        <Checkbox key={p.id} checked={selectedIds.includes(p.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds((prev) => [...prev, p.id]);
                            else setSelectedIds((prev) => prev.filter((id) => id !== p.id));
                          }}>
                          <span className="text-[0.8125rem]">{p.name}</span>
                          <span className="text-[0.625rem] text-[#b8afa6] ml-1">{p.code}</span>
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

      <Modal title="新建角色" open={createOpen} onCancel={() => setCreateOpen(false)}
        onOk={createRole} okText="创建" cancelText="取消" confirmLoading={saving}>
        <div className="flex flex-col gap-3 pt-2">
          <div>
            <label className="text-[0.75rem] text-[#6b5e55] mb-1 block">角色名 *</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: 内容审核员" />
          </div>
          <div>
            <label className="text-[0.75rem] text-[#6b5e55] mb-1 block">描述</label>
            <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="可选" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const page = "RolesPage";
export default RolesPage;
