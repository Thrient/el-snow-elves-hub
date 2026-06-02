import { useState, useRef, type FC, type DragEvent } from "react";
import { Button, Spin, message } from "antd";
import { PictureOutlined, DeleteOutlined } from "@ant-design/icons";
import { upload } from "@/api/storage";

export interface UploadedImage {
  file: File;
  preview: string;
  uploading: boolean;
  fileId: number | null;
}

interface Props {
  images: UploadedImage[];
  setImages: (updater: (prev: UploadedImage[]) => UploadedImage[]) => void;
}

const ImageUpload: FC<Props> = ({ images, setImages }) => {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return message.warning("仅支持图片文件");

    const news: UploadedImage[] = arr.map((f) => ({
      file: f, preview: URL.createObjectURL(f), uploading: true, fileId: null,
    }));
    setImages((prev) => [...prev, ...news]);

    // Batch upload — single pre-check covers all images
    try {
      const results = await upload(arr);
      for (const { file, record_id } of results) {
        setImages((prev) => prev.map((img) =>
          img.file === file ? { ...img, uploading: false, fileId: record_id } : img));
      }
    } catch {
      setImages((prev) => prev.map((img) => {
        const matched = arr.find((f) => f === img.file);
        return matched ? { ...img, uploading: false } : img;
      }));
      message.error("部分图片上传失败");
    }
  };

  const remove = (idx: number) => {
    setImages((prev) => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  };

  return (
    <div>
      <div className="text-[0.8125rem] font-600 text-[#3d3630] mb-2.5">
        图片 <span className="font-400 text-[0.75rem] text-[#b8afa6]">（可选，支持拖拽）</span>
      </div>

      {images.length > 0 && (
        <div className="grid gap-2.5 mb-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}>
          {images.map((img, i) => (
            <div key={i} className="relative rounded-2.5 overflow-hidden aspect-4/3 bg-[#f3f0ec] border border-solid border-[#e8e3dc]">
              <img src={img.preview} alt="" className="w-full h-full object-cover" style={{ opacity: img.uploading ? 0.5 : 1 }} />
              {img.uploading && (
                <div className="absolute inset-0 flex items-center justify-center"><Spin size="small" /></div>
              )}
              <Button type="text" size="small" danger icon={<DeleteOutlined />}
                onClick={() => remove(i)}
                className="absolute top-1 right-1 w-6.5 h-6.5! flex items-center justify-center rounded-1.5"
                style={{ background: "rgba(0,0,0,0.4)", color: "#fff" }} />
            </div>
          ))}
        </div>
      )}

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-3 p-6 text-center cursor-pointer transition-all duration-200 ${
          dragOver ? "border-[#d4513b] bg-[#fef8f5]" : "border-[#d9cfc4] bg-[#faf8f5]"
        }`}
      >
        <PictureOutlined className={`text-2xl mb-2 transition-colors duration-200 ${dragOver ? "text-[#d4513b]" : "text-[#c4bbb2]"}`} />
        <div className="text-[0.8125rem] text-[#6b5e55] font-500">拖拽图片到此处，或点击上传</div>
        <div className="text-[0.6875rem] text-[#b8afa6] mt-1">支持 JPG / PNG / GIF，单张最大 10MB</div>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => e.target.files && add(e.target.files)} />
      </div>
    </div>
  );
};

export default ImageUpload;
