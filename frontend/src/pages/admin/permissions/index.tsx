import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Popconfirm, Space } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { PermItem } from "@/types";
import { useAuthStore } from "@/store/auth";

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
    adminApi.listPermissions().then(setPerms).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setFormCode(""); setFormName(""); setModalOpen(true); };

  const openEdit = (p: PermItem) => { setEditing(p); setFormCode(p.code); setFormName(p.name); setModalOpen(true); };

  const save = async () => {
    if (!formCode.trim() || !formName.trim()) return message.warning("权限码和名称不能为空");
    setSaving(true);
    try {
      if (editing) { await adminApi.updatePermission(editing.id, { code: formCode.trim(), name: formName.trim() }); message.success("权限已更新"); }
      else { await adminApi.createPermission({ code: formCode.trim(), name: formName.trim() }); message.success("权限已创建"); }
      setModalOpen(false); load();
    } catch { /* ErrorToast */ }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    try { await adminApi.deletePermission(id); message.success("已删除"); load(); }
    catch { /* ErrorToast */ }
  };

  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">权限列表</h2>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建权限</Button>}
      </div>

      <Table dataSource={perms} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
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

      <Modal title={editing ? "编辑权限" : "新建权限"} open={modalOpen}
        onCancel={() => setModalOpen(false)} onOk={save} okText="保存" cancelText="取消" confirmLoading={saving}>
        <div className="flex flex-col gap-3 pt-2">
          <div>
            <label className="text-[0.75rem] text-[#6b5e55] mb-1 block">权限码 *</label>
            <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="例: exports.create" disabled={!!editing} />
          </div>
          <div>
            <label className="text-[0.75rem] text-[#6b5e55] mb-1 block">名称 *</label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例: 导出数据" />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export const page = "PermissionsPage";
export default PermissionsPage;
