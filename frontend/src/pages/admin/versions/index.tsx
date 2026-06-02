import { useEffect, useRef, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch, Progress } from "antd";
import { PlusOutlined, DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { adminApi } from "@/api/admin";
import { formatSize, formatSpeed } from "@/util/format";
import { upload, type UploadProgress } from "@/api/storage";
import type { AdminVersion } from "@/types";

type UploadStage = "idle" | "hashing" | "checking" | "uploading" | "creating";

const VersionsPage: FC = () => {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ version: "", platform: "Windows x64", changelog: "", is_latest: false, is_mandatory: false });
  const [loading, setLoading] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderName, setFolderName] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadBytes, setUploadBytes] = useState({ done: 0, total: 0 });
  const [uploadSpeed, setUploadSpeed] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const canManage = useAuthStore((s) => s.hasPerm)("version:create");

  const load = () => adminApi.listVersions().then(setVersions);
  useEffect(() => { load(); }, []);

  const resetUpload = () => {
    setFolderName(""); setFiles([]); setUploadStage("idle"); setUploadBytes({ done: 0, total: 0 });
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    const fileList = Array.from(selected);
    const rootName = (fileList[0].webkitRelativePath || "").split("/")[0] || "unknown";
    const totalSize = fileList.reduce((s, f) => s + f.size, 0);
    setFolderName(rootName);
    setFiles(fileList);
    setUploadBytes({ done: 0, total: totalSize });
  };

  const create = async () => {
    if (!form.version) return message.warning("请填写版本号");
    if (files.length === 0) return message.warning("请选择版本文件夹");
    setLoading(true);
    try {
      // Unified upload — upload() handles: hash → batch pre-check → dispatch direct/chunked
      let speedTimer = performance.now();
      let speedBytes = 0;
      const results = await upload(files, (p: UploadProgress) => {
        setUploadStage(
          p.phase === "hashing" ? "hashing" :
          p.phase === "checking" ? "checking" :
          p.phase === "uploading" ? "uploading" :
          p.phase === "done" ? "creating" : "idle"
        );
        if (p.phase === "uploading" && p.filePct != null) {
          const now = performance.now();
          const elapsed = now - speedTimer;
          speedBytes += (p.filePct / 100) * (files[p.current]?.size ?? 0);
          if (elapsed > 500) {
            setUploadSpeed(speedBytes / elapsed * 1000);
            speedTimer = now;
            speedBytes = 0;
          }
          setUploadBytes({
            done: files.slice(0, p.current).reduce((s, f) => s + f.size, 0) +
              Math.round((p.filePct / 100) * (files[p.current]?.size ?? 0)),
            total: files.reduce((s, f) => s + f.size, 0),
          });
        }
      });

      // Build version manifest (relative path = webkitRelativePath minus root folder)
      const fileEntries = results.map((r, i) => {
        const parts = (files[i].webkitRelativePath || files[i].name).split("/");
        const relPath = parts.length > 1 ? parts.slice(1).join("/") : (files[i].webkitRelativePath || files[i].name);
        return { path: relPath, sha256: r.sha256 };
      });

      setUploadStage("creating");
      await adminApi.createVersion({
        version: form.version, platform: form.platform, changelog: form.changelog || undefined,
        is_latest: form.is_latest, is_mandatory: form.is_mandatory,
        files: fileEntries,
      });
      message.success("版本已创建"); setOpen(false);
      setForm({ version: "", platform: "Windows x64", changelog: "", is_latest: false, is_mandatory: false });
      resetUpload(); load();
    } catch { /* ErrorToast handled by axios interceptor */ }
    finally { setLoading(false); setUploadStage("idle"); setUploadSpeed(0); }
  };

  const remove = async (id: number) => { try { await adminApi.deleteVersion(id); message.success("已删除"); load(); } catch { /* ErrorToast */ } };

  // ── JSX follows (unchanged from current lines 101-180) ──
  return (
    <div className="pt-8 w-[min(94%,70rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">下载版本管理</h2>
        {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { resetUpload(); setOpen(true); }}>新增版本</Button>}
      </div>

      <Table dataSource={versions} rowKey="id" loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        className="bg-white rounded-3" scroll={{ y: "calc(100vh - 330px)" }}
        columns={[
          { title: "版本", dataIndex: "version", width: 100 },
          { title: "平台", dataIndex: "platform", width: 120 },
          { title: "更新日志", dataIndex: "changelog", ellipsis: true },
          { title: "文件数", dataIndex: "file_count", width: 80, render: (v: number | null) => (v != null ? v : "-") },
          { title: "最新", dataIndex: "is_latest", width: 60, render: (v: boolean) => (v ? "是" : "") },
          { title: "强制", dataIndex: "is_mandatory", width: 60, render: (v: boolean) => (v ? "是" : "") },
          { title: "创建时间", dataIndex: "created_at", width: 170, render: (v: string) => new Date(v).toLocaleString("zh-CN") },
          ...(canManage ? [{ title: "操作", width: 80, render: (_: unknown, record: AdminVersion) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(record.id)} /> }] : []),
        ]}
      />

      <Modal title="新增下载版本" open={open} onCancel={() => { setOpen(false); resetUpload(); }}
        onOk={create} okText="创建" cancelText="取消" confirmLoading={loading} width={480}>
        <div className="flex flex-col gap-3 pt-2">
          <Input placeholder="版本号 (如 7.0.5)" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          <div className="flex items-center gap-2">
            <span className="text-[0.8125rem] text-[#6b5e55] whitespace-nowrap">平台</span>
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className="flex-1 py-1 px-2 rounded-1.5 border border-solid border-[#d9d9d9] text-[0.8125rem] text-[#3d3630] bg-white">
              <option>Windows x64</option><option>Windows x86</option><option>macOS ARM</option><option>macOS x64</option><option>Linux x64</option>
            </select>
          </div>
          <Input placeholder="更新日志 (可选)" value={form.changelog} onChange={(e) => setForm({ ...form, changelog: e.target.value })} />
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2"><span className="text-[0.8125rem] text-[#6b5e55]">设为最新版本</span><Switch checked={form.is_latest} onChange={(v) => setForm({ ...form, is_latest: v })} /></div>
            <div className="flex items-center gap-2"><span className="text-[0.8125rem] text-[#6b5e55]">强制更新</span><Switch checked={form.is_mandatory} onChange={(v) => setForm({ ...form, is_mandatory: v })} /></div>
          </div>

          <input ref={folderInputRef} type="file" {...{ webkitdirectory: "" } as any} className="hidden" onChange={handleFolderSelect} />

          {folderName ? (
            <div className="p-3 px-4 bg-[#f0fdf4] rounded-2 border border-solid border-[#bbf7d0]">
              <div className="flex items-center gap-2 mb-1">
                <FolderOpenOutlined className="text-[#16a34a] text-base" />
                <span className="text-[0.8125rem] font-500 text-[#166534]">{folderName}</span>
                <span className="text-[0.75rem] text-[#6b5e55]">({files.length} 个文件)</span>
                <Button type="link" size="small" onClick={resetUpload} className="ml-auto">重新选择</Button>
              </div>
              {uploadStage === "hashing" && (
                <div className="mt-1"><Progress percent={Math.round(uploadBytes.total > 0 ? (uploadBytes.done / uploadBytes.total) * 100 : 0)} size="small" status="active" /><p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-0.5">计算指纹 {formatSize(uploadBytes.done)} / {formatSize(uploadBytes.total)}</p></div>
              )}
              {uploadStage === "checking" && (
                <p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-1">检测已存在的文件... {files.length} 个文件，共 {formatSize(uploadBytes.total)}</p>
              )}
              {uploadStage === "uploading" && (
                <div className="mt-1">
                  <Progress percent={Math.round(uploadBytes.total > 0 ? (uploadBytes.done / uploadBytes.total) * 100 : 0)} size="small" status="active" />
                  <div className="flex justify-between text-[0.6875rem] text-[#6b5e55] mt-0.5">
                    <span>{formatSize(uploadBytes.done)} / {formatSize(uploadBytes.total)}</span>
                    {uploadSpeed > 0 && <span>{formatSpeed(uploadSpeed)}</span>}
                  </div>
                </div>
              )}
              {uploadStage === "creating" && <p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-1">创建版本...</p>}
              {uploadStage === "idle" && folderName && (
                <p className="text-[0.6875rem] text-[#6b5e55] m-0">已就绪 — 点击"创建"开始上传</p>
              )}
            </div>
          ) : (
            <Button type="dashed" icon={<FolderOpenOutlined />} onClick={() => folderInputRef.current?.click()} block className="h-15">选择版本文件夹</Button>
          )}
        </div>
      </Modal>
    </div>
  );
};

export const page = "VersionsPage";
export default VersionsPage;
