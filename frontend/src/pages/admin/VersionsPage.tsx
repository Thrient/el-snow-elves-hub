import { useEffect, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch, Upload } from "antd";
import { PlusOutlined, DeleteOutlined, InboxOutlined } from "@ant-design/icons";
import { adminApi, type AdminVersion } from "../../api/admin";

const { Dragger } = Upload;

const VersionsPage: FC = () => {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ version: "", platform: "Windows x64", changelog: "", file_url: "", file_size: 0, is_latest: false });
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = () => adminApi.listVersions().then(setVersions);

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.version || !form.file_url) return message.warning("请填写版本号并上传文件");
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
          { title: "文件大小", dataIndex: "file_size", width: 100, render: (v: number | null) => v ? `${(v / 1024 / 1024).toFixed(1)} MB` : "-" },
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

      <Modal title="新增下载版本" open={open} onCancel={() => setOpen(false)} onOk={create} okText="创建" cancelText="取消" confirmLoading={loading}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input placeholder="版本号" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <Input placeholder="更新日志 (可选)" value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
          <Dragger
            name="file"
            multiple={false}
            showUploadList={false}
            beforeUpload={async (file) => {
              setUploading(true);
              try {
                const res = await adminApi.uploadVersionFile(file);
                setForm({ ...form, file_url: `/api/v1/files/${res.file_id}/download`, file_size: res.size });
                message.success(`${file.name} 上传成功`);
              } catch {
                message.error("上传失败");
              } finally {
                setUploading(false);
              }
              return false;
            }}
          >
            {form.file_url ? (
              <div style={{ padding: "8px 0" }}>
                <p style={{ color: "#10b981", fontSize: 14, margin: 0 }}>已上传</p>
                <p style={{ color: "#6b5e55", fontSize: 12, margin: "4px 0 0" }}>
                  {form.file_size ? `${(form.file_size / 1024 / 1024).toFixed(1)} MB` : ""}
                </p>
              </div>
            ) : (
              <div style={{ padding: "16px 0" }}>
                <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text" style={{ fontSize: 13, color: "#3d3630" }}>点击或拖拽文件到此处上传</p>
                <p className="ant-upload-hint" style={{ fontSize: 11, color: "#9ca3af" }}>
                  {uploading ? "上传中..." : "支持 ZIP / EXE / MSI，最大 200MB"}
                </p>
              </div>
            )}
          </Dragger>
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
