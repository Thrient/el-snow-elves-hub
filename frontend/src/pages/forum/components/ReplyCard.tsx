import type { FC } from "react";
import { Button, Tag } from "antd";
import { UserOutlined, HeartOutlined, HeartFilled, MessageOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { ReplyItem, ThreadDetail } from "@/types";
import { timeAgo } from "@/util/time";

const MAX_QUOTE = 80;

interface Props {
  reply: ReplyItem;
  floorNum: number;
  thread: ThreadDetail;
  userId: number | undefined;
  liked: boolean;
  canManage: boolean;
  onLike: () => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onQuoteClick: (floor: number) => void;
}

const ReplyCard: FC<Props> = ({ reply: r, floorNum, thread, userId, liked, canManage, onLike, onReply, onEdit, onDelete, onQuoteClick }) => {
  const isReplyAuthor = userId === r.author?.id;

  // Find parent floor for quote
  const parentFloor = r.parent_id
    ? (r.parent_id === thread.id ? 1 : (thread.replies.findIndex((x) => x.id === r.parent_id) + 2) || null)
    : null;

  return (
    <div id={`floor-${floorNum}`} className="p-4 px-5 rounded-3 bg-white border border-solid border-[#e8e3dc]" style={{ scrollMarginTop: 80 }}>
      {/* Quote */}
      {r.parent_id && r.parent_content && (
        <div onClick={() => parentFloor && onQuoteClick(parentFloor)}
          className="p-2 px-3 mb-2.5 rounded-2 bg-[#f8f6f2] border-l-3 border-solid border-[#d4513b] cursor-pointer transition-colors duration-200 hover:bg-[#f3f0e9] text-[0.75rem] text-[#6b5e55] leading-relaxed">
          <span className="font-600 text-[#d4513b]">↑回复 #{parentFloor} {r.parent_author}</span>
          <span className="text-[#b8afa6] ml-1.5">
            「{r.parent_content.length > MAX_QUOTE ? r.parent_content.slice(0, MAX_QUOTE) + "..." : r.parent_content}」
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8.5 h-8.5 rounded-full flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)] overflow-hidden">
          {r.author?.avatar_url ? (
            <img src={`${r.author.avatar_url}?q=50`} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            <UserOutlined className="text-sm text-[#b8afa6]" />
          )}
        </div>
        <span className="font-600 text-[0.8125rem] text-[#3d3630]">{r.author?.username || "匿名"}</span>
        {r.author?.id === thread.author?.id && (
          <Tag className="text-[0.625rem] leading-4 rounded-0.75 px-1! m-0! bg-[#fef3ef] text-[#d4513b] border-none">楼主</Tag>
        )}
        <span className="ml-auto text-[0.6875rem] text-[#c4bbb2]">
          #{floorNum} · {timeAgo(r.created_at)}
          {r.updated_at && r.updated_at !== r.created_at && (
            <span className="ml-1 text-[0.625rem] text-[#d9cfc4]">(已编辑)</span>
          )}
        </span>
      </div>

      {/* Content */}
      <div className="ml-11">
        <div className="text-[0.875rem] text-[#4a423b] leading-7 whitespace-pre-wrap mb-2.5">{r.content}</div>

        {r.image_urls && r.image_urls.length > 0 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(r.image_urls.length, 3)}, 1fr)` }}>
            {r.image_urls.map((url, i) => (
              <div key={i} className="rounded-2 overflow-hidden aspect-16/10 bg-[#f3f0ec]">
                <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 mt-2.5">
          <Button type="text" size="small"
            icon={liked ? <HeartFilled className="text-[#d4513b]" /> : <HeartOutlined />}
            onClick={onLike}
            className={`text-[0.75rem] px-1! ${liked ? "text-[#d4513b]" : "text-[#b8afa6]"}`}>
            {r.like_count || 0}
          </Button>
          {!thread.is_locked && userId && (
            <Button type="text" size="small" onClick={onReply} className="text-[#6b5e55] text-[0.75rem] px-1!">
              <MessageOutlined className="mr-0.5" />回复
            </Button>
          )}
          {(canManage || isReplyAuthor) && (
            <span className="ml-auto flex gap-1">
              {isReplyAuthor && <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} className="text-[#b8afa6] text-[0.6875rem]" />}
              <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={onDelete} className="text-[0.6875rem]" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReplyCard;
