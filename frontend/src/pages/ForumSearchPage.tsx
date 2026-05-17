import { useEffect, useState, type FC } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Input, Typography, Spin, Empty, Pagination, Button } from "antd";
import {
  ArrowLeftOutlined, SearchOutlined, PushpinOutlined,
  EyeOutlined, MessageOutlined, UserOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { forumApi, type ThreadItem } from "../api/forum";

const { Title } = Typography;

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(date).toLocaleDateString("zh-CN");
};

// Highlight matched text
const highlight = (text: string, query: string) => {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return parts.map((p, i) =>
    regex.test(p)
      ? `<mark key=${i} style="background:#fef08a;color:#854d0e;border-radius:2px;padding:0 2px">${p}</mark>`
      : p
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
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Button type="text" icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/forum")}
          style={{ color: "#b8afa6", marginBottom: 12, padding: 0, fontWeight: 500 }}>
          返回论坛
        </Button>

        <div style={{
          display: "flex", alignItems: "center", gap: 12, marginBottom: 4,
        }}>
          <div style={{ width: 3, height: 20, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
          <Title level={3} style={{ margin: 0, color: "#3d3630", fontSize: 20, fontWeight: 700 }}>
            搜索
          </Title>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 24 }}>
        <Input.Search
          size="large"
          placeholder="搜索帖子标题和内容..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onSearch={doSearch}
          style={{ maxWidth: 500, borderRadius: 10 }}
        />
      </div>

      {/* Results */}
      {!query ? (
        <div style={{
          textAlign: "center", padding: 60, borderRadius: 16,
          background: "#fff", border: "1px solid #e8e3dc",
          color: "#b8afa6",
        }}>
          <SearchOutlined style={{ fontSize: 32, marginBottom: 12, color: "#d4c8b8" }} />
          <div>输入关键词搜索帖子</div>
        </div>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : (
        <>
          <div style={{
            fontSize: 13, color: "#6b5e55", marginBottom: 12,
            padding: "8px 0", borderBottom: "1px solid #f0ede8",
          }}>
            找到 <b style={{ color: "#d4513b" }}>{total}</b> 条与 "<b>{query}</b>" 相关的结果
          </div>

          {threads.length === 0 ? (
            <Empty description="没有找到相关帖子" style={{ padding: 40 }} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {threads.map((t) => (
                <div
                  key={t.id}
                  onClick={() => navigate(`/forum/post/${t.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                    background: "#fff", border: "1px solid #e8e3dc",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#d4513b";
                    e.currentTarget.style.transform = "translateX(2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#e8e3dc";
                    e.currentTarget.style.transform = "translateX(0)";
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: "linear-gradient(135deg, #f3f0ec, #e8e3dc)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <UserOutlined style={{ fontSize: 16, color: "#b8afa6" }} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      {t.is_pinned && <PushpinOutlined style={{ color: "#f59e0b", fontSize: 11 }} />}
                      <span
                        style={{ fontWeight: 600, fontSize: 14, color: "#3d3630" }}
                        dangerouslySetInnerHTML={{ __html: highlight(t.title || "无标题", query) }}
                      />
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#8a7e73", lineHeight: 1.5, marginBottom: 4 }}
                      dangerouslySetInnerHTML={{
                        __html: highlight(t.content.slice(0, 150), query),
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 11, color: "#b8afa6" }}>
                      <span><UserOutlined style={{ marginRight: 2 }} />{t.author?.username || "匿名"}</span>
                      <span><ClockCircleOutlined style={{ marginRight: 2 }} />{t.last_reply_at ? timeAgo(t.last_reply_at) : timeAgo(t.created_at)}</span>
                      <span><MessageOutlined style={{ marginRight: 2 }} />{t.reply_count} 回复</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#c4bbb2", flexShrink: 0 }}>
                    <span><EyeOutlined style={{ marginRight: 2 }} />{t.view_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {total > 20 && (
            <div style={{ textAlign: "center", marginTop: 24 }}>
              <Pagination current={page} total={total} pageSize={20} onChange={(p) => setPage(p)} size="small" />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ForumSearchPage;
