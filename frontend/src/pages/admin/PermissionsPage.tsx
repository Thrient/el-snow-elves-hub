import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Popconfirm, Space } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi, type PermItem } from "../../api/admin";
import { useAuthStore } from "../../store/auth";

const PermissionsPage: FC = () => {
  const [perms, setPerms] = useState<PermItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PermItem | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [saving, setSaving] = useState(false);
  const hasPerm = useAuthStore((s) => s.hasPerm);
  const canManage = hasPerm("perm:create");

  const load = () => {
    setLoading(true);
    adminApi.listPermissions()
      .then(setPerms)
      .catch(() => message.error("加载失败"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setFormCode("");
    setFormName("");
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (p: PermItem) => {
    setEditing(p);
    setFormCode(p.code);
    setFormName(p.name);
    setModalOpen(true);
  };

  const save = async () => {
    if (!formCode.trim() || !formName.trim()) {
      message.warning("权限码和名称不能为空");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await adminApi.updatePermission(editing.id, { code: formCode.trim(), name: formName.trim() });
        message.success("权限已更新");
      } else {
        await adminApi.createPermission({ code: formCode.trim(), name: formName.trim() });
        message.success("权限已创建");
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await adminApi.deletePermission(id);
      message.success("已删除");
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.detail || "删除失败");
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: 0 }}>权限列表</h2>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建权限</Button>
        )}
      </div>

      <Table
        dataSource={perms}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        scroll={{ y: "calc(100vh - 330px)" }}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "ID", dataIndex: "id", width: 60 },
          { title: "权限码", dataIndex: "code", width: 240 },
          { title: "名称", dataIndex: "name" },
          ...(canManage ? [{
            title: "操作", width: 100,
            render: (_: unknown, record: PermItem) => (
              <Space size={4}>
                <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openEdit(record)} />
                {record.code !== "*" && (
                  <Popconfirm title="确定删除此权限?" onConfirm={() => remove(record.id)} okText="删除" cancelText="取消">
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                )}
              </Space>
            ),
          }] : []),
        ]}
      />

      <Modal
        title={editing ? "编辑权限" : "新建权限"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={save}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>权限码 *</label>
            <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="例: exports.create" disabled={!!editing} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b5e55", marginBottom: 4, display: "block" }}>名称 *</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: 导出数据" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default PermissionsPage;
