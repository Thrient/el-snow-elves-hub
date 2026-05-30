import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Row, Col, Typography, Skeleton } from "antd";
import { DownloadOutlined, AppstoreOutlined, UserOutlined, HeartOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import type { TaskItem } from "@/types";

const { Title } = Typography;

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
      <section className="relative pt-24 pb-4 mb-28 text-center">
        <div className="animate-rise-in flex justify-center mb-14">
          <div className="w-[0.65rem] h-[0.65rem] bg-[#c43a2a] rotate-45" />
        </div>

        <p className="animate-rise-in stagger-1 text-[0.7rem] tracking-0.3em text-[#8c8078] uppercase font-500 mb-6">
          Creative Workshop
        </p>

        <h1 className="animate-rise-in stagger-2 font-800 text-[#1a1a1a] leading-none tracking-tight m-0 mb-8 text-[clamp(3.5rem,6vw,8rem)]">
          时雪<span className="text-[#c43a2a]">·</span>创意工坊
        </h1>

        <p className="animate-rise-in stagger-3 text-[#8c8078] max-w-[42rem] mx-auto leading-relaxed mb-10 font-400 text-[clamp(0.9rem,1.2vw,1.15rem)]">
          任务编排 + 模板匹配 + 任务市场。可视化编辑脚本流程，
          社区下载配置，定时全自动运行。
        </p>

        <div className="flex justify-center gap-3 animate-rise-in stagger-4">
          <Button
            type="primary"
            size="large"
            icon={<DownloadOutlined />}
            onClick={() => navigate("/download")}
            className="h-[2.75rem] px-7 text-[0.875rem] font-600 border-none tracking-wide"
            style={{ borderRadius: "0.125rem", background: "#c43a2a" }}
          >
            立即下载
          </Button>
          <Button
            size="large"
            icon={<AppstoreOutlined />}
            onClick={() => navigate("/market")}
            className="h-[2.75rem] px-7 text-[0.875rem] font-500 tracking-wide"
            style={{ borderRadius: "0.125rem", borderColor: "#d4c8bc", color: "#5c5046" }}
          >
            浏览任务市场
          </Button>
        </div>
      </section>

      {/* ── Hot Tasks ── */}
      <section className="w-[88%] mx-auto mb-32">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-[1.25rem] h-[0.125rem] bg-[#c43a2a]" />
            <Title level={3} className="m-0! text-[#1a1a1a] text-5 font-700 tracking-tight">
              热门任务
            </Title>
          </div>
          <Button
            type="text"
            onClick={() => navigate("/ranking")}
            className="text-[#c43a2a] font-500 text-[0.8125rem] flex items-center gap-1"
          >
            查看排行榜 <ArrowRightOutlined className="text-[0.7rem]" />
          </Button>
        </div>

        {loading ? (
          <Row gutter={[24, 24]}>
            {[1, 2, 3, 4].map((i) => (
              <Col key={i} xs={24} sm={12} md={6} xl={4} xxl={3}>
                <Skeleton active paragraph={{ rows: 3 }} />
              </Col>
            ))}
          </Row>
        ) : (
          <Row gutter={[24, 24]}>
            {hotTasks.map((task, idx) => (
              <Col key={task.id} xs={24} sm={12} md={8} xl={6} xxl={4}>
                <div
                  onClick={() => navigate(`/market/${task.id}`)}
                  className="overflow-hidden cursor-pointer bg-white border border-solid border-[#e8e0d5] card-hover"
                  style={{ borderRadius: "0.375rem" }}
                >
                  <div className="h-[9rem] relative overflow-hidden bg-[#f5f2ee]">
                    {task.cover_url ? (
                      <img src={task.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AppstoreOutlined className="text-8 text-[#d4c8b8]" />
                      </div>
                    )}
                    <span
                      className="absolute top-2.5 left-2.5 text-[0.7rem] font-700 text-white w-[1.4rem] h-[1.4rem] flex items-center justify-center"
                      style={{
                        borderRadius: "0.2rem",
                        background: idx === 0 ? "#c43a2a" : idx === 1 ? "#b87c2c" : idx === 2 ? "#64748b" : "rgba(0,0,0,0.45)",
                      }}
                    >
                      {idx + 1}
                    </span>
                  </div>

                  <div className="px-4 py-3.5">
                    <div className="text-[0.8125rem] font-600 text-[#1a1a1a] truncate mb-2">
                      {task.title}
                    </div>
                    <div className="flex items-center gap-3.5 text-[0.7rem] text-[#8c8078]">
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
      </section>
    </div>
  );
};

export const page = "HomePage";
export default HomePage;
