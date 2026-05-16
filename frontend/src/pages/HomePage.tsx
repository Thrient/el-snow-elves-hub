import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Row, Col, Typography, Skeleton } from "antd";
import { DownloadOutlined, AppstoreOutlined, ThunderboltOutlined, FireOutlined, TrophyOutlined, UserOutlined, HeartOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem } from "../api/tasks";

const { Title, Paragraph } = Typography;

const heroKeyframes = `
@keyframes float-blob {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -20px) scale(1.05); }
  66% { transform: translate(-20px, 10px) scale(0.95); }
}
@keyframes float-blob2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-20px, 30px) scale(1.08); }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes scroll-hint {
  0%, 100% { transform: translateY(0); opacity: 0.4; }
  50% { transform: translateY(8px); opacity: 0.8; }
}
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

const HomePage: FC = () => {
  const navigate = useNavigate();
  const [hotTasks, setHotTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    taskApi.list({ sort: "downloads", size: 4 })
      .then((r) => setHotTasks(r.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <style>{heroKeyframes}</style>

      {/* ── Hero ── */}
      <div style={{
        position: "relative", overflow: "hidden",
        borderRadius: 24, marginBottom: 40,
        background: "linear-gradient(165deg, #fef8f0 0%, #faf5ed 30%, #f7f0e6 60%, #fdf6ef 100%)",
        border: "1px solid #e8e0d5",
        padding: "80px 40px 64px",
        textAlign: "center",
      }}>
        {/* Animated background blobs */}
        <div style={{
          position: "absolute", top: -60, left: "10%",
          width: 260, height: 260, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,81,59,0.06) 0%, transparent 70%)",
          animation: "float-blob 8s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", bottom: -40, right: "5%",
          width: 200, height: 200, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(180,130,80,0.05) 0%, transparent 70%)",
          animation: "float-blob2 10s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: "30%", right: "15%",
          width: 120, height: 120, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,81,59,0.04) 0%, transparent 70%)",
          animation: "float-blob 7s ease-in-out 2s infinite",
        }} />

        {/* Grain texture overlay */}
        <div style={{
          position: "absolute", inset: 0, opacity: 0.03,
          backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
          pointerEvents: "none",
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Subtitle above main title */}
          <div style={{
            animation: "fade-up 0.6s ease-out both",
            fontSize: 13, letterSpacing: 6, color: "#d4513b",
            textTransform: "uppercase", marginBottom: 16, fontWeight: 500,
          }}>
            一梦江湖 · 创意工坊
          </div>

          <Title level={1} style={{
            fontSize: 56, fontWeight: 800, color: "#3d3630",
            marginBottom: 20, letterSpacing: 2,
            animation: "fade-up 0.6s ease-out 0.1s both",
            lineHeight: 1.3,
          }}>
            时雪
            <span style={{
              background: "linear-gradient(135deg, #d4513b 0%, #e87a5a 50%, #c4402a 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            }}>创意工坊</span>
          </Title>

          <Paragraph style={{
            fontSize: 17, color: "#6b5e55", maxWidth: 520, margin: "0 auto 40px",
            animation: "fade-up 0.6s ease-out 0.2s both",
            lineHeight: 1.8,
          }}>
            一梦江湖自动化脚本平台。录制回放、智能匹配、任务市场，
            与千万玩家一起打造更高效的江湖体验。
          </Paragraph>

          <div style={{
            display: "flex", gap: 16, justifyContent: "center",
            animation: "fade-up 0.6s ease-out 0.3s both",
          }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              onClick={() => navigate("/download")}
              style={{
                height: 48, borderRadius: 12, padding: "0 32px",
                fontSize: 15, fontWeight: 600,
                background: "linear-gradient(135deg, #d4513b, #c4402a)",
                border: "none", boxShadow: "0 4px 20px rgba(212,81,59,0.3)",
              }}
            >
              立即下载
            </Button>
            <Button
              size="large"
              icon={<AppstoreOutlined />}
              onClick={() => navigate("/market")}
              style={{
                height: 48, borderRadius: 12, padding: "0 32px",
                fontSize: 15, fontWeight: 500,
                borderColor: "#d9cfc4", color: "#5c5046",
              }}
            >
              浏览任务市场
            </Button>
          </div>

          {/* Stats row */}
          <div style={{
            display: "flex", justifyContent: "center", gap: 48, marginTop: 56,
            animation: "fade-up 0.6s ease-out 0.4s both",
          }}>
            {[
              { value: "200+", label: "任务脚本" },
              { value: "10,000+", label: "总下载" },
              { value: "1,500+", label: "社区成员" },
            ].map((s) => (
              <div key={s.label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#3d3630", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "#b8afa6", marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Hot Tasks ── */}
      <div style={{
        marginBottom: 40,
        animation: "fade-up 0.6s ease-out 0.5s both",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <FireOutlined style={{ fontSize: 18, color: "#d4513b" }} />
            <Title level={3} style={{ margin: 0, color: "#3d3630", fontSize: 20, fontWeight: 600 }}>热门任务</Title>
          </div>
          <Button type="text" onClick={() => navigate("/ranking")} style={{ color: "#d4513b", fontWeight: 500 }}>
            查看排行榜 <ArrowRightOutlined />
          </Button>
        </div>

        {loading ? (
          <Row gutter={[16, 16]}>
            {[1, 2, 3, 4].map((i) => (
              <Col key={i} xs={24} sm={12} lg={6}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[16, 16]}>
            {hotTasks.map((task, idx) => (
              <Col key={task.id} xs={24} sm={12} lg={6}>
                <div
                  onClick={() => navigate(`/market/${task.id}`)}
                  style={{
                    borderRadius: 14, overflow: "hidden", cursor: "pointer",
                    background: "#fff", border: "1px solid #e8e3dc",
                    transition: "all 0.25s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.08)";
                    e.currentTarget.style.borderColor = "#d4513b";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                    e.currentTarget.style.borderColor = "#e8e3dc";
                  }}
                >
                  {/* Cover */}
                  <div style={{
                    height: 140, position: "relative", overflow: "hidden",
                    background: task.cover_url
                      ? `url(${task.cover_url}) center/cover`
                      : "linear-gradient(135deg, #f5f0e8, #ebe4d8)",
                  }}>
                    {!task.cover_url && (
                      <div style={{
                        position: "absolute", inset: 0, display: "flex",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <AppstoreOutlined style={{ fontSize: 36, color: "#d4c8b8" }} />
                      </div>
                    )}
                    {/* Rank badge */}
                    <div style={{
                      position: "absolute", top: 8, left: 8,
                      width: 28, height: 28, borderRadius: 8,
                      background: idx === 0 ? "linear-gradient(135deg, #f59e0b, #d97706)"
                        : idx === 1 ? "linear-gradient(135deg, #94a3b8, #64748b)"
                        : idx === 2 ? "linear-gradient(135deg, #d6a156, #b87c2c)"
                        : "rgba(0,0,0,0.5)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontSize: 12, fontWeight: 700,
                    }}>
                      {idx + 1}
                    </div>
                  </div>

                  <div style={{ padding: "12px 14px" }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: "#3d3630",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      marginBottom: 6,
                    }}>{task.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "#b8afa6" }}>
                      <span><UserOutlined style={{ marginRight: 2 }} />{task.author_name}</span>
                      <span><DownloadOutlined style={{ marginRight: 2 }} />{task.download_count.toLocaleString()}</span>
                      <span><HeartOutlined style={{ marginRight: 2 }} />{task.like_count.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* ── Features ── */}
      <Row gutter={[20, 20]} style={{ marginBottom: 40 }}>
        {[
          {
            icon: <ThunderboltOutlined style={{ fontSize: 28 }} />,
            title: "智能脚本引擎",
            desc: "录制回放、模板匹配、流程编排，让日常任务自动化运行",
            color: "#d4513b",
          },
          {
            icon: <AppstoreOutlined style={{ fontSize: 28 }} />,
            title: "任务市场",
            desc: "分享你的脚本配置，下载社区精品，共建高效采集生态",
            color: "#e87a5a",
          },
          {
            icon: <TrophyOutlined style={{ fontSize: 28 }} />,
            title: "永远免费",
            desc: "核心功能永久免费，持续更新维护，社区驱动开发",
            color: "#c49a6c",
          },
        ].map((f, i) => (
          <Col key={i} xs={24} md={8}>
            <div style={{
              padding: "28px 24px", borderRadius: 16,
              background: "#fff", border: "1px solid #e8e3dc",
              height: "100%",
              animation: `fade-up 0.5s ease-out ${0.6 + i * 0.1}s both`,
              transition: "box-shadow 0.2s, border-color 0.2s",
            }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#d4513b";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(212,81,59,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#e8e3dc";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14,
                background: `${f.color}10`, display: "flex",
                alignItems: "center", justifyContent: "center",
                marginBottom: 16, color: f.color,
              }}>
                {f.icon}
              </div>
              <Title level={5} style={{ color: "#3d3630", marginBottom: 8 }}>{f.title}</Title>
              <div style={{ fontSize: 13, color: "#6b5e55", lineHeight: 1.7 }}>{f.desc}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* ── Bottom CTA ── */}
      <div style={{
        textAlign: "center", padding: "48px 24px", borderRadius: 20,
        background: "linear-gradient(165deg, #fef8f0, #faf5ed)",
        border: "1px solid #e8e0d5",
        animation: "fade-up 0.6s ease-out 0.8s both",
      }}>
        <Title level={3} style={{ color: "#3d3630", marginBottom: 12, fontWeight: 600 }}>
          准备好开始了吗？
        </Title>
        <Paragraph style={{ color: "#6b5e55", fontSize: 15, marginBottom: 28 }}>
          加入成千上万正在使用时雪提升效率的玩家
        </Paragraph>
        <Button
          type="primary"
          size="large"
          icon={<DownloadOutlined />}
          onClick={() => navigate("/download")}
          style={{
            height: 48, borderRadius: 12, padding: "0 36px",
            fontSize: 15, fontWeight: 600,
            background: "linear-gradient(135deg, #d4513b, #c4402a)",
            border: "none", boxShadow: "0 4px 20px rgba(212,81,59,0.3)",
          }}
        >
          免费下载
        </Button>
      </div>
    </div>
  );
};

export default HomePage;
