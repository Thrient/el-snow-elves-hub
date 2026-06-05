import { useEffect, useState, type FC } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Input, Typography, Spin, Empty, Pagination, Button } from "antd";
import {
  ArrowLeftOutlined, SearchOutlined, PushpinOutlined,
  EyeOutlined, MessageOutlined, UserOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { forumApi } from "@/api/forum";
import type { ThreadItem } from "@/types";
import { timeAgo } from "@/util/time";

const { Title } = Typography;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

const highlight = (text: string, query: string) => {
  if (!query) return escapeHtml(text);
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);
  return parts.map((p) =>
    regex.test(p)
      ? `<mark style="background:#fef08a;color:#854d0e;border-radius:2px;padding:0 2px">${escapeHtml(p)}</mark>`
      : escapeHtml(p)
  ).join("");
};

const ForumSearchPage: FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const query = searchParams.get("q") || "";
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(query);
  useEffect(() => { setSearchInput(query); }, [query]);

  const load = () => {
    if (!query) return;
    setLoading(true);
    forumApi.search(query, page).then((r) => {
      setThreads(r.items);
      setTotal(r.total);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [query, page]);

  const doSearch = (value: string) => {
    if (value.trim()) {
      navigate(`/forum/search?q=${encodeURIComponent(value.trim())}`);
      setPage(1);
    }
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto pt-8">
      {/* Header */}
      <div className="mb-5">
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/forum")}
          className="text-[#b8afa6] mb-3 p-0! font-500">
          返回论坛
        </Button>

        <div className="flex items-center gap-3">
          <div className="w-0.75 h-5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
          <Title level={3} className="m-0! text-[#3d3630] text-xl font-700">
            搜索
          </Title>
        </div>
      </div>

      {/* Search bar */}
      <div className="mb-6">
        <Input.Search
          size="large"
          placeholder="搜索帖子标题和内容..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onSearch={doSearch}
          className="max-w-[32rem] rounded-2.5"
        />
      </div>

      {/* Results */}
      {!query ? (
        <div className="text-center py-15 rounded-4 bg-white border border-solid border-[#e8e3dc] text-[#b8afa6]">
          <SearchOutlined className="text-8 mb-3 text-[#d4c8b8]" />
          <div>输入关键词搜索帖子</div>
        </div>
      ) : loading ? (
        <div className="text-center py-15"><Spin size="large" /></div>
      ) : (
        <>
          <div className="text-[0.8125rem] text-[#6b5e55] mb-3 py-2 border-b border-solid border-[#f0ede8]">
            找到 <b className="text-[#d4513b]">{total}</b> 条与 "<b>{query}</b>" 相关的结果
          </div>

          {threads.length === 0 ? (
            <Empty description="没有找到相关帖子" className="py-10" />
          ) : (
            <div className="flex flex-col gap-1">
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/forum/post/${t.id}`)}
                  className="flex items-center gap-3.5 p-3.5 px-4.5 rounded-3 cursor-pointer bg-white border border-solid border-[#e8e3dc] transition-all duration-150 hover:border-[#d4513b] hover:translate-x-0.5"
                >
                  <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)]">
                    <UserOutlined className="text-base text-[#b8afa6]" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      {t.is_pinned && <PushpinOutlined className="text-[#f59e0b] text-[0.6875rem]" />}
                      <span
                        className="font-600 text-[0.875rem] text-[#3d3630]"
                        dangerouslySetInnerHTML={{ __html: highlight(t.title || "无标题", query) }}
                      />
                    </div>
                    <div
                      className="text-[0.75rem] text-[#8a7e73] leading-relaxed mb-1"
                      dangerouslySetInnerHTML={{ __html: highlight(t.content.slice(0, 150), query) }}
                    />
                    <div className="flex items-center gap-4 text-[0.6875rem] text-[#b8afa6]">
                      <span><UserOutlined className="mr-0.5" />{t.author?.username || "匿名"}</span>
                      <span><ClockCircleOutlined className="mr-0.5" />{t.last_reply_at ? timeAgo(t.last_reply_at) : timeAgo(t.created_at)}</span>
                      <span><MessageOutlined className="mr-0.5" />{t.reply_count} 回复</span>
                    </div>
                  </div>

                  <div className="flex gap-3.5 text-[0.6875rem] text-[#c4bbb2] flex-shrink-0">
                    <span><EyeOutlined className="mr-0.5" />{t.view_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > 20 && (
            <div className="text-center mt-6">
              <Pagination current={page} total={total} pageSize={20} onChange={(p) => setPage(p)} size="small" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const page = "ForumSearchPage";
export default ForumSearchPage;
