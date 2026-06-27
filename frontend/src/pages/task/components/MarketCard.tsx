import { type FC, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Tag, Checkbox } from "antd";
import { DownloadOutlined, LikeOutlined, CommentOutlined, UserOutlined, AppstoreOutlined } from "@ant-design/icons";
import type { TaskItem } from "@/types";

interface Props {
  task: TaskItem;
  index: number;
  coverBadge?: ReactNode;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: number, checked: boolean) => void;
}

const MarketCard: FC<Props> = ({ task, index, coverBadge, selectable, selected, onSelect }) => {
  const navigate = useNavigate();
  const delay = `${index * 0.04}s`;

  return (
    <div
      onClick={() => navigate(`/market/${task.id}`)}
      className="rounded-3.5 overflow-hidden cursor-pointer bg-white border border-solid border-[#e8e3dc] transition-all duration-250 hover:-translate-y-1 hover:shadow-lg hover:border-[#d4513b] relative group"
      style={{ animation: `card-in 0.4s ease-out ${delay} both` }}
    >
      {/* 复选框 — 悬浮或选中时显示 */}
      {selectable && (
        <div
          className={`absolute top-2 left-2 z-10 transition-opacity duration-200 ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(task.id, !selected);
          }}
        >
          <Checkbox checked={selected} className="scale-120" />
        </div>
      )}

      {/* Cover */}
      {task.cover_url ? (
        <div className="h-[9.4rem] relative overflow-hidden bg-[#f3f0ec]">
          <img
            src={`${task.cover_url}?q=40`}
            alt={task.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-400 group-hover:scale-106"
          />
          {coverBadge}
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-[linear-gradient(transparent,rgba(0,0,0,0.3))]" />
        </div>
      ) : (
        <div className="h-[9.4rem] relative flex items-center justify-center bg-[linear-gradient(145deg,#f5f0e8,#ebe4d8)]">
          <AppstoreOutlined className="text-9 text-[#d4c8b8]" />
          {coverBadge}
        </div>
      )}

      {/* Body */}
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Tag className="text-[0.625rem] leading-4.5 rounded-1 m-0! px-1.5 border-none text-[#d4513b] bg-[#fef3ef]">
            {task.category}
          </Tag>
          <span className="text-[0.625rem] text-[#c4bbb2]">v{task.version}</span>
        </div>

        <div className="text-[0.8125rem] font-600 text-[#3d3630] mb-1 truncate">
          {task.title}
        </div>

        <div className="text-[0.6875rem] text-[#b8afa6] mb-2 flex items-center gap-1">
          {task.author_avatar_url ? (
            <img src={`${task.author_avatar_url}?q=50`} alt="" className="w-4 h-4 rounded-full object-cover flex-shrink-0" />
          ) : (
            <UserOutlined />
          )}
          {task.author_name}
        </div>

        <div className="flex gap-3.5 text-[0.6875rem] text-[#b8afa6] pt-2">
          <span className="flex items-center gap-0.75">
            <DownloadOutlined /> {task.download_count.toLocaleString()}
          </span>
          <span className={`flex items-center gap-0.75 ${task.liked ? "text-[#d4513b] font-500" : ""}`}>
            <LikeOutlined /> {task.like_count.toLocaleString()}
          </span>
          <span className="flex items-center gap-0.75">
            <CommentOutlined /> {task.comment_count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};

export default MarketCard;
