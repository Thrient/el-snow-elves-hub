import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Typography, Spin, Pagination, Input } from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, PushpinOutlined, LockOutlined,
  EyeOutlined, MessageOutlined, UserOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { forumApi } from "@/api/forum";
import type { ThreadItem } from "@/types";
import { useAuthStore } from "@/store/auth";
import ThreadCard from "@/pages/forum/components/ThreadCard";
import { timeAgo } from "@/util/time";

const { Title } = Typography;

const ForumBoardPage: FC = () => {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [boardName, setBoardName] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  const boardNum = Number(boardId);
  const isValidBoard = boardId && !Number.isNaN(boardNum);

  const load = () => {
    if (!isValidBoard) return;
    setLoading(true);
    Promise.all([
      forumApi.listThreads(boardNum, page),
      forumApi.listBoards(),
    ]).then(([data, boards]) => {
      setThreads(data.items);
      setTotal(data.total);
      setBoardName(boards.find((b) => b.id === boardNum)?.name || "");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [boardNum, page]);

  return (
    <div className="max-w-[55rem] mx-auto pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/forum")}
            className="text-[#b8afa6] p-0! font-500" />
          <div className="w-0.75 h-5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
          <Title level={3} className="m-0! text-[#3d3630] text-xl font-700">
            {boardName || "加载中..."}
          </Title>
          {!loading && <span className="text-[0.75rem] text-[#b8afa6] ml-1">{total} 帖</span>}
        </div>
        <div className="flex gap-2">
          <Input.Search placeholder="搜索帖子..." value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={(v) => { if (v.trim()) navigate(`/forum/search?q=${encodeURIComponent(v.trim())}`); }}
            className="w-50 rounded-2" size="middle" />
          {user && (
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => navigate(`/forum/create?board=${boardId}`)} className="rounded-2">发帖</Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20"><Spin size="large" /></div>
      ) : threads.length === 0 ? (
        <div className="text-center py-15 rounded-4 bg-white border border-solid border-[#e8e3dc]">
          <MessageOutlined className="text-9 text-[#d4c8b8] mb-3" />
          <div className="text-[0.875rem] text-[#6b5e55] mb-1">还没有帖子</div>
          <div className="text-[0.75rem] text-[#b8afa6] mb-4">成为第一个发帖的人</div>
          {user && (
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => navigate(`/forum/create?board=${boardId}`)}>发布新帖</Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {threads.map((t) => (
            <ThreadCard key={t.id} thread={t}
              right={
                <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[3.25rem]">
                  <div className={`flex items-center gap-0.75 text-[0.75rem] ${t.reply_count > 0 ? "font-600 text-[#d4513b]" : "text-[#b8afa6]"}`}>
                    <MessageOutlined className="text-[0.6875rem]" />{t.reply_count}
                  </div>
                  <div className="flex items-center gap-0.75 text-[0.6875rem] text-[#c4bbb2]">
                    <EyeOutlined className="text-[0.6875rem]" />{t.view_count}
                  </div>
                </div>
              }
            >
              <div className="flex items-center gap-1.5 mb-1">
                {t.is_pinned && <span className="text-[0.6875rem] text-[#f59e0b] font-600"><PushpinOutlined /> 置顶</span>}
                {t.is_locked && <span className="text-[0.6875rem] text-[#b8afa6]"><LockOutlined /> 已锁定</span>}
                <span className="font-600 text-[0.9375rem] text-[#3d3630] truncate">{t.title || "无标题"}</span>
              </div>

              <div className="flex gap-2.5 items-start">
                <div className="text-[0.8125rem] text-[#8a7e73] leading-relaxed flex-1 line-clamp-2">
                  {t.content?.replace(/\n/g, " ").slice(0, 120) || ""}
                </div>
                {t.image_urls && t.image_urls.length > 0 && (
                  <div className="w-15 h-11 rounded-1.5 overflow-hidden flex-shrink-0 bg-[#f3f0ec]">
                    <img src={t.image_urls[0]} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-[0.75rem] text-[#b8afa6] mt-1.5">
                <span><UserOutlined className="text-[0.6875rem] mr-1" />{t.author?.username || "匿名"}</span>
                <span><ClockCircleOutlined className="text-[0.6875rem] mr-1" />{t.last_reply_at ? timeAgo(t.last_reply_at) : timeAgo(t.created_at)}</span>
              </div>
            </ThreadCard>
          ))}
        </div>
      )}

      {total > 20 && (
        <div className="text-center mt-6">
          <Pagination current={page} total={total} pageSize={20} onChange={(p) => setPage(p)} size="small" />
        </div>
      )}
    </div>
  );
};

export const page = "ForumBoardPage";
export default ForumBoardPage;
