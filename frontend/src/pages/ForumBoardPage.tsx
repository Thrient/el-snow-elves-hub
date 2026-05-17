import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Typography, Spin, Pagination, Input } from "antd";
import {
  ArrowLeftOutlined, PlusOutlined, PushpinOutlined, LockOutlined,
  EyeOutlined, MessageOutlined, UserOutlined, ClockCircleOutlined,
} from "@ant-design/icons";
import { forumApi, type ThreadItem } from "../api/forum";
import { useAuthStore } from "../store/auth";

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

  const load = () => {
    if (!boardId) return;
    setLoading(true);
    Promise.all([
      forumApi.listThreads(Number(boardId), page),
      forumApi.listBoards(),
    ]).then(([data, boards]) => {
      setThreads(data.items);
      setTotal(data.total);
      setBoardName(boards.find((b) => b.id === Number(boardId))?.name || "");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [boardId, page]);

  const handleSearch = (value: string) => {
    if (value.trim()) {
      navigate(`/forum/search?q=${encodeURIComponent(value.trim())}`);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Button type="text" icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/forum")}
            style={{ color: "#b8afa6", padding: 0, fontWeight: 500 }} />
          <div style={{ width: 3, height: 20, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
          <Title level={3} style={{ margin: 0, color: "#3d3630", fontSize: 20, fontWeight: 700 }}>
            {boardName || "加载中..."}
          </Title>
          {!loading && (
            <span style={{ fontSize: 12, color: "#b8afa6", fontWeight: 400, marginLeft: 4 }}>{total} 帖</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Input.Search
            placeholder="搜索帖子..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 200, borderRadius: 8 }}
            size="middle"
          />
          {user && (
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => navigate(`/forum/create?board=${boardId}`)}
              style={{ borderRadius: 8 }}>
              发帖
            </Button>
          )}
        </div>
      </div>

      {/* Thread list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>
      ) : threads.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, borderRadius: 16,
          background: "#fff", border: "1px solid #e8e3dc",
        }}>
          <MessageOutlined style={{ fontSize: 36, color: "#d4c8b8", marginBottom: 12 }} />
          <div style={{ color: "#6b5e55", fontSize: 14, marginBottom: 4 }}>还没有帖子</div>
          <div style={{ color: "#b8afa6", fontSize: 12, marginBottom: 16 }}>成为第一个发帖的人</div>
          {user && (
            <Button type="primary" icon={<PlusOutlined />}
              onClick={() => navigate(`/forum/create?board=${boardId}`)}>
              发布新帖
            </Button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {threads.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/forum/post/${t.id}`)}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "14px 18px", borderRadius: 12, cursor: "pointer",
                background: t.is_pinned ? "linear-gradient(135deg, #fffdf7, #fffbf0)" : "#fff",
                border: t.is_pinned ? "1px solid #fef0c0" : "1px solid #e8e3dc",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#d4513b";
                e.currentTarget.style.transform = "translateX(2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = t.is_pinned ? "#fef0c0" : "#e8e3dc";
                e.currentTarget.style.transform = "translateX(0)";
              }}
            >
              {/* Author avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #f3f0ec, #e8e3dc)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid #f0ede8",
              }}>
                {t.author?.avatar_url ? (
                  <img src={t.author.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <UserOutlined style={{ fontSize: 18, color: "#b8afa6" }} />
                )}
              </div>

              {/* Main content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  {t.is_pinned && (
                    <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}><PushpinOutlined /> 置顶</span>
                  )}
                  {t.is_locked && (
                    <span style={{ fontSize: 11, color: "#b8afa6" }}><LockOutlined /> 已锁定</span>
                  )}
                  <span style={{
                    fontWeight: 600, fontSize: 15, color: "#3d3630",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    lineHeight: 1.4,
                  }}>
                    {t.title || "无标题"}
                  </span>
                </div>

                {/* First image thumbnail + excerpt */}
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{
                    fontSize: 13, color: "#8a7e73",
                    overflow: "hidden", textOverflow: "ellipsis",
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                    lineHeight: 1.5, flex: 1,
                  }}>
                    {t.content?.replace(/\n/g, " ").slice(0, 120) || ""}
                  </div>
                  {t.image_urls && t.image_urls.length > 0 && (
                    <div style={{
                      width: 60, height: 44, borderRadius: 6, overflow: "hidden",
                      flexShrink: 0, background: "#f3f0ec",
                    }}>
                      <img src={t.image_urls[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                </div>

                {/* Meta row */}
                <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "#b8afa6", marginTop: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <UserOutlined style={{ fontSize: 11 }} />
                    {t.author?.username || "匿名"}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <ClockCircleOutlined style={{ fontSize: 11 }} />
                    {t.last_reply_at ? timeAgo(t.last_reply_at) : timeAgo(t.created_at)}
                  </span>
                </div>
              </div>

              {/* Stats column */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                flexShrink: 0, minWidth: 52,
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  fontSize: 12, fontWeight: t.reply_count > 0 ? 600 : 400,
                  color: t.reply_count > 0 ? "#d4513b" : "#b8afa6",
                }}>
                  <MessageOutlined style={{ fontSize: 11 }} />
                  {t.reply_count}
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 3,
                  fontSize: 11, color: "#c4bbb2",
                }}>
                  <EyeOutlined style={{ fontSize: 11 }} />
                  {t.view_count}
                </div>
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
    </div>
  );
};

export default ForumBoardPage;
