import { useEffect, useRef, useState, type FC } from "react";
import { Table, Button, Modal, Input, message, Switch, Progress } from "antd";
import { PlusOutlined, DeleteOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useAuthStore } from "../../store/auth";
import { adminApi, type AdminVersion } from "../../api/admin";

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

type UploadStage = "idle" | "hashing" | "checking" | "uploading" | "creating";

const VersionsPage: FC = () => {
  const [versions, setVersions] = useState<AdminVersion[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    version: "",
    platform: "Windows x64",
    changelog: "",
    is_latest: false,
    is_mandatory: false,
  });
  const [loading, setLoading] = useState(false);

  // Folder upload state
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderName, setFolderName] = useState("");
  const [uploadStage, setUploadStage] = useState<UploadStage>("idle");
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  // fileManifest: relativePath -> { sha256, size, file }
  const [fileManifest, setFileManifest] = useState<
    Record<string, { sha256: string; size: number; file: File }>
  >({});

  const canManage = useAuthStore((s) => s.hasPerm)("version:create");

  const load = () => adminApi.listVersions().then(setVersions);

  useEffect(() => {
    load();
  }, []);

  const resetUpload = () => {
    setFolderName("");
    setFileManifest({});
    setUploadStage("idle");
    setUploadProgress({ done: 0, total: 0 });
    if (folderInputRef.current) folderInputRef.current.value = "";
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    // Derive folder name from the first file's webkitRelativePath
    const firstPath = fileList[0].webkitRelativePath || "";
    const rootName = firstPath.split("/")[0] || "unknown";

    setFolderName(rootName);
    setUploadStage("hashing");
    setUploadProgress({ done: 0, total: fileList.length });

    const manifest: Record<string, { sha256: string; size: number; file: File }> = {};
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // Strip root folder name to get relative path
      const rawPath = file.webkitRelativePath || file.name;
      const parts = rawPath.split("/");
      const relPath = parts.length > 1 ? parts.slice(1).join("/") : rawPath;

      const sha256 = await computeSHA256(file);
      manifest[relPath] = { sha256, size: file.size, file };
      setUploadProgress({ done: i + 1, total: fileList.length });
    }

    setFileManifest(manifest);
    setUploadStage("idle");
  };

  const create = async () => {
    if (!form.version) return message.warning("请填写版本号");
    if (Object.keys(fileManifest).length === 0) return message.warning("请选择版本文件夹");

    const entries = Object.entries(fileManifest);
    const shaList = entries.map(([, v]) => v.sha256);

    setLoading(true);
    try {
      // Step 1: Check which blobs already exist
      setUploadStage("checking");
      setUploadProgress({ done: 0, total: 0 });
      const { missing } = await adminApi.checkBlobs(shaList);

      // Step 2: Upload only missing blobs
      if (missing.length > 0) {
        setUploadStage("uploading");
        setUploadProgress({ done: 0, total: missing.length });

        const missingSet = new Set(missing);
        let uploaded = 0;
        for (const [, { sha256, file }] of entries) {
          if (missingSet.has(sha256)) {
            await adminApi.uploadBlob(file);
            uploaded++;
            setUploadProgress({ done: uploaded, total: missing.length });
          }
        }
      }

      // Step 3: Create version with file manifest
      setUploadStage("creating");
      await adminApi.createVersion({
        version: form.version,
        platform: form.platform,
        changelog: form.changelog || undefined,
        is_latest: form.is_latest,
        is_mandatory: form.is_mandatory,
        files: entries.map(([path, { sha256, size }]) => ({ path, sha256, size })),
      });

      message.success("版本已创建");
      setOpen(false);
      setForm({
        version: "",
        platform: "Windows x64",
        changelog: "",
        is_latest: false,
        is_mandatory: false,
      });
      resetUpload();
      load();
    } catch {
      message.error("创建失败");
    } finally {
      setLoading(false);
      setUploadStage("idle");
    }
  };

  const remove = async (id: number) => {
    try {
      await adminApi.deleteVersion(id);
      message.success("已删除");
      load();
    } catch {
      message.error("删除失败");
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: 0 }}>
          下载版本管理
        </h2>
        {canManage && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              resetUpload();
              setOpen(true);
            }}
          >
            新增版本
          </Button>
        )}
      </div>

      <Table
        dataSource={versions}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20, showTotal: (t: number) => `共 ${t} 条` }}
        scroll={{ y: "calc(100vh - 330px)" }}
        style={{ background: "#fff", borderRadius: 12 }}
        columns={[
          { title: "版本", dataIndex: "version", width: 100 },
          { title: "平台", dataIndex: "platform", width: 120 },
          { title: "更新日志", dataIndex: "changelog", ellipsis: true },
          {
            title: "文件数",
            dataIndex: "file_count",
            width: 80,
            render: (v: number | null) => (v != null ? v : "-"),
          },
          {
            title: "最新",
            dataIndex: "is_latest",
            width: 60,
            render: (v: boolean) => (v ? "是" : ""),
          },
          {
            title: "强制",
            dataIndex: "is_mandatory",
            width: 60,
            render: (v: boolean) => (v ? "是" : ""),
          },
          {
            title: "创建时间",
            dataIndex: "created_at",
            width: 170,
            render: (v: string) => new Date(v).toLocaleString("zh-CN"),
          },
          ...(canManage
            ? [
                {
                  title: "操作",
                  width: 80,
                  render: (_: unknown, record: AdminVersion) => (
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(record.id)}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <Modal
        title="新增下载版本"
        open={open}
        onCancel={() => {
          setOpen(false);
          resetUpload();
        }}
        onOk={create}
        okText="创建"
        cancelText="取消"
        confirmLoading={loading}
        width={480}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
          <Input
            placeholder="版本号 (如 7.0.5)"
            value={form.version}
            onChange={(e) => setForm({ ...form, version: e.target.value })}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#6b5e55", whiteSpace: "nowrap" }}>平台</span>
            <select
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              style={{
                flex: 1,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid #d9d9d9",
                fontSize: 13,
                color: "#3d3630",
                background: "#fff",
              }}
            >
              <option value="Windows x64">Windows x64</option>
              <option value="Windows x86">Windows x86</option>
              <option value="macOS ARM">macOS ARM</option>
              <option value="macOS x64">macOS x64</option>
              <option value="Linux x64">Linux x64</option>
            </select>
          </div>
          <Input
            placeholder="更新日志 (可选)"
            value={form.changelog}
            onChange={(e) => setForm({ ...form, changelog: e.target.value })}
          />

          {/* Switches */}
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#6b5e55" }}>设为最新版本</span>
              <Switch
                checked={form.is_latest}
                onChange={(v) => setForm({ ...form, is_latest: v })}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#6b5e55" }}>强制更新</span>
              <Switch
                checked={form.is_mandatory}
                onChange={(v) => setForm({ ...form, is_mandatory: v })}
              />
            </div>
          </div>

          {/* Folder picker */}
          <input
            ref={folderInputRef}
            type="file"
            // @ts-expect-error webkitdirectory is not in React types
            webkitdirectory=""
            style={{ display: "none" }}
            onChange={handleFolderSelect}
          />

          {folderName ? (
            <div
              style={{
                padding: "12px 16px",
                background: "#f0fdf4",
                borderRadius: 8,
                border: "1px solid #bbf7d0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <FolderOpenOutlined style={{ color: "#16a34a", fontSize: 16 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "#166534" }}>
                  {folderName}
                </span>
                <span style={{ fontSize: 12, color: "#6b5e55" }}>
                  ({Object.keys(fileManifest).length} 个文件)
                </span>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    resetUpload();
                  }}
                  style={{ marginLeft: "auto" }}
                >
                  重新选择
                </Button>
              </div>
              {uploadStage !== "idle" && (
                <Progress
                  percent={Math.round(
                    uploadProgress.total > 0
                      ? (uploadProgress.done / uploadProgress.total) * 100
                      : 0
                  )}
                  size="small"
                  status="active"
                  style={{ marginTop: 4 }}
                />
              )}
              {uploadStage === "idle" && (
                <p style={{ fontSize: 11, color: "#6b5e55", margin: 0 }}>
                  已就绪 — 点击"创建"开始上传
                </p>
              )}
              {uploadStage === "checking" && (
                <p style={{ fontSize: 11, color: "#6b5e55", margin: 0 }}>
                  检测已存在的文件...
                </p>
              )}
              {uploadStage === "uploading" && (
                <p style={{ fontSize: 11, color: "#6b5e55", margin: 0 }}>
                  上传中 {uploadProgress.done}/{uploadProgress.total}
                </p>
              )}
            </div>
          ) : (
            <Button
              type="dashed"
              icon={<FolderOpenOutlined />}
              onClick={() => folderInputRef.current?.click()}
              block
              style={{ height: 60 }}
            >
              选择版本文件夹
            </Button>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default VersionsPage;
