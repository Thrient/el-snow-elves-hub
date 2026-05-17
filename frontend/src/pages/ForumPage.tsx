import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Spin, Empty, Input } from "antd";
import { MessageOutlined, RightOutlined, FileTextOutlined } from "@ant-design/icons";
import { forumApi, type ForumBoard } from "../api/forum";

const { Title } = Typography;

const ForumPage: FC = () => {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    forumApi.listBoards().then(setBoards).finally(() => setLoading(false));
  }, []);

  const handleSearch = (value: string) => {
    if (value.trim()) {
      navigate(`/forum/search?q=${encodeURIComponent(value.trim())}`);
    }
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
          <Title level={2} style={{ color: "#3d3630", margin: 0, fontSize: 22, fontWeight: 700 }}>社区论坛</Title>
        </div>
        <Input.Search
          placeholder="搜索帖子..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={handleSearch}
          style={{ width: 220, borderRadius: 8 }}
        />
      </div>

      {boards.length === 0 ? (
        <Empty description="暂无板块" style={{ padding: 60 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {boards.map((board) => (
            <div
              key={board.id}
              onClick={() => navigate(`/forum/${board.id}`)}
              style={{
                padding: "20px 24px", borderRadius: 14, cursor: "pointer",
                background: "#fff", border: "1px solid #e8e3dc",
                display: "flex", alignItems: "center", gap: 16,
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#d4513b";
                e.currentTarget.style.transform = "translateX(4px)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(212,81,59,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e8e3dc";
                e.currentTarget.style.transform = "translateX(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "linear-gradient(135deg, #fef3ef, #fdf6ef)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <MessageOutlined style={{ fontSize: 20, color: "#d4513b" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#3d3630", marginBottom: 4 }}>
                  {board.name}
                </div>
                <div style={{ fontSize: 12, color: "#b8afa6" }}>{board.description || ""}</div>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                fontSize: 12, color: "#b8afa6", flexShrink: 0,
              }}>
                <FileTextOutlined />
                <span>{board.thread_count}</span>
                <RightOutlined style={{ marginLeft: 4, fontSize: 10 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ForumPage;
