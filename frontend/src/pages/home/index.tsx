import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Row, Col, Typography, Skeleton } from "antd";
import { DownloadOutlined, AppstoreOutlined, UserOutlined, HeartOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem } from "@/api/tasks";

const { Title, Paragraph } = Typography;

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
      {/* ── Hero ── */}
      <div className="relative overflow-hidden mb-32 bg-white" style={{ boxShadow: "0 1px 0 #e8e3dc, 0 -1px 0 #e8e3dc" }}>
        {/* Decorative vermilion seal */}
        <div className="absolute right--8 top--12 w-72 h-72 rounded-full animate-breathe bg-[radial-gradient(circle,rgba(196,58,42,0.04)_0%,transparent_65%)] pointer-events-none" />

        <div className="relative z-1 max-w-280 mx-auto px-10 py-24">
          <div className="flex items-center gap-3 mb-8 animate-rise-in">
            <div className="w-6 h-0.5 bg-[#c43a2a]" />
            <span className="text-11px tracking-5 text-[#c43a2a] uppercase font-600">Creative Workshop</span>
          </div>

          <Title
            level={1}
            className="animate-rise-in stagger-2 text-16 font-800 text-[#1a1a1a] mb-6 tracking-tight leading-none"
            style={{ fontSize: 64 }}
          >
            时雪<span className="text-[#c43a2a]">·</span>创意工坊
          </Title>

          <Paragraph className="animate-rise-in stagger-3 text-4.5 text-[#8c8078] max-w-160 mb-12 leading-relaxed font-400">
            任务编排 + 模板匹配 + 任务市场。可视化编辑脚本流程，
            社区下载配置，定时全自动运行。
          </Paragraph>

          <div className="flex gap-3 animate-rise-in stagger-4">
            <Button
              type="primary" size="large"
              icon={<DownloadOutlined />}
              onClick={() => navigate("/download")}
              className="h-11 px-7 text-14px font-600 border-none tracking-wide"
              style={{ borderRadius: 2, background: "#c43a2a" }}
            >
              立即下载
            </Button>
            <Button
              size="large"
              icon={<AppstoreOutlined />}
              onClick={() => navigate("/market")}
              className="h-11 px-7 text-14px font-500 text-[#5c5046] tracking-wide"
              style={{ borderRadius: 2, borderColor: "#d9cfc4" }}
            >
              浏览任务市场
            </Button>
          </div>
        </div>
      </div>

      {/* ── Hot Tasks ── */}
      <div className="max-w-280 mx-auto px-10 mb-32">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-[#c43a2a]" style={{ borderRadius: 1 }} />
            <Title level={3} className="m-0! text-[#1a1a1a] text-5 font-700 tracking-tight">
              热门任务
            </Title>
          </div>
          <Button
            type="text"
            onClick={() => navigate("/ranking")}
            className="text-[#c43a2a] font-500 text-13px flex items-center gap-1"
          >
            查看排行榜 <ArrowRightOutlined className="text-11px" />
          </Button>
        </div>

        {loading ? (
          <Row gutter={[20, 20]}>
            {[1, 2, 3, 4].map((i) => (
              <Col key={i} xs={24} sm={12} lg={6}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[20, 20]}>
            {hotTasks.map((task, idx) => (
              <Col key={task.id} xs={24} sm={12} lg={6}>
                <div
                  onClick={() => navigate(`/market/${task.id}`)}
                  className="overflow-hidden cursor-pointer bg-white card-hover"
                  style={{ borderRadius: 4 }}
                >
                  <div
                    className="h-35 relative overflow-hidden bg-[#f5f2ee]"
                    style={{ borderRadius: "4px 4px 0 0" }}
                  >
                    {task.cover_url ? (
                      <img src={task.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AppstoreOutlined className="text-8 text-[#d4c8b8]" />
                      </div>
                    )}
                    <div
                      className={`absolute top-2 left-2 w-6 h-6 flex items-center justify-center text-white text-11px font-700 badge-${["gold", "silver", "bronze", "default"][Math.min(idx, 3)]}`}
                      style={{ borderRadius: 3 }}
                    >
                      {idx + 1}
                    </div>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="text-13px font-600 text-[#1a1a1a] truncate mb-2">
                      {task.title}
                    </div>
                    <div className="flex items-center gap-3 text-11px text-[#8c8078]">
                      <span className="flex items-center gap-1"><UserOutlined />{task.author_name}</span>
                      <span className="flex items-center gap-1"><DownloadOutlined />{task.download_count.toLocaleString()}</span>
                      <span className="flex items-center gap-1"><HeartOutlined />{task.like_count.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </div>
    </div>
  );
};

export default HomePage;
