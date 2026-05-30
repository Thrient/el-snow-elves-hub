import { type FC, type DragEvent, type ChangeEvent } from "react";
import { Button, Progress } from "antd";
import { FileZipOutlined, CheckCircleOutlined, ThunderboltOutlined, DeleteOutlined } from "@ant-design/icons";
import { formatSize, formatSpeed } from "@/util/format";

type UploadPhase = string;

const PHASE_LABELS: Record<string, string> = {
  hashing: "计算文件指纹...", checking: "检查秒传...",
  instant: "秒传成功！", uploading: "上传中...", complete: "上传完成", submitting: "发布中...",
};

interface Props {
  phase: UploadPhase;
  file: File | null;
  progress: number;
  uploadedBytes: number;
  speed: number;
  dragOver: boolean;
  onDrop: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onFileSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
}

const FileUploader: FC<Props> = ({ phase, file, progress, uploadedBytes, speed, dragOver, onDrop, onDragOver, onDragLeave, onFileSelect, onReset }) => {
  const isUploading = ["hashing", "checking", "uploading"].includes(phase);
  const success = phase === "instant" || phase === "complete";

  return (
    <div className="p-6 rounded-4 mb-5 bg-white border border-solid border-[#e8e3dc]">
      <div className="text-[0.875rem] font-600 text-[#3d3630] mb-4 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-2 bg-[#fef3ef] text-[#d4513b] text-[0.8125rem] font-700">1</span>
        选择文件
        <span className="font-400 text-[0.75rem] text-[#b8afa6] ml-auto">.zip 格式，最大 100MB</span>
      </div>

      {phase === "idle" ? (
        <div
          onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
          onClick={() => document.getElementById("zip-input")?.click()}
          className={`border-2 border-dashed rounded-3.5 py-10 px-6 text-center cursor-pointer transition-all duration-250 ${
            dragOver ? "border-[#d4513b] bg-[linear-gradient(135deg,#fef8f5,#fdf4ed)]" : "border-[#d9cfc4] bg-[#faf8f5]"
          }`}
        >
          <div className={`w-16 h-16 rounded-4 mx-auto mb-4 flex items-center justify-center transition-all duration-250 ${
            dragOver ? "bg-[rgba(212,81,59,0.08)]" : "bg-[#f0ede8]"
          }`}>
            <FileZipOutlined className={`text-7 transition-colors duration-250 ${dragOver ? "text-[#d4513b]" : "text-[#c4bbb2]"}`} />
          </div>
          <div className="font-600 text-[#3d3630] text-[0.9375rem] mb-1.5">拖拽 ZIP 文件到此处</div>
          <div className="text-[0.75rem] text-[#b8afa6]">或点击此区域选择文件</div>
          <input id="zip-input" type="file" accept=".zip" className="hidden" onChange={onFileSelect} />
        </div>
      ) : (
        <div className={`p-4.5 rounded-3 flex items-center gap-3.5 border border-solid ${
          success ? "bg-[linear-gradient(135deg,#f0fdf4,#ecfdf5)] border-[#bbf7d0]" : "bg-[linear-gradient(135deg,#fef8f5,#fdf6ef)] border-[#fde8d8]"
        }`}>
          <div className={`w-13 h-13 rounded-3.5 flex items-center justify-center flex-shrink-0 ${success ? "bg-[#dcfce7]" : "bg-[#fef3ef]"}`}>
            {phase === "instant" ? <ThunderboltOutlined className="text-6 text-[#22c55e]" />
              : phase === "complete" ? <CheckCircleOutlined className="text-6 text-[#22c55e]" />
              : <FileZipOutlined className="text-6 text-[#d4513b]" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-600 text-[#3d3630] text-[0.875rem] truncate">{file?.name}</div>
            <div className="text-[0.75rem] mt-0.75">
              <span className="text-[#b8afa6]">{file && formatSize(file.size)}</span>
              {PHASE_LABELS[phase] && (
                <span className={`ml-3 font-500 ${success ? "text-[#22c55e]" : "text-[#d4513b]"}`}>{PHASE_LABELS[phase]}</span>
              )}
            </div>
            {isUploading && (
              <div className="mt-2.5">
                <Progress percent={progress} size="small" strokeColor={{ from: "#d4513b", to: "#e87a5a" }}
                  format={() => phase === "uploading" && file ? `${formatSize(uploadedBytes)} / ${formatSize(file.size)}` : `${progress}%`} />
                {phase === "uploading" && speed > 0 && (
                  <div className="text-[0.6875rem] text-[#b8afa6] mt-0.5 text-right">{formatSpeed(speed)}</div>
                )}
              </div>
            )}
          </div>
          {!isUploading && phase !== "submitting" && (
            <Button type="text" size="small" icon={<DeleteOutlined />} onClick={onReset} danger className="flex-shrink-0" />
          )}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
