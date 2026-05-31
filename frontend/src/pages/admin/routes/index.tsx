import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, Select, InputNumber, Switch, message, Tag, Popconfirm, Space } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { RouteAdmin, PermItem } from "@/types";
import { useAuthStore } from "@/store/auth";
import { getComponentNames } from "@/router";
import { iconMap } from "@/components/IconResolver";

const iconOptions = Object.keys(iconMap).map((k) => ({ value: k, label: k }));

const RoutesPage: FC = () => {
  const [routes, setRoutes] = useState<RouteAdmin[]>([]);
  const [allPerms, setAllPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm("route:create");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteAdmin | null>(null);
  const [form, setForm] = useState({ path: "", title: "", icon: undefined as string | undefined, parentId: undefined as number | undefined, perm: undefined as string | undefined, enabled: true, inMenu: true, sortOrder: 0, component: undefined as string | undefined });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const [r, p] = await Promise.all([adminApi.listRoutes(), adminApi.listPermissions()]); setRoutes(r); setAllPerms(p); }
    catch { message.error("加载失败"); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const reset = () => setForm({ path: "", title: "", icon: undefined, parentId: undefined, perm: undefined, enabled: true, inMenu: true, sortOrder: 0, component: undefined });

  const save = async () => {
    if (!form.path.trim() || !form.title.trim()) return message.warning("路径和标题不能为空");
    setSaving(true);
    try {
      const data = { path: form.path.trim(), title: form.title.trim(), icon: form.icon || null, parent_id: form.parentId || null, perm: form.perm || null, enabled: form.enabled, in_menu: form.inMenu, sort_order: form.sortOrder, component: form.component || null };
      if (editing) { await adminApi.updateRoute(editing.id, data); message.success("路由已更新"); }
      else { await adminApi.createRoute(data as any); message.success("路由已创建"); }
      setModalOpen(false); void load();
    } catch { message.error("保存失败"); } finally { setSaving(false); }
  };

  const toggleEnabled = async (id: number, enabled: boolean) => { try { await adminApi.toggleRoute(id, enabled); setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r))); } catch { message.error("操作失败"); } };
  const toggleInMenu = async (id: number, inMenu: boolean) => { try { await adminApi.updateRoute(id, { in_menu: inMenu } as any); setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, in_menu: inMenu } : r))); } catch { message.error("操作失败"); } };
  const removeRoute = async (id: number) => { try { await adminApi.deleteRoute(id); message.success("已删除"); void load(); } catch { message.error("删除失败"); } };

  const setF = (patch: Partial<typeof form>) => setForm((p) => ({ ...p, ...patch }));

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">路由管理</h2>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); reset(); setModalOpen(true); }}>新建路由</Button>}
      </div>

      <Table dataSource={routes} rowKey="id" loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "路径", dataIndex: "path", width: 140, ellipsis: true },
          { title: "标题", dataIndex: "title", width: 80 },
          { title: "父级", dataIndex: "parent_id", width: 100, render: (v: number | null) => v ? (routes.find((r) => r.id === v)?.path || "-") : "-" },
          { title: "权限", dataIndex: "perm", width: 100, render: (v: string | null) => v ? <Tag>{v}</Tag> : <span className="text-[#b8afa6] text-[0.6875rem]">公开</span> },
          ...(canManage ? [
            { title: "启用", dataIndex: "enabled", width: 55, render: (_: unknown, record: RouteAdmin) => <Switch size="small" checked={record.enabled} onChange={(v) => toggleEnabled(record.id, v)} /> },
            { title: "导航", dataIndex: "in_menu", width: 55, render: (_: unknown, record: RouteAdmin) => <Switch size="small" checked={record.in_menu} onChange={(v) => toggleInMenu(record.id, v)} /> },
          ] : []),
          { title: "排序", dataIndex: "sort_order", width: 50 },
          ...(canManage ? [{ title: "操作", width: 80, render: (_: unknown, record: RouteAdmin) => (
            <Space size={4}>
              <Button size="small" type="text" icon={<EditOutlined />} onClick={() => { setEditing(record); setForm({ path: record.path, title: record.title, icon: record.icon || undefined, parentId: record.parent_id || undefined, perm: record.perm || undefined, enabled: record.enabled, inMenu: record.in_menu, sortOrder: record.sort_order, component: record.component || undefined }); setModalOpen(true); }} />
              <Popconfirm title="确定删除此路由?" onConfirm={() => removeRoute(record.id)} okText="删除" cancelText="取消">
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Space>
          ) }] : []),
        ]}
      />

      <Modal title={editing ? "编辑路由" : "新建路由"} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={save} okText="保存" cancelText="取消" confirmLoading={saving} width={520}>
        <div className="flex flex-col gap-4 pt-4">
          <div className="flex gap-3">
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">路径 *</label><Input value={form.path} onChange={(e) => setF({ path: e.target.value })} placeholder="/example" /></div>
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">标题 *</label><Input value={form.title} onChange={(e) => setF({ title: e.target.value })} placeholder="示例" /></div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">图标</label><Select value={form.icon} onChange={(v) => setF({ icon: v })} options={iconOptions} allowClear placeholder="无" showSearch /></div>
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">父级路由</label><Select value={form.parentId} onChange={(v) => setF({ parentId: v })} allowClear placeholder="无（顶级路由）" options={routes.map((r) => ({ value: r.id, label: `${r.path} (${r.title})` }))} showSearch /></div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">权限码</label><Select value={form.perm} onChange={(v) => setF({ perm: v })} allowClear placeholder="无（公开路由）" options={allPerms.filter((p) => p.code !== "*").map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }))} /></div>
            <div className="flex-1"><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">组件</label><Select value={form.component} onChange={(v) => setF({ component: v })} options={getComponentNames().map((k) => ({ value: k, label: k }))} allowClear placeholder="无（通用页面）" showSearch /></div>
          </div>
          <div className="flex gap-3 items-center">
            <div><label className="text-[0.75rem] text-[#6b5e55] mb-1 block">排序</label><InputNumber value={form.sortOrder} onChange={(v) => setF({ sortOrder: v ?? 0 })} min={0} className="w-25!" /></div>
            <div className="pt-5"><Switch checked={form.enabled} onChange={(v) => setF({ enabled: v })} /> <span className="text-[0.75rem] text-[#6b5e55] ml-1">{form.enabled ? "启用" : "禁用"}</span></div>
            <div className="pt-5"><Switch checked={form.inMenu} onChange={(v) => setF({ inMenu: v })} /> <span className="text-[0.75rem] text-[#6b5e55] ml-1">{form.inMenu ? "导航显示" : "导航隐藏"}</span></div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const page = "RoutesPage";
export default RoutesPage;
