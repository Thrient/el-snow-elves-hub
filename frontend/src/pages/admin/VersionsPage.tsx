import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { adminApi, type AdminVersion } from "../../api/admin";

const VersionsPage: FC = () => {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ version: "", platform: "Windows x64", changelog: "", file_url: "", file_size: 0, is_latest: false });
  const [loading, setLoading] = useState(false);

  const load = () => adminApi.listVersions().then(setVersions);

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.version || !form.file_url) return message.warning("请填写版本号和下载地址");
    setLoading(true);
    try {
      await adminApi.createVersion(form);
      message.success("版本已创建");
      setOpen(false);
      setForm({ version: "", platform: "Windows x64", changelog: "", file_url: "", file_size: 0, is_latest: false });
      load();
    } catch {
      message.error("创建失败");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: number) => {
    try { await adminApi.deleteVersion(id); message.success("已删除"); load(); } catch { message.error("删除失败"); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: 0 }}>下载版本管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增版本</Button>
      </div>

      <Table
        dataSource={versions}
        rowKey="id"
        loading={loading}
        pagination={false}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "版本", dataIndex: "version", width: 100 },
          { title: "平台", dataIndex: "platform", width: 120 },
          { title: "更新日志", dataIndex: "changelog", ellipsis: true },
          { title: "下载地址", dataIndex: "file_url", ellipsis: true },
          { title: "最新", dataIndex: "is_latest", width: 80, render: (v: boolean) => v ? "✅" : "" },
          { title: "创建时间", dataIndex: "created_at", width: 170, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
          {
            title: "操作", width: 80,
            render: (_: unknown, record: AdminVersion) => (
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(record.id)} />
            ),
          },
        ]}
      />

      <Modal title="新增下载版本" open={open} onCancel={() => setOpen(false)} onOk={create} okText="创建" cancelText="取消">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input placeholder="版本号" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <Input placeholder="下载地址 (URL)" value={form.file_url} onChange={(e) => setForm({ ...form, file_url: e.target.value })} />
          <Input placeholder="更新日志 (可选)" value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#6b5e55" }}>设为最新版本</span>
            <Switch checked={form.is_latest} onChange={(v) => setForm({ ...form, is_latest: v })} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VersionsPage;
