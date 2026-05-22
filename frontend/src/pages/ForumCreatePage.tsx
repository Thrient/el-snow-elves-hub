import { useState, useEffect, useRef, type FC } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Typography, message, Spin } from "antd";
import {
  ArrowLeftOutlined, EyeOutlined, EyeInvisibleOutlined,
  SendOutlined, MessageOutlined, PictureOutlined, DeleteOutlined,
} from "@ant-design/icons";
import { forumApi, type ForumBoard } from "../api/forum";

const { Title } = Typography;

interface UploadedImage {
  file: File;
  preview: string;
  uploading: boolean;
  fileId: number | null;
}

const ForumCreatePage: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedBoard = Number(searchParams.get("board")) || 0;

  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [boardId, setBoardId] = useState(preselectedBoard);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    forumApi.listBoards().then(setBoards);
  }, []);

  const addImages = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (arr.length === 0) return message.warning("仅支持图片文件");

    // Create previews immediately
    const newImages: UploadedImage[] = arr.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
      uploading: true,
      fileId: null,
    }));
    setImages((prev) => [...prev, ...newImages]);

    // Upload each image
    for (let i = 0; i < arr.length; i++) {
      try {
        const result = await forumApi.uploadImage(arr[i]);
        setImages((prev) => prev.map((img) => {
          if (img.file === arr[i]) return { ...img, uploading: false, fileId: result.fingerprint_id };
          return img;
        }));
      } catch {
        setImages((prev) => prev.map((img) => {
          if (img.file === arr[i]) return { ...img, uploading: false };
          return img;
        }));
        message.error(`${arr[i].name} 上传失败`);
      }
    }
  };

  const removeImage = (idx: number) => {
    setImages((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) addImages(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (!boardId) return message.warning("请选择板块");
    if (!title.trim()) return message.warning("请输入标题");
    if (!content.trim()) return message.warning("请输入内容");
    setSubmitting(true);
    try {
      // Upload any remaining images first and collect file_ids
      // Actually, images are already being uploaded on add. We need file_ids.
      // The current uploadImage returns a URL. We need a file_id.
      // Let me modify the flow: use uploadApi from uploads module for images too.
      // For now, submit without images if they're still uploading
      const stillUploading = images.some((img) => img.uploading);
      if (stillUploading) {
        message.warning("请等待图片上传完成");
        setSubmitting(false);
        return;
      }

      const imageIds = images
        .filter((img) => img.fileId !== null)
        .map((img) => img.fileId as number);

      await forumApi.createThread({
        title: title.trim(),
        content: content.trim(),
        board_id: boardId,
        image_ids: imageIds,
      });
      message.success("发布成功");
      navigate(`/forum/${boardId}`, { replace: true });
    } catch { message.error("发布失败"); }
    finally { setSubmitting(false); }
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button type="text" icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ color: "#b8afa6", padding: 0 }} />
          <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
          <Title level={3} style={{ margin: 0, color: "#3d3630", fontWeight: 700 }}>发布新帖</Title>
        </div>
        <Button
          type="text"
          icon={showPreview ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          onClick={() => setShowPreview(!showPreview)}
          style={{ color: showPreview ? "#d4513b" : "#b8afa6", fontWeight: 500 }}
        >
          {showPreview ? "返回编辑" : "预览"}
        </Button>
      </div>

      {showPreview ? (
        /* ── Preview ── */
        <div style={{
          padding: 32, borderRadius: 16, background: "#fff",
          border: "1px solid #e8e3dc", marginBottom: 24,
        }}>
          {title ? (
            <Title level={3} style={{ color: "#3d3630", marginBottom: 20 }}>{title}</Title>
          ) : (
            <div style={{ fontSize: 16, color: "#c4bbb2", fontStyle: "italic", marginBottom: 20 }}>未填写标题</div>
          )}
          {content ? (
            <div style={{ fontSize: 15, color: "#4a423b", lineHeight: 2, whiteSpace: "pre-wrap", marginBottom: 20 }}>
              {content}
            </div>
          ) : (
            <div style={{ fontSize: 14, color: "#c4bbb2", fontStyle: "italic", marginBottom: 20 }}>未填写内容</div>
          )}
          {/* Preview images */}
          {images.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10,
              borderTop: "1px solid #f0ede8", paddingTop: 16,
            }}>
              {images.map((img, i) => (
                <div key={i} style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "16/10" }}>
                  <img src={img.preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Edit form ── */
        <div style={{
          padding: 28, borderRadius: 16, background: "#fff",
          border: "1px solid #e8e3dc", marginBottom: 24,
        }}>
          {/* Board selector */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3d3630", marginBottom: 10 }}>
              发布到 <span style={{ color: "#d4513b" }}>*</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {boards.map((b) => (
                <div
                  key={b.id}
                  onClick={() => setBoardId(b.id)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, cursor: "pointer",
                    fontSize: 13, fontWeight: 500, transition: "all 0.15s",
                    background: boardId === b.id ? "#fef3ef" : "#f5f2ee",
                    color: boardId === b.id ? "#d4513b" : "#6b5e55",
                    border: boardId === b.id ? "1px solid #f5c6b8" : "1px solid transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (boardId !== b.id) { e.currentTarget.style.background = "#faf6f2"; e.currentTarget.style.borderColor = "#e8e3dc"; }
                  }}
                  onMouseLeave={(e) => {
                    if (boardId !== b.id) { e.currentTarget.style.background = "#f5f2ee"; e.currentTarget.style.borderColor = "transparent"; }
                  }}
                >
                  <MessageOutlined style={{ marginRight: 6, fontSize: 12 }} />
                  {b.name}
                </div>
              ))}
            </div>
          </div>

          {/* Title */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#3d3630" }}>
                标题 <span style={{ color: "#d4513b" }}>*</span>
              </span>
              <span style={{ fontSize: 11, color: title.length > 80 ? "#d4513b" : "#c4bbb2" }}>{title.length}/80</span>
            </div>
            <Input
              placeholder="一句话概括你的帖子..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              size="large"
              style={{ borderRadius: 10, fontSize: 15 }}
            />
          </div>

          {/* Content */}
          <div style={{ marginBottom: 20 }}>
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#3d3630" }}>
                内容 <span style={{ color: "#d4513b" }}>*</span>
              </span>
              <span style={{ fontSize: 11, color: "#c4bbb2" }}>{content.length} 字</span>
            </div>
            <Input.TextArea
              rows={10}
              placeholder="分享你的想法、经验或提问..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{ borderRadius: 10, fontSize: 14, lineHeight: 1.8 }}
            />
          </div>

          {/* Image upload zone */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#3d3630", marginBottom: 10 }}>
              图片 <span style={{ fontWeight: 400, color: "#b8afa6", fontSize: 12 }}>（可选，支持拖拽）</span>
            </div>

            {/* Thumbnails grid */}
            {images.length > 0 && (
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 10, marginBottom: 12,
              }}>
                {images.map((img, i) => (
                  <div key={i} style={{
                    position: "relative", borderRadius: 10, overflow: "hidden",
                    aspectRatio: "4/3", background: "#f3f0ec",
                    border: "1px solid #e8e3dc",
                  }}>
                    <img src={img.preview} alt="" style={{
                      width: "100%", height: "100%", objectFit: "cover",
                      opacity: img.uploading ? 0.5 : 1,
                    }} />
                    {img.uploading && (
                      <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Spin size="small" />
                      </div>
                    )}
                    <Button
                      type="text" size="small" danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeImage(i)}
                      style={{
                        position: "absolute", top: 4, right: 4,
                        background: "rgba(0,0,0,0.4)", color: "#fff",
                        borderRadius: 6, width: 26, height: 26,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? "#d4513b" : "#d9cfc4"}`,
                borderRadius: 12, padding: "24px", textAlign: "center",
                cursor: "pointer", transition: "all 0.2s",
                background: dragOver ? "#fef8f5" : "#faf8f5",
              }}
            >
              <PictureOutlined style={{
                fontSize: 24, color: dragOver ? "#d4513b" : "#c4bbb2",
                marginBottom: 8, transition: "color 0.2s",
              }} />
              <div style={{ fontSize: 13, color: "#6b5e55", fontWeight: 500 }}>
                拖拽图片到此处，或点击上传
              </div>
              <div style={{ fontSize: 11, color: "#b8afa6", marginTop: 4 }}>
                支持 JPG / PNG / GIF，单张最大 10MB
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => e.target.files && addImages(e.target.files)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, padding: "16px 0" }}>
        <Button size="large" onClick={() => navigate(-1)} style={{ borderRadius: 10 }}>取消</Button>
        <Button
          type="primary"
          size="large"
          icon={<SendOutlined />}
          loading={submitting}
          onClick={handleSubmit}
          style={{
            borderRadius: 10, padding: "0 36px", fontWeight: 600,
            background: "linear-gradient(135deg, #d4513b, #c4402a)", border: "none",
            boxShadow: "0 4px 16px rgba(212,81,59,0.3)",
          }}
        >
          发布帖子
        </Button>
      </div>
    </div>
  );
};

export default ForumCreatePage;
