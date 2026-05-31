import type { FC } from "react";
import { Button, Typography, Dropdown } from "antd";
import {
  UserOutlined, ClockCircleOutlined, EyeOutlined, MessageOutlined,
  PushpinOutlined, LockOutlined, MoreOutlined, EditOutlined, DeleteOutlined,
  HeartOutlined, HeartFilled,
} from "@ant-design/icons";
import type { ThreadDetail } from "@/types";

const { Title } = Typography;

interface Props {
  thread: ThreadDetail;
  liked: boolean;
  canManage: boolean;
  isAuthor: boolean;
  onLike: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdmin: (action: "pin" | "unpin" | "lock" | "unlock") => void;
}

const PostDetail: FC<Props> = ({ thread, liked, canManage, isAuthor, onLike, onEdit, onDelete, onAdmin }) => {
  const menuItems = [
    ...(canManage ? [
      { key: "pin", icon: <PushpinOutlined />, label: thread.is_pinned ? "取消置顶" : "置顶", onClick: () => onAdmin(thread.is_pinned ? "unpin" : "pin") },
      { key: "lock", icon: <LockOutlined />, label: thread.is_locked ? "解除锁定" : "锁定", onClick: () => onAdmin(thread.is_locked ? "unlock" : "lock") },
      { type: "divider" as const },
    ] : []),
    ...(isAuthor ? [
      { key: "edit", icon: <EditOutlined />, label: "编辑", onClick: onEdit },
      { key: "delete", icon: <DeleteOutlined />, label: "删除", danger: true, onClick: onDelete },
    ] : []),
  ];

  const timeStr = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("zh-CN") + " " + d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div id="floor-1" className="p-6 px-7 rounded-4 mb-2 bg-white border border-solid border-[#e8e3dc]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 mb-4">
        <div className="w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#f5f0e8,#ebe4d8)] overflow-hidden">
          {thread.author?.avatar_url ? (
            <img src={thread.author.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <UserOutlined className="text-xl text-[#b8afa6]" />
          )}
        </div>
        <div className="flex-1">
          <div className="font-600 text-[0.875rem] text-[#3d3630]">
            {thread.author?.username || "匿名"}
            <span className="text-[0.6875rem] font-400 text-[#b8afa6] ml-2">#1 楼主</span>
          </div>
          <div className="text-[0.75rem] text-[#b8afa6] mt-0.5">
            <ClockCircleOutlined className="mr-1" />{timeStr(thread.created_at)}
            {thread.updated_at && thread.updated_at !== thread.created_at && (
              <span className="ml-2 text-[0.6875rem] text-[#c4bbb2]">(已编辑)</span>
            )}
            <span className="mx-2 text-[#d9cfc4]">·</span>
            <EyeOutlined className="mr-1" />{thread.view_count.toLocaleString()} 阅读
            <span className="mx-2 text-[#d9cfc4]">·</span>
            <MessageOutlined className="mr-1" />{thread.reply_count.toLocaleString()} 回复
          </div>
        </div>
        <Button type="text" size="small"
          icon={liked ? <HeartFilled className="text-[#d4513b]" /> : <HeartOutlined />}
          onClick={onLike}
          className={liked ? "text-[#d4513b] text-[0.8125rem] font-500" : "text-[#b8afa6] text-[0.8125rem] font-500"}>
          {thread.like_count || 0}
        </Button>
        {menuItems.length > 0 && (
          <Dropdown menu={{ items: menuItems as any }}>
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        )}
      </div>

      {/* Title */}
      {thread.title && (
        <Title level={3} className="text-[#3d3630]! m-0! mb-4 text-xl font-700">
          {thread.is_pinned && <PushpinOutlined className="text-[#f59e0b] mr-1.5 text-base" />}
          {thread.is_locked && <LockOutlined className="text-[#b8afa6] mr-1.5 text-base" />}
          {thread.title}
        </Title>
      )}

      {/* Content */}
      <div className="text-[0.9375rem] text-[#4a423b] leading-8 whitespace-pre-wrap">{thread.content}</div>

      {/* Images */}
      {thread.image_urls && thread.image_urls.length > 0 && (
        <div className="grid gap-2.5 mt-5" style={{ gridTemplateColumns: `repeat(${Math.min(thread.image_urls.length, 3)}, 1fr)` }}>
          {thread.image_urls.map((url, i) => (
            <div key={i} className="rounded-2.5 overflow-hidden aspect-16/10 bg-[#f3f0ec] cursor-zoom-in">
              <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PostDetail;
