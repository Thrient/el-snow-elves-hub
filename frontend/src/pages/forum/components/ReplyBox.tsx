import { useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input } from "antd";
import { UserOutlined, SendOutlined, PictureOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";

interface Props {
  locked: boolean;
  replyingTo: { id: number; floor: number; author: string } | null;
  submitting: boolean;
  replyText: string;
  onReplyTextChange: (v: string) => void;
  onCancelReply: () => void;
  onSubmit: () => void;
}

const ReplyBox: FC<Props> = ({ locked, replyingTo, submitting, replyText, onReplyTextChange, onCancelReply, onSubmit }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [images, setImages] = useState<File[]>([]);

  if (locked) {
    return (
      <div className="text-center py-4 rounded-3 bg-white border border-solid border-[#e8e3dc] text-[#b8afa6] text-[0.8125rem]">
        <LockOutlined className="mr-1.5" />此帖已锁定，无法回复
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-4 rounded-3 bg-white border border-solid border-[#e8e3dc] text-[#b8afa6] text-[0.8125rem]">
        请 <Button type="link" size="small" onClick={() => navigate("/login")} className="p-0!">登录</Button> 后参与讨论
      </div>
    );
  }

  return (
    <div className="p-5 rounded-3.5 bg-white border border-solid border-[#e8e3dc]">
      {replyingTo && (
        <div className="flex items-center gap-2 py-1.5 px-3 mb-2.5 rounded-2 bg-[#fef3ef] text-[0.75rem] text-[#d4513b]">
          <span>回复 #{replyingTo.floor} @{replyingTo.author}</span>
          <Button type="text" size="small" onClick={onCancelReply} className="ml-auto text-[#b8afa6] text-[0.6875rem]">× 取消</Button>
        </div>
      )}
      <div className="flex gap-3">
        <div className="w-9.5 h-9.5 rounded-full flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)]">
          <UserOutlined className="text-sm text-[#b8afa6]" />
        </div>
        <div className="flex-1">
          <Input.TextArea rows={3} placeholder="写下你的回复..." value={replyText}
            onChange={(e) => onReplyTextChange(e.target.value)}
            className="rounded-2.5 mb-2.5" />
          <div className="flex justify-between items-center">
            <label className="cursor-pointer text-[0.75rem] text-[#6b5e55] flex items-center gap-1">
              <PictureOutlined /> 添加图片
              <input type="file" multiple accept="image/*" className="hidden"
                onChange={(e) => setImages((prev) => [...prev, ...Array.from(e.target.files || [])])} />
            </label>
            {images.length > 0 && (
              <div className="flex gap-1 flex-wrap flex-1 ml-3">
                {images.map((f, i) => (
                  <div key={i} className="relative w-8 h-8 rounded-1.5 overflow-hidden border border-solid border-[#e8e3dc]">
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
                    <div onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute inset-0 bg-[rgba(0,0,0,.4)] flex items-center justify-center cursor-pointer text-white text-[0.625rem] opacity-0 hover:opacity-100 transition-opacity duration-200">×</div>
                  </div>
                ))}
              </div>
            )}
            <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={onSubmit} className="rounded-2">回复</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReplyBox;
