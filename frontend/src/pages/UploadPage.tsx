import { useState, useRef, useCallback, type FC, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Select, Typography, Upload, message, Progress } from "antd";
import { InboxOutlined, FileZipOutlined, CheckCircleOutlined, ThunderboltOutlined, DeleteOutlined, PictureOutlined } from "@ant-design/icons";
import { taskApi } from "../api/tasks";
import { uploadApi, computeMD5 } from "../api/uploads";

const { Title } = Typography;

const CATEGORIES = ["采集", "日常", "帮会", "活动", "综合"];
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

type UploadPhase = "idle" | "hashing" | "checking" | "instant" | "uploading" | "complete" | "submitting";

const phaseLabels: Record<UploadPhase, string> = {
  idle: "", hashing: "计算文件指纹...", checking: "检查秒传...",
  instant: "秒传成功！", uploading: "上传中...", complete: "上传完成",
  submitting: "提交中...",
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatSpeed = (bytesPerSec: number): string => {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
};

const UploadPage: FC = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [fileId, setFileId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "综合", tags: "", version: "1.0" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speedSamples = useRef<number[]>([]);

  const updateSpeed = useCallback((bytesInChunk: number, ms: number) => {
    if (ms <= 0) return;
    const instantSpeed = (bytesInChunk / ms) * 1000;
    speedSamples.current.push(instantSpeed);
    // Keep last 5 samples for moving average
    if (speedSamples.current.length > 5) speedSamples.current.shift();
    const avg = speedSamples.current.reduce((a, b) => a + b, 0) / speedSamples.current.length;
    setSpeed(avg);
  }, []);

  const startUpload = async (f: File) => {
    setFile(f);
    setPhase("hashing");
    setProgress(0);
    setUploadedBytes(0);
    setSpeed(0);
    speedSamples.current = [];

    try {
      // Step 1: Compute MD5
      const md5 = await computeMD5(f, (pct) => setProgress(pct));

      // Step 2: Check instant upload
      setPhase("checking");
      const check = await uploadApi.check(md5);

      if (check.exists && check.file_id) {
        setPhase("instant");
        setFileId(check.file_id);
        setUploadedBytes(f.size);
        setProgress(100);
        await new Promise((r) => setTimeout(r, 600));
        setPhase("complete");
        return;
      }

      // Step 3: Init chunked upload
      const totalChunks = Math.ceil(f.size / CHUNK_SIZE);
      const session = await uploadApi.init(f.name, f.size, totalChunks);

      // Step 4: Upload chunks with speed tracking
      setPhase("uploading");

      let totalUploaded = 0;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, f.size);
        const blob = f.slice(start, end);
        const chunkSize = blob.size;

        const t0 = performance.now();
        await uploadApi.uploadChunk(session.upload_id, i, blob);
        const elapsed = performance.now() - t0;

        totalUploaded += chunkSize;
        setUploadedBytes(totalUploaded);
        setProgress(Math.round((totalUploaded / f.size) * 100));
        updateSpeed(chunkSize, elapsed);
      }

      // Step 5: Complete
      const result = await uploadApi.complete(session.upload_id);
      setFileId(result.file_id);
      setPhase("complete");
      setProgress(100);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.message || "上传失败");
      setPhase("idle");
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".zip")) startUpload(f);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) startUpload(f);
  };

  const resetFile = () => {
    setFile(null); setFileId(null); setPhase("idle"); setProgress(0);
  };

  const submit = async () => {
    if (!fileId) return message.warning("请先上传文件");
    if (!form.title.trim()) return message.warning("请输入任务名称");
    setPhase("submitting");
    try {
      await taskApi.createWithFileId({
        ...form, zip_file_id: fileId, cover: coverFile || undefined,
      });
      message.success("发布成功");
      navigate("/market");
    } catch { message.error("发布失败"); setPhase("complete"); }
  };

  const isUploading = ["hashing", "checking", "uploading"].includes(phase);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
        <Title level={3} style={{ margin: 0, color: "#3d3630", fontWeight: 700 }}>上传任务</Title>
      </div>

      {/* ── File drop zone ── */}
      {phase === "idle" ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? "#d4513b" : "#d9cfc4"}`,
            borderRadius: 16, padding: "48px 24px", textAlign: "center",
            cursor: "pointer", transition: "all 0.2s",
            background: dragOver ? "#fef8f5" : "#faf8f5",
            marginBottom: 24,
          }}
        >
          <InboxOutlined style={{ fontSize: 40, color: dragOver ? "#d4513b" : "#c4bbb2", marginBottom: 12, transition: "color 0.2s" }} />
          <div style={{ fontWeight: 600, color: "#3d3630", fontSize: 15, marginBottom: 6 }}>
            拖拽 ZIP 文件到此处，或点击选择
          </div>
          <div style={{ fontSize: 12, color: "#b8afa6" }}>支持 .zip 格式，最大 100MB</div>
          <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={handleFileSelect} />
        </div>
      ) : (
        /* ── File status card ── */
        <div style={{
          padding: 20, borderRadius: 14, marginBottom: 24,
          background: "#fff", border: "1px solid #e8e3dc",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: phase === "instant" ? "#f0fdf4" : phase === "complete" ? "#f0fdf4" : "#fef3ef",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {phase === "instant" ? <ThunderboltOutlined style={{ fontSize: 22, color: "#22c55e" }} />
              : phase === "complete" ? <CheckCircleOutlined style={{ fontSize: 22, color: "#22c55e" }} />
              : <FileZipOutlined style={{ fontSize: 22, color: "#d4513b" }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, color: "#3d3630", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {file?.name}
            </div>
            <div style={{ fontSize: 12, color: "#b8afa6", marginTop: 2 }}>
              {file && formatSize(file.size)}
              {phaseLabels[phase] && (
                <span style={{ marginLeft: 12, color: phase === "instant" || phase === "complete" ? "#22c55e" : "#d4513b", fontWeight: 500 }}>
                  {phaseLabels[phase]}
                </span>
              )}
            </div>
            {isUploading && (
              <div style={{ marginTop: 10 }}>
                <Progress
                  percent={progress}
                  size="small"
                  strokeColor={{ from: "#d4513b", to: "#e87a5a" }}
                  format={() => {
                    if (phase === "uploading" && file) {
                      return `${formatSize(uploadedBytes)} / ${formatSize(file.size)}`;
                    }
                    return `${progress}%`;
                  }}
                />
                {phase === "uploading" && speed > 0 && (
                  <div style={{ fontSize: 11, color: "#b8afa6", marginTop: 2, textAlign: "right" }}>
                    {formatSpeed(speed)}
                  </div>
                )}
              </div>
            )}
          </div>
          {!isUploading && phase !== "submitting" && (
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={resetFile} danger />
          )}
        </div>
      )}

      {/* ── Form ── */}
      <div style={{
        display: "flex", flexDirection: "column", gap: 14,
        opacity: file ? 1 : 0.5, pointerEvents: file ? "auto" : "none",
        transition: "opacity 0.3s",
      }}>
        <Input
          placeholder="任务名称"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          size="large"
          style={{ borderRadius: 10 }}
        />
        <Input
          placeholder="版本号"
          value={form.version}
          onChange={(e) => setForm({ ...form, version: e.target.value })}
          style={{ borderRadius: 10 }}
        />
        <Select value={form.category} onChange={(v) => setForm({ ...form, category: v })} style={{ width: "100%", borderRadius: 10 }}>
          {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
        </Select>
        <Input
          placeholder="标签，逗号分隔（如: 江南,采集,全点位）"
          value={form.tags}
          onChange={(e) => setForm({ ...form, tags: e.target.value })}
          style={{ borderRadius: 10 }}
        />
        <Input.TextArea
          rows={4}
          placeholder="任务描述..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={{ borderRadius: 10 }}
        />

        {/* Cover image */}
        <div>
          <div style={{ fontSize: 13, color: "#6b5e55", marginBottom: 8, fontWeight: 500 }}>封面图（可选，建议 1280×720）</div>
          <Upload
            accept="image/*"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(f) => { setCoverFile(f); return false; }}
          >
            <Button icon={<PictureOutlined />} style={{ borderRadius: 10 }}>
              {coverFile ? coverFile.name : "选择图片"}
            </Button>
          </Upload>
        </div>

        <Button
          type="primary"
          size="large"
          loading={phase === "submitting"}
          disabled={!fileId}
          onClick={submit}
          block
          style={{
            height: 48, borderRadius: 12, fontSize: 15, fontWeight: 600,
            background: fileId ? "linear-gradient(135deg, #d4513b, #c4402a)" : undefined,
            border: fileId ? "none" : undefined,
            boxShadow: fileId ? "0 4px 20px rgba(212,81,59,0.3)" : undefined,
            marginTop: 8,
          }}
        >
          {phase === "submitting" ? "发布中..." : "发布任务"}
        </Button>
      </div>
    </div>
  );
};

export default UploadPage;
