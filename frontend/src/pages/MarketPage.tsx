import { useEffect, useState, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Input, Select, Row, Col, Tag, Typography, Button, Skeleton } from "antd";
import { SearchOutlined, DownloadOutlined, LikeOutlined, CommentOutlined, UserOutlined, PlusOutlined, FireOutlined, AppstoreOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem, type PageResult } from "../api/tasks";
import { useAuthStore } from "../store/auth";

const { Title } = Typography;
const CATEGORIES = ["全部", "综合"];

const animKeyframes = `
@keyframes card-in {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

const MarketPage: FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState<PageResult<TaskItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("latest");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await taskApi.list({
        search, category: category === "全部" ? "" : category, sort,
      });
      setData(r);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [category, sort]);

  useEffect(() => { load(); }, [load]);

  const doSearch = () => load();

  return (
    <div>
      <style>{animKeyframes}</style>

      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: 24, flexWrap: "wrap", gap: 16,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #d4513b, #e87a5a)" }} />
            <Title level={2} style={{ color: "#3d3630", margin: 0, fontSize: 22, fontWeight: 700 }}>
              任务市场
            </Title>
          </div>
          <div style={{ fontSize: 13, color: "#b8afa6", marginLeft: 15 }}>
            浏览社区分享的脚本，下载后导入桌面端即可使用
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button icon={<FireOutlined />} onClick={() => navigate("/ranking")} style={{ borderRadius: 10 }}>
            排行榜
          </Button>
          {user && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/upload")} style={{ borderRadius: 10 }}>
              上传任务
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap",
        padding: "16px 18px", borderRadius: 14, background: "#fff",
        border: "1px solid #e8e3dc", alignItems: "center",
      }}>
        <Input
          placeholder="搜索任务..."
          prefix={<SearchOutlined style={{ color: "#c4bbb2" }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={doSearch}
          style={{ maxWidth: 280, borderRadius: 8 }}
          allowClear
          size="middle"
        />
        <Select value={category || "全部"} onChange={setCategory} style={{ width: 90 }}>
          {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
        </Select>
        <Select value={sort} onChange={setSort} style={{ width: 110 }}>
          <Select.Option value="latest">最新发布</Select.Option>
          <Select.Option value="downloads">下载最多</Select.Option>
          <Select.Option value="likes">点赞最多</Select.Option>
        </Select>
        {data && (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#b8afa6" }}>
            共 {data.total} 个任务
          </span>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} lg={6}>
              <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff", border: "1px solid #f0ede8" }}>
                <div style={{
                  height: 150,
                  background: "linear-gradient(90deg, #f0ede8 25%, #e8e3dc 50%, #f0ede8 75%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s infinite",
                }} />
                <div style={{ padding: "12px 14px" }}>
                  <Skeleton active paragraph={{ rows: 2 }} title={{ width: "60%" }} />
                </div>
              </div>
            </Col>
          ))}
        </Row>
      ) : !data || data.items.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 80, borderRadius: 16,
          background: "#fff", border: "1px solid #e8e3dc",
        }}>
          <AppstoreOutlined style={{ fontSize: 40, color: "#d4c8b8", marginBottom: 16 }} />
          <div style={{ fontSize: 15, color: "#6b5e55", marginBottom: 4 }}>暂无任务</div>
          <div style={{ fontSize: 12, color: "#b8afa6", marginBottom: 20 }}>成为第一个分享脚本的人</div>
          {user && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/upload")}>
              上传任务
            </Button>
          )}
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {data.items.map((task, idx) => (
            <Col key={task.id} xs={24} sm={12} lg={6}>
              <Card
                hoverable
                onClick={() => navigate(`/market/${task.id}`)}
                style={{
                  borderRadius: 14, overflow: "hidden",
                  border: "1px solid #e8e3dc",
                  animation: `card-in 0.4s ease-out ${idx * 0.04}s both`,
                  transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
                }}
                styles={{ body: { padding: "12px 14px" } }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(-4px)";
                  el.style.boxShadow = "0 12px 32px rgba(0,0,0,0.08)";
                  el.style.borderColor = "#d4513b";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.transform = "translateY(0)";
                  el.style.boxShadow = "none";
                  el.style.borderColor = "#e8e3dc";
                }}
                cover={
                  task.cover_url ? (
                    <div style={{ height: 150, overflow: "hidden", position: "relative", background: "#f3f0ec" }}>
                      <img
                        src={task.cover_url}
                        alt={task.title}
                        loading="lazy"
                        style={{
                          width: "100%", height: "100%", objectFit: "cover",
                          transition: "transform 0.4s ease",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.06)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                      />
                      <div style={{
                        position: "absolute", bottom: 0, left: 0, right: 0,
                        height: 50, background: "linear-gradient(transparent, rgba(0,0,0,0.3))",
                      }} />
                    </div>
                  ) : (
                    <div style={{
                      height: 150, position: "relative",
                      background: "linear-gradient(145deg, #f5f0e8, #ebe4d8)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <AppstoreOutlined style={{ fontSize: 36, color: "#d4c8b8" }} />
                    </div>
                  )
                }
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <Tag style={{
                    fontSize: 10, lineHeight: "18px", borderRadius: 4, margin: 0,
                    padding: "0 6px", background: "#fef3ef", color: "#d4513b", border: "none",
                  }}>
                    {task.category}
                  </Tag>
                  <span style={{ fontSize: 10, color: "#c4bbb2" }}>v{task.version}</span>
                </div>

                <div style={{
                  fontSize: 13, fontWeight: 600, color: "#3d3630", marginBottom: 4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {task.title}
                </div>

                <div style={{ fontSize: 11, color: "#b8afa6", marginBottom: 8 }}>
                  <UserOutlined style={{ marginRight: 4 }} />{task.author_name}
                </div>

                <div style={{
                  display: "flex", gap: 14, fontSize: 11, color: "#b8afa6",
                  paddingTop: 8, borderTop: "1px solid #f5f2ee",
                }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <DownloadOutlined /> {task.download_count.toLocaleString()}
                  </span>
                  <span style={{
                    display: "flex", alignItems: "center", gap: 3,
                    color: task.liked ? "#d4513b" : undefined,
                    fontWeight: task.liked ? 500 : undefined,
                  }}>
                    <LikeOutlined /> {task.like_count.toLocaleString()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <CommentOutlined /> {task.comment_count.toLocaleString()}
                  </span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default MarketPage;
