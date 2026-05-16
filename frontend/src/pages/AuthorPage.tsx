import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Row, Col, Tag, Typography, Spin, Button } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, CalendarOutlined, FileOutlined, ArrowLeftOutlined, AppstoreOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem } from "../api/tasks";

const { Title } = Typography;

const animKeyframes = `
@keyframes card-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

const AuthorPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    taskApi.userTasks(Number(id)).then(setTasks).finally(() => setLoading(false));
  }, [id]);

  const authorName = tasks[0]?.author_name || "作者";
  const totalDownloads = tasks.reduce((s, t) => s + t.download_count, 0);
  const totalLikes = tasks.reduce((s, t) => s + t.like_count, 0);

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <style>{animKeyframes}</style>

      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
        style={{ color: "#b8afa6", marginBottom: 20, padding: 0, fontWeight: 500 }}>
        返回
      </Button>

      {/* Author card */}
      <div style={{
        padding: 32, borderRadius: 18, background: "#fff",
        border: "1px solid #e8e3dc", marginBottom: 28,
        display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap",
      }}>
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "linear-gradient(135deg, #f5f0e8, #ebe4d8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, border: "3px solid #f0ede8",
        }}>
          <UserOutlined style={{ fontSize: 30, color: "#b8afa6" }} />
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <Title level={3} style={{ margin: "0 0 4px", color: "#3d3630", fontWeight: 700 }}>{authorName}</Title>
          <div style={{ fontSize: 13, color: "#6b5e55", display: "flex", gap: 4, alignItems: "center" }}>
            <CalendarOutlined style={{ color: "#b8afa6" }} />
            <span>社区创作者</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#3d3630" }}>{tasks.length}</div>
            <div style={{ fontSize: 11, color: "#b8afa6", marginTop: 2 }}>发布任务</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#3d3630" }}>{totalDownloads.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#b8afa6", marginTop: 2 }}>总下载</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#3d3630" }}>{totalLikes.toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#b8afa6", marginTop: 2 }}>总获赞</div>
          </div>
        </div>
      </div>

      {/* Tasks heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <FileOutlined style={{ fontSize: 16, color: "#d4513b" }} />
        <Title level={4} style={{ margin: 0, color: "#3d3630", fontWeight: 600 }}>TA 的任务</Title>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 60, borderRadius: 16,
          background: "#fff", border: "1px solid #e8e3dc",
        }}>
          <AppstoreOutlined style={{ fontSize: 36, color: "#d4c8b8", marginBottom: 12 }} />
          <div style={{ color: "#6b5e55", fontSize: 14, marginBottom: 4 }}>暂无已发布的任务</div>
          <div style={{ color: "#b8afa6", fontSize: 12 }}>该用户还没有上架的任务</div>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {tasks.map((task, idx) => (
            <Col key={task.id} xs={24} sm={12} lg={6}>
              <Card
                hoverable
                onClick={() => navigate(`/market/${task.id}`)}
                style={{
                  borderRadius: 14, overflow: "hidden",
                  border: "1px solid #e8e3dc",
                  animation: `card-in 0.35s ease-out ${idx * 0.05}s both`,
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
                styles={{ body: { padding: "12px 14px" } }}
                cover={
                  task.cover_url ? (
                    <div style={{ height: 130, overflow: "hidden" }}>
                      <img src={task.cover_url} alt={task.title} loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{
                      height: 130, background: "linear-gradient(135deg, #f5f0e8, #ebe4d8)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <AppstoreOutlined style={{ fontSize: 28, color: "#d4c8b8" }} />
                    </div>
                  )
                }
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-3px)";
                  e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.07)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Tag style={{
                  marginBottom: 6, fontSize: 10, background: "#fef3ef",
                  color: "#d4513b", border: "none", borderRadius: 4,
                }}>
                  {task.category}
                </Tag>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#3d3630", marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.title}
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#b8afa6" }}>
                  <span><DownloadOutlined /> {task.download_count.toLocaleString()}</span>
                  <span><LikeOutlined /> {task.like_count.toLocaleString()}</span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default AuthorPage;
