import { useState, useRef, useCallback, type FC, type DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, Typography, Upload, message } from "antd";
import { ArrowLeftOutlined, PictureOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import { uploadApi, computeSHA256 } from "@/api/storage";
import StepIndicator from "./StepIndicator";
import FileUploader from "./FileUploader";

const { Title } = Typography;
const CHUNK_SIZE = 5 * 1024 * 1024;
type UploadPhase = "idle" | "hashing" | "checking" | "instant" | "uploading" | "complete" | "submitting";

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
  const speedSamples = useRef<number[]>([]);

  const updateSpeed = useCallback((bytesInChunk: number, ms: number) => {
    if (ms <= 0) return;
    const instantSpeed = (bytesInChunk / ms) * 1000;
    speedSamples.current.push(instantSpeed);
    if (speedSamples.current.length > 5) speedSamples.current.shift();
    setSpeed(speedSamples.current.reduce((a, b) => a + b, 0) / speedSamples.current.length);
  }, []);

  const startUpload = async (f: File) => {
    setFile(f); setPhase("hashing"); setProgress(0); setUploadedBytes(0); setSpeed(0);
    speedSamples.current = [];
    try {
      const sha256 = await computeSHA256(f, (pct) => setProgress(pct));
      setPhase("checking");
      const check = await uploadApi.check(sha256);
      if (check.exists && check.fingerprint_id) {
        setPhase("instant"); setFingerprintId(check.fingerprint_id);
        setUploadedBytes(f.size); setProgress(100);
        await new Promise((r) => setTimeout(r, 800));
        setPhase("complete"); return;
      }
      const totalChunks = Math.ceil(f.size / CHUNK_SIZE);
      const session = await uploadApi.init(f.name, f.size, totalChunks);
      setPhase("uploading");
      let totalUploaded = 0;
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const blob = f.slice(start, Math.min(start + CHUNK_SIZE, f.size));
        const t0 = performance.now();
        await uploadApi.uploadChunk(session.upload_id, i, blob);
        const elapsed = performance.now() - t0;
        totalUploaded += blob.size;
        setUploadedBytes(totalUploaded);
        setProgress(Math.round((totalUploaded / f.size) * 100));
        updateSpeed(blob.size, elapsed);
      }
      const result = await uploadApi.complete(session.upload_id);
      setFingerprintId(result.fingerprint_id); setPhase("complete"); setProgress(100);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || err?.message || "上传失败");
      setPhase("idle");
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.endsWith(".zip")) void startUpload(f);
  };

  const resetFile = () => { setFile(null); setFingerprintId(null); setPhase("idle"); setProgress(0); };

  const submit = async () => {
    if (!fingerprintId) return message.warning("请先上传文件");
    if (!form.title.trim()) return message.warning("请输入任务名称");
    setPhase("submitting");
    try {
      await taskApi.createWithFileId({
        title: form.title.trim(), description: form.description.trim(),
        category: "综合", tags: form.tags.trim(),
        version: form.version.trim() || "1.0.0",
        zip_file_id: fingerprintId, filename: file?.name,
        cover: coverFile || undefined,
      });
      message.success("发布成功"); navigate("/market");
    } catch { message.error("发布失败"); setPhase("complete"); }
  };

  const step = !file ? 1 : fingerprintId ? 3 : 2;

  return (
    <div className="max-w-[41rem] mx-auto pt-8">
      <div className="flex items-center gap-3 mb-2">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="text-[#b8afa6] p-0! -ml-1" />
        <div className="w-0.75 h-5.5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
        <Title level={3} className="m-0! text-[#3d3630] font-700">上传任务</Title>
      </div>
      <div className="text-[0.8125rem] text-[#b8afa6] mb-7 ml-6.5">
        上传导出的任务 ZIP 包，分享到社区供其他玩家使用
      </div>

      <StepIndicator step={step} />

      <FileUploader phase={phase} file={file} progress={progress} uploadedBytes={uploadedBytes}
        speed={speed} dragOver={dragOver}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onFileSelect={(e) => { const f = e.target.files?.[0]; if (f) void startUpload(f); }}
        onReset={resetFile} />

      <div className="p-6 rounded-4 mb-6 bg-white border border-solid border-[#e8e3dc]">
        <div className="text-[0.875rem] font-600 text-[#3d3630] mb-4.5 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-2 bg-[#fef3ef] text-[#d4513b] text-[0.8125rem] font-700">2</span>
          任务信息
          <span className="font-400 text-[0.75rem] text-[#b8afa6] ml-auto">带 * 为必填</span>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">任务名称 <span className="text-[#d4513b]">*</span></div>
            <Input placeholder="例如：江南全套餐采集脚本" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} size="large" className="rounded-2.5" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">版本号</div>
              <Input placeholder="1.0" value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })} className="rounded-2.5" />
            </div>
            <div className="flex-1">
              <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">分类</div>
              <div className="h-10 flex items-center px-3 rounded-2.5 bg-[#f5f2ee] border border-solid border-[#e8e3dc] text-[0.8125rem] text-[#6b5e55]">综合</div>
            </div>
          </div>

          <div>
            <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">标签</div>
            <Input placeholder="江南, 采集, 全点位（逗号分隔）" value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })} className="rounded-2.5" />
          </div>

          <div>
            <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">描述</div>
            <Input.TextArea rows={4} placeholder="详细介绍你的脚本功能、适用场景、使用方法等..."
              value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-2.5" />
          </div>

          <div>
            <div className="text-[0.75rem] font-500 text-[#6b5e55] mb-1.5">
              封面图 <span className="font-400 text-[#b8afa6]">（可选，建议 1280×720）</span>
            </div>
            <Upload accept="image/*" maxCount={1} showUploadList={false}
              beforeUpload={(f) => { setCoverFile(f); return false; }}>
              <div className="flex items-center gap-2 py-2 px-4 rounded-2.5 border border-dashed border-[#d9cfc4] cursor-pointer transition-all duration-200 hover:border-[#d4513b] hover:bg-[#fef8f5]">
                <PictureOutlined className="text-[#b8afa6]" />
                <span className="text-[0.8125rem] text-[#6b5e55]">
                  {coverFile ? <span className="text-[#22c55e]">{coverFile.name}</span> : "点击上传封面图"}
                </span>
              </div>
            </Upload>
          </div>
        </div>
      </div>

      <Button type="primary" size="large" loading={phase === "submitting"} disabled={!fingerprintId}
        onClick={submit} block
        className="h-12.5 rounded-3.5 text-base font-600"
        style={fingerprintId ? {
          background: "linear-gradient(135deg, #d4513b, #c4402a)", border: "none",
          boxShadow: "0 6px 24px rgba(212,81,59,0.35)",
        } : undefined}>
        {phase === "submitting" ? "发布中..." : "发布任务"}
      </Button>
    </div>
  );
};

export const page = "UploadPage";
export default UploadPage;
