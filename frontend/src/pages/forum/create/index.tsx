import { useState, useEffect, type FC } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input, Typography, message } from "antd";
import {
  ArrowLeftOutlined, EyeOutlined, EyeInvisibleOutlined, SendOutlined,
} from "@ant-design/icons";
import { forumApi } from "@/api/forum";
import type { ForumBoard } from "@/types";
import BoardPicker from "@/pages/forum/components/BoardPicker";
import ImageUpload, { type UploadedImage } from "@/pages/forum/components/ImageUpload";

const { Title } = Typography;

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

  useEffect(() => { forumApi.listBoards().then(setBoards); }, []);

  const handleSubmit = async () => {
    if (!boardId) return message.warning("请选择板块");
    if (!title.trim()) return message.warning("请输入标题");
    if (!content.trim()) return message.warning("请输入内容");
    if (/[<>]/.test(title) || /[<>]/.test(content)) return message.warning("不能包含 HTML 标签");
    if (images.some((img) => img.uploading)) return message.warning("请等待图片上传完成");
    setSubmitting(true);
    try {
      const imageIds = images.filter((img) => img.fileId !== null).map((img) => img.fileId as number);
      await forumApi.createThread({ title: title.trim(), content: content.trim(), board_id: boardId, image_ids: imageIds });
      message.success("发布成功");
      navigate(`/forum/${boardId}`, { replace: true });
    } catch { /* ErrorToast */ }
    finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-[49rem] mx-auto pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2.5">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} className="text-[#b8afa6] p-0!" />
          <div className="w-0.75 h-5.5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
          <Title level={3} className="m-0! text-[#3d3630] font-700">发布新帖</Title>
        </div>
        <Button type="text" icon={showPreview ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          onClick={() => setShowPreview(!showPreview)}
          className={showPreview ? "text-[#d4513b] font-500" : "text-[#b8afa6] font-500"}>
          {showPreview ? "返回编辑" : "预览"}
        </Button>
      </div>

      {showPreview ? (
        <div className="p-8 rounded-4 bg-white border border-solid border-[#e8e3dc] mb-6">
          {title ? (
            <Title level={3} className="text-[#3d3630]! mb-5">{title}</Title>
          ) : (
            <div className="text-base text-[#c4bbb2] italic mb-5">未填写标题</div>
          )}
          {content ? (
            <div className="text-[0.9375rem] text-[#4a423b] leading-8 whitespace-pre-wrap mb-5">{content}</div>
          ) : (
            <div className="text-[0.875rem] text-[#c4bbb2] italic mb-5">未填写内容</div>
          )}
          {images.length > 0 && (
            <div className="grid gap-2.5 border-t border-solid border-[#f0ede8] pt-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
              {images.map((img, i) => (
                <div key={i} className="rounded-2.5 overflow-hidden aspect-16/10">
                  <img src={img.preview} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-7 rounded-4 bg-white border border-solid border-[#e8e3dc] mb-6">
          <BoardPicker boards={boards} selected={boardId} onChange={setBoardId} />

          <div className="mb-5">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[0.8125rem] font-600 text-[#3d3630]">标题 <span className="text-[#d4513b]">*</span></span>
              <span className={`text-[0.6875rem] ${title.length > 80 ? "text-[#d4513b]" : "text-[#c4bbb2]"}`}>{title.length}/80</span>
            </div>
            <Input placeholder="一句话概括你的帖子..." value={title} onChange={(e) => setTitle(e.target.value)}
              maxLength={80} size="large" className="rounded-2.5 text-[0.9375rem]" />
          </div>

          <div className="mb-5">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[0.8125rem] font-600 text-[#3d3630]">内容 <span className="text-[#d4513b]">*</span></span>
              <span className="text-[0.6875rem] text-[#c4bbb2]">{content.length} 字</span>
            </div>
            <Input.TextArea rows={10} placeholder="分享你的想法、经验或提问..."
              value={content} onChange={(e) => setContent(e.target.value)}
              className="rounded-2.5 text-[0.875rem] leading-8" />
          </div>

          <ImageUpload images={images} setImages={setImages} />
        </div>
      )}

      <div className="flex justify-end gap-3 py-4">
        <Button size="large" onClick={() => navigate(-1)} className="rounded-2.5">取消</Button>
        <Button type="primary" size="large" icon={<SendOutlined />} loading={submitting} onClick={handleSubmit}
          className="rounded-2.5 px-9! font-600 border-none"
          style={{ background: "linear-gradient(135deg, #d4513b, #c4402a)", boxShadow: "0 4px 16px rgba(212,81,59,0.3)" }}>
          发布帖子
        </Button>
      </div>
    </div>
  );
};

export const page = "ForumCreatePage";
export default ForumCreatePage;
