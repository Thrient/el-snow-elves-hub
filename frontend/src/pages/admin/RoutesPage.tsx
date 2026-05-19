import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, Select, InputNumber, Switch, message, Tag, Popconfirm, Space } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi, type RouteAdmin, type PermItem } from "../../api/admin";
import iconMap from "../../components/IconResolver";
import componentRegistry from "../../registry";

const iconOptions = Object.keys(iconMap).map((k) => ({ value: k, label: k }));
const componentOptions = Object.keys(componentRegistry).map((k) => ({ value: k, label: k }));

const RoutesPage: FC = () => {
  const [routes, setRoutes] = useState<RouteAdmin[]>([]);
  const [allPerms, setAllPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RouteAdmin | null>(null);

  // Form state
  const [formPath, setFormPath] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formIcon, setFormIcon] = useState<string | undefined>(undefined);
  const [formParentId, setFormParentId] = useState<number | undefined>(undefined);
  const [formPerm, setFormPerm] = useState<string | undefined>(undefined);
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formComponent, setFormComponent] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([adminApi.listRoutes(), adminApi.listPermissions()]);
      setRoutes(r);
      setAllPerms(p);
    } catch {
      message.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setFormPath("");
    setFormTitle("");
    setFormIcon(undefined);
    setFormParentId(undefined);
    setFormPerm(undefined);
    setFormEnabled(true);
    setFormSortOrder(0);
    setFormComponent(undefined);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (route: RouteAdmin) => {
    setEditing(route);
    setFormPath(route.path);
    setFormTitle(route.title);
    setFormIcon(route.icon || undefined);
    setFormParentId(route.parent_id || undefined);
    setFormPerm(route.perm || undefined);
    setFormEnabled(route.enabled);
    setFormSortOrder(route.sort_order);
    setFormComponent(route.component || undefined);
    setModalOpen(true);
  };

  const save = async () => {
    if (!formPath.trim() || !formTitle.trim()) {
      message.warning("路径和标题不能为空");
      return;
    }
    setSaving(true);
    try {
      const data = {
        path: formPath.trim(),
        title: formTitle.trim(),
        icon: formIcon || null,
        parent_id: formParentId || null,
        perm: formPerm || null,
        enabled: formEnabled,
        sort_order: formSortOrder,
        component: formComponent || null,
      };
      if (editing) {
        await adminApi.updateRoute(editing.id, data);
        message.success("路由已更新");
      } else {
        await adminApi.createRoute(data as any);
        message.success("路由已创建");
      }
      setModalOpen(false);
      load();
    } catch {
      message.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (id: number, enabled: boolean) => {
    try {
      await adminApi.toggleRoute(id, enabled);
      setRoutes((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
      message.success(enabled ? "已启用" : "已禁用");
    } catch {
      message.error("操作失败");
    }
  };

  const deleteRoute = async (id: number) => {
    try {
      await adminApi.deleteRoute(id);
      message.success("已删除");
      load();
    } catch {
      message.error("删除失败");
    }
  };

  const getParentPath = (parentId: number | null) => {
    if (!parentId) return "-";
    const parent = routes.find((r) => r.id === parentId);
    return parent ? parent.path : "-";
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: 0 }}>路由管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建路由
        </Button>
      </div>

      <Table
        dataSource={routes}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 50 },
          { title: "路径", dataIndex: "path", width: 160 },
          { title: "标题", dataIndex: "title", width: 100 },
          {
            title: "图标",
            dataIndex: "icon",
            width: 100,
            render: (v: string | null) => v || "-",
          },
          {
            title: "父级",
            dataIndex: "parent_id",
            width: 120,
            render: (v: number | null) => getParentPath(v),
          },
          {
            title: "权限",
            dataIndex: "perm",
            width: 120,
            render: (v: string | null) =>
              v ? <Tag>{v}</Tag> : <span style={{ color: "#b8afa6", fontSize: 11 }}>公开</span>,
          },
          {
            title: "启用",
            dataIndex: "enabled",
            width: 60,
            render: (_: unknown, record: RouteAdmin) => (
              <Switch
                size="small"
                checked={record.enabled}
                onChange={(v) => toggleEnabled(record.id, v)}
              />
            ),
          },
          {
            title: "组件",
            dataIndex: "component",
            width: 120,
            render: (v: string | null) => v || "-",
          },
          { title: "排序", dataIndex: "sort_order", width: 60 },
          {
            title: "操作",
            width: 130,
            render: (_: unknown, record: RouteAdmin) => (
              <Space size="small">
                <Button
                  size="small"
                  type="text"
                  icon={<EditOutlined />}
                  onClick={() => openEdit(record)}
                />
                <Popconfirm
                  title="确定删除此路由?"
                  onConfirm={() => deleteRoute(record.id)}
                  okText="删除"
                  cancelText="取消"
                >
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        scroll={{ x: 1200 }}
      />

      <Modal
        title={editing ? "编辑路由" : "新建路由"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={520}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>路径 *</label>
              <Input value={formPath} onChange={(e) => setFormPath(e.target.value)} placeholder="/example" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>标题 *</label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="示例" />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>图标</label>
              <Select
                value={formIcon}
                onChange={setFormIcon}
                options={iconOptions}
                allowClear
                placeholder="无"
                style={{ width: "100%" }}
                showSearch
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>父级路由</label>
              <Select
                value={formParentId}
                onChange={setFormParentId}
                allowClear
                placeholder="无（顶级路由）"
                style={{ width: "100%" }}
                options={routes.map((r) => ({ value: r.id, label: `${r.path} (${r.title})` }))}
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>权限码</label>
              <Select
                value={formPerm}
                onChange={setFormPerm}
                allowClear
                placeholder="无（公开路由）"
                style={{ width: "100%" }}
                options={allPerms
                  .filter((p) => p.code !== "*")
                  .map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>组件</label>
              <Select
                value={formComponent}
                onChange={setFormComponent}
                options={componentOptions}
                allowClear
                placeholder="无（通用页面）"
                style={{ width: "100%" }}
                showSearch
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div>
              <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>排序</label>
              <InputNumber
                value={formSortOrder}
                onChange={(v) => setFormSortOrder(v ?? 0)}
                min={0}
                style={{ width: 100 }}
              />
            </div>
            <div style={{ paddingTop: 20 }}>
              <Switch checked={formEnabled} onChange={setFormEnabled} />{" "}
              <span style={{ fontSize: 12, color: "#6b5e55", marginLeft: 4 }}>{formEnabled ? "启用" : "禁用"}</span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RoutesPage;
