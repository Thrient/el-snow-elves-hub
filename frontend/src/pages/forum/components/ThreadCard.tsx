import type { FC, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { UserOutlined } from "@ant-design/icons";
import type { ThreadItem } from "@/types";

interface Props {
  thread: ThreadItem;
  children?: ReactNode;
  right?: ReactNode;
}

const ThreadCard: FC<Props> = ({ thread: t, children, right }) => {
  const navigate = useNavigate();
  const pinned = t.is_pinned;
  const bg = pinned ? "bg-[linear-gradient(135deg,#fffdf7,#fffbf0)]" : "bg-white";
  const border = pinned ? "border-[#fef0c0]" : "border-[#e8e3dc]";

  return (
    <div
      onClick={() => navigate(`/forum/post/${t.id}`)}
      className={`flex items-center gap-3.5 p-3.5 px-4.5 rounded-3 cursor-pointer border border-solid transition-all duration-150 hover:border-[#d4513b] hover:translate-x-0.5 ${bg} ${border}`}
    >
      <div className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)] border-2 border-solid border-[#f0ede8] overflow-hidden">
        {t.author?.avatar_url ? (
          <img src={`${t.author.avatar_url}?q=50`} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          <UserOutlined className="text-lg text-[#b8afa6]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        {children}
      </div>
      {right}
    </div>
  );
};

export default ThreadCard;
