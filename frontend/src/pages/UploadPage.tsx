import { useState, useRef, useCallback, type FC, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Typography, Upload, message, Progress } from "antd";
import {
  InboxOutlined, FileZipOutlined, CheckCircleOutlined, ThunderboltOutlined,
  DeleteOutlined, PictureOutlined, ArrowLeftOutlined, CloudUploadOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { taskApi } from "../api/tasks";
import { uploadApi, computeSHA256 } from "../api/uploads";

const { Title, Text } = Typography;
const CHUNK_SIZE = 5 * 1024 * 1024;

type UploadPhase = "idle" | "hashing" | "checking" | "instant" | "uploading" | "complete" | "submitting";

const phaseLabels: Record<UploadPhase, string> = {
  idle: "", hashing: "计算文件指纹...", checking: "检查秒传...",
  instant: "秒传成功！", uploading: "上传中...", complete: "上传完成",
  submitting: "发布中...",
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
  const [fingerprintId, setFingerprintId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", tags: "", version: "1.0.0" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speedSamples = useRef<number[]>([]);

  const updateSpeed = useCallback((bytesInChunk: number, ms: number) => {
    if (ms <= 0) return;
    const instantSpeed = (bytesInChunk / ms) * 1000;
    speedSamples.current.push(instantSpeed);
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
      const sha256 = await computeSHA256(f, (pct) => setProgress(pct));

      setPhase("checking");
      const check = await uploadApi.check(sha256);

      if (check.exists && check.fingerprint_id) {
        setPhase("instant");
        setFingerprintId(check.fingerprint_id);
        setUploadedBytes(f.size);
        setProgress(100);
        await new Promise((r) => setTimeout(r, 800));
        setPhase("complete");
        return;
      }

      const totalChunks = Math.ceil(f.size / CHUNK_SIZE);
      const session = await uploadApi.init(f.name, f.size, totalChunks);

      setPhase("uploading");
      let totalUploaded = 0;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, f.size);
        const blob = f.slice(start, end);

        const t0 = performance.now();
        await uploadApi.uploadChunk(session.upload_id, i, blob);
        const elapsed = performance.now() - t0;

        totalUploaded += blob.size;
        setUploadedBytes(totalUploaded);
        setProgress(Math.round((totalUploaded / f.size) * 100));
        updateSpeed(blob.size, elapsed);
      }

      const result = await uploadApi.complete(session.upload_id);
      setFingerprintId(result.fingerprint_id);
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
    setFile(null); setFingerprintId(null); setPhase("idle"); setProgress(0);
  };

  const submit = async () => {
    if (!fingerprintId) return message.warning("请先上传文件");
    if (!form.title.trim()) return message.warning("请输入任务名称");
    setPhase("submitting");
    try {
      await taskApi.createWithFileId({
        title: form.title.trim(),
        description: form.description.trim(),
        category: "综合",
        tags: form.tags.trim(),
        version: form.version.trim() || "1.0.0",
        zip_file_id: fingerprintId,
        filename: file?.name,
        cover: coverFile || undefined,
      });
      message.success("发布成功");
      navigate("/market");
    } catch { message.error("发布失败"); setPhase("complete"); }
  };

  const isUploading = ["hashing", "checking", "uploading"].includes(phase);
  const step = !file ? 1 : fingerprintId ? 3 : 2;

  return (
    <div style={{ maxWidth: 660, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ color: "#b8afa6", padding: 0, marginLeft: -4 }} />
        <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
        <Title level={3} style={{ margin: 0, color: "#3d3630", fontWeight: 700 }}>上传任务</Title>
      </div>
      <div style={{ fontSize: 13, color: "#b8afa6", marginBottom: 28, marginLeft: 27 }}>
        上传导出的任务 ZIP 包，分享到社区供其他玩家使用
      </div>

      {/* ── Step indicators ── */}
      <div style={{
        display: "flex", gap: 8, marginBottom: 24,
        padding: "6px", borderRadius: 12, background: "#f5f2ee",
      }}>
        {[
          { num: 1, label: "选择文件", icon: <InboxOutlined /> },
          { num: 2, label: "填写信息", icon: <InfoCircleOutlined /> },
          { num: 3, label: "发布", icon: <CloudUploadOutlined /> },
        ].map((s) => {
          const active = step === s.num;
          const done = step > s.num;
          return (
            <div key={s.num} style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 8px", borderRadius: 10, fontSize: 13, fontWeight: 500,
              transition: "all 0.3s",
              background: active ? "#fff" : "transparent",
              color: done ? "#22c55e" : active ? "#d4513b" : "#b8afa6",
              boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
            }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: "50%",
                fontSize: 11, fontWeight: 700,
                background: done ? "#f0fdf4" : active ? "#fef3ef" : "#f5f2ee",
                color: done ? "#22c55e" : active ? "#d4513b" : "#c4bbb2",
              }}>
                {done ? "✓" : s.num}
              </span>
              {s.label}
            </div>
          );
        })}
      </div>

      {/* ── Section 1: File upload ── */}
      <div style={{
        padding: 24, borderRadius: 16, marginBottom: 20,
        background: "#fff", border: "1px solid #e8e3dc",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#3d3630", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 8, background: "#fef3ef",
            color: "#d4513b", fontSize: 13, fontWeight: 700,
          }}>1</span>
          选择文件
          <span style={{ fontWeight: 400, fontSize: 12, color: "#b8afa6", marginLeft: "auto" }}>.zip 格式，最大 100MB</span>
        </div>

        {phase === "idle" ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "#d4513b" : "#d9cfc4"}`,
              borderRadius: 14, padding: "40px 24px", textAlign: "center",
              cursor: "pointer", transition: "all 0.25s",
              background: dragOver ? "linear-gradient(135deg, #fef8f5, #fdf4ed)" : "#faf8f5",
            }}
          >
            <div style={{
              width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
              background: dragOver ? "rgba(212,81,59,0.08)" : "#f0ede8",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.25s",
            }}>
              <FileZipOutlined style={{ fontSize: 28, color: dragOver ? "#d4513b" : "#c4bbb2", transition: "color 0.25s" }} />
            </div>
            <div style={{ fontWeight: 600, color: "#3d3630", fontSize: 15, marginBottom: 6 }}>
              拖拽 ZIP 文件到此处
            </div>
            <div style={{ fontSize: 12, color: "#b8afa6" }}>或点击此区域选择文件</div>
            <input ref={fileInputRef} type="file" accept=".zip" style={{ display: "none" }} onChange={handleFileSelect} />
          </div>
        ) : (
          /* File status */
          <div style={{
            padding: 18, borderRadius: 12,
            background: phase === "instant" || phase === "complete"
              ? "linear-gradient(135deg, #f0fdf4, #ecfdf5)"
              : "linear-gradient(135deg, #fef8f5, #fdf6ef)",
            border: phase === "instant" || phase === "complete" ? "1px solid #bbf7d0" : "1px solid #fde8d8",
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: phase === "instant" || phase === "complete" ? "#dcfce7" : "#fef3ef",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {phase === "instant" ? <ThunderboltOutlined style={{ fontSize: 24, color: "#22c55e" }} />
                : phase === "complete" ? <CheckCircleOutlined style={{ fontSize: 24, color: "#22c55e" }} />
                : <FileZipOutlined style={{ fontSize: 24, color: "#d4513b" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "#3d3630", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {file?.name}
              </div>
              <div style={{ fontSize: 12, marginTop: 3 }}>
                <Text style={{ color: "#b8afa6" }}>{file && formatSize(file.size)}</Text>
                {phaseLabels[phase] && (
                  <Text style={{
                    marginLeft: 12, fontWeight: 500,
                    color: phase === "instant" || phase === "complete" ? "#22c55e" : "#d4513b",
                  }}>
                    {phaseLabels[phase]}
                  </Text>
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
              <Button type="text" size="small" icon={<DeleteOutlined />} onClick={resetFile} danger
                style={{ flexShrink: 0 }} />
            )}
          </div>
        )}
      </div>

      {/* ── Section 2: Task info ── */}
      <div style={{
        padding: 24, borderRadius: 16, marginBottom: 24,
        background: "#fff", border: "1px solid #e8e3dc",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#3d3630", marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 8, background: "#fef3ef",
            color: "#d4513b", fontSize: 13, fontWeight: 700,
          }}>2</span>
          任务信息
          <span style={{ fontWeight: 400, fontSize: 12, color: "#b8afa6", marginLeft: "auto" }}>带 * 为必填</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>
              任务名称 <span style={{ color: "#d4513b" }}>*</span>
            </div>
            <Input
              placeholder="例如：江南全套餐采集脚本"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              size="large"
              style={{ borderRadius: 10 }}
            />
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>版本号</div>
              <Input
                placeholder="1.0"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                style={{ borderRadius: 10 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>分类</div>
              <div style={{
                height: 40, display: "flex", alignItems: "center", padding: "0 12px",
                borderRadius: 10, background: "#f5f2ee", border: "1px solid #e8e3dc",
                fontSize: 13, color: "#6b5e55",
              }}>
                综合
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>标签</div>
            <Input
              placeholder="江南, 采集, 全点位（逗号分隔）"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              style={{ borderRadius: 10 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>描述</div>
            <Input.TextArea
              rows={4}
              placeholder="详细介绍你的脚本功能、适用场景、使用方法等..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ borderRadius: 10 }}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b5e55", marginBottom: 5 }}>
              封面图 <span style={{ fontWeight: 400, color: "#b8afa6" }}>（可选，建议 1280×720）</span>
            </div>
            <Upload
              accept="image/*"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(f) => { setCoverFile(f); return false; }}
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 16px", borderRadius: 10,
                border: "1px dashed #d9cfc4", cursor: "pointer",
                transition: "all 0.2s",
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#d4513b"; e.currentTarget.style.background = "#fef8f5"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#d9cfc4"; e.currentTarget.style.background = "transparent"; }}
              >
                <PictureOutlined style={{ color: "#b8afa6" }} />
                <span style={{ fontSize: 13, color: "#6b5e55" }}>
                  {coverFile ? (
                    <span style={{ color: "#22c55e" }}>{coverFile.name}</span>
                  ) : "点击上传封面图"}
                </span>
              </div>
            </Upload>
          </div>
        </div>
      </div>

      {/* ── Submit ── */}
      <Button
        type="primary"
        size="large"
        loading={phase === "submitting"}
        disabled={!fingerprintId}
        onClick={submit}
        block
        style={{
          height: 50, borderRadius: 14, fontSize: 16, fontWeight: 600,
          background: fingerprintId ? "linear-gradient(135deg, #d4513b, #c4402a)" : undefined,
          border: fingerprintId ? "none" : undefined,
          boxShadow: fingerprintId ? "0 6px 24px rgba(212,81,59,0.35)" : undefined,
        }}
      >
        {phase === "submitting" ? "发布中..." : "发布任务"}
      </Button>
    </div>
  );
};

export default UploadPage;
