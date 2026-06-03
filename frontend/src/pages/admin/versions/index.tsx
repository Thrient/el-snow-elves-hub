import { useEffect, useRef, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch, Progress } from "antd";
import { PlusOutlined, DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { adminApi } from "@/api/admin";
import { formatSize, formatSpeed } from "@/util/format";
import type { AdminVersion } from "@/types";

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
  const [fileManifest, setFileManifest] = useState<Record<string, { sha256: string; fingerprint_id?: number; size: number; file: File }>>({});
  const canManage = useAuthStore((s) => s.hasPerm)("version:create");

  const load = () => adminApi.listVersions().then(setVersions);
  useEffect(() => { load(); }, []);

  const resetUpload = () => {
    setFolderName(""); setFileManifest({}); setUploadStage("idle"); setUploadBytes({ done: 0, total: 0 });
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    const rootName = (fileList[0].webkitRelativePath || "").split("/")[0] || "unknown";
    const totalSize = fileList.reduce((s, f) => s + f.size, 0);
    setFolderName(rootName); setUploadStage("hashing"); setUploadBytes({ done: 0, total: totalSize });
    const manifest: Record<string, { sha256: string; fingerprint_id?: number; size: number; file: File }> = {};
    let hashedBytes = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const parts = (file.webkitRelativePath || file.name).split("/");
      const relPath = parts.length > 1 ? parts.slice(1).join("/") : (file.webkitRelativePath || file.name);
      manifest[relPath] = { sha256: await computeSHA256(file), size: file.size, file };
      hashedBytes += file.size;
      setUploadBytes({ done: hashedBytes, total: totalSize });
    }
    setFileManifest(manifest); setUploadStage("idle");
  };

  const create = async () => {
    if (!form.version) return message.warning("请填写版本号");
    if (Object.keys(fileManifest).length === 0) return message.warning("请选择版本文件夹");
    setLoading(true);
    try {
      const entries = Object.entries(fileManifest);
      const shaList = entries.map(([, v]) => v.sha256);
      setUploadStage("checking"); setUploadBytes({ done: 0, total: 0 });
      const { existing, missing } = await adminApi.checkBlobs(shaList);
      // Capture fingerprint_ids from pre-check
      const existingMap = new Map(existing.map((e) => [e.sha256, e.fingerprint_id]));
      const updatedManifest = { ...fileManifest };
      for (const [path, info] of Object.entries(updatedManifest)) {
        const fpId = existingMap.get(info.sha256);
        if (fpId != null) updatedManifest[path] = { ...info, fingerprint_id: fpId };
      }
      setFileManifest(updatedManifest);
      if (missing.length > 0) {
        const missingSet = new Set(missing);
        const missingFiles = entries.filter(([, { sha256 }]) => missingSet.has(sha256));
        const totalBytes = missingFiles.reduce((s, [, { size }]) => s + size, 0);
        setUploadStage("uploading"); setUploadBytes({ done: 0, total: totalBytes });
        let uploadedBytes = 0;
        for (const [path, { size, file }] of missingFiles) {
          const t0 = performance.now();
          const result = await adminApi.uploadBlob(file, (pct) => {
            const currentFileBytes = Math.round(size * pct / 100);
            setUploadBytes({ done: uploadedBytes + currentFileBytes, total: totalBytes });
            const elapsed = performance.now() - t0;
            if (elapsed > 0) setUploadSpeed(currentFileBytes / elapsed * 1000);
          });
          updatedManifest[path] = { ...updatedManifest[path], fingerprint_id: result.fingerprint_id };
          uploadedBytes += size;
          setUploadBytes({ done: uploadedBytes, total: totalBytes });
        }
        setUploadSpeed(0);
        setFileManifest(updatedManifest);
      }
      setUploadStage("creating");
      await adminApi.createVersion({
        version: form.version, platform: form.platform, changelog: form.changelog || undefined,
        is_latest: form.is_latest, is_mandatory: form.is_mandatory,
        files: Object.entries(updatedManifest).map(([path, { fingerprint_id }]) => ({ path, fingerprint_id: fingerprint_id! })),
      });
      message.success("版本已创建"); setOpen(false);
      setForm({ version: "", platform: "Windows x64", changelog: "", is_latest: false, is_mandatory: false });
      resetUpload(); load();
    } catch { /* ErrorToast */ }
    finally { setLoading(false); setUploadStage("idle"); }
  };

  const remove = async (id: number) => { try { await adminApi.deleteVersion(id); message.success("已删除"); load(); } catch { /* ErrorToast */ } };

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
                <span className="text-[0.75rem] text-[#6b5e55]">({Object.keys(fileManifest).length} 个文件)</span>
                <Button type="link" size="small" onClick={resetUpload} className="ml-auto">重新选择</Button>
              </div>
              {uploadStage === "hashing" && (
                <div className="mt-1"><Progress percent={Math.round(uploadBytes.total > 0 ? (uploadBytes.done / uploadBytes.total) * 100 : 0)} size="small" status="active" /><p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-0.5">计算指纹 {formatSize(uploadBytes.done)} / {formatSize(uploadBytes.total)}</p></div>
              )}
              {uploadStage === "checking" && (
                <p className="text-[0.6875rem] text-[#6b5e55] m-0 mt-1">检测已存在的文件... {Object.keys(fileManifest).length} 个文件，共 {formatSize(uploadBytes.total)}</p>
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
