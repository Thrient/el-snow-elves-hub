import { useEffect, useState, useCallback, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Input, Select, Row, Col, Typography, Button, Skeleton } from "antd";
import { SearchOutlined, PlusOutlined, FireOutlined, AppstoreOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import type { TaskItem, PageResult } from "@/types";
import { useAuthStore } from "@/store/auth";
import MarketCard from "@/pages/task/components/MarketCard";

const { Title } = Typography;
const CATEGORIES = ["全部", "综合"];

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
      const r = await taskApi.list({ search, category: category === "全部" ? "" : category, sort });
      setData(r);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [category, sort]);

  useEffect(() => { load(); }, [load]);

  const doSearch = () => load();

  return (
    <div className="pt-8">
      <style>{`
        @keyframes card-in {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="flex justify-between items-start mb-6 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-0.75 h-5.5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
            <Title level={2} className="m-0! text-[#3d3630] text-[1.375rem] font-700">
              任务市场
            </Title>
          </div>
          <div className="text-[0.8125rem] text-[#b8afa6] ml-3.75">
            浏览社区分享的脚本，下载后导入桌面端即可使用
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<FireOutlined />} onClick={() => navigate("/ranking")} className="rounded-2.5">
            排行榜
          </Button>
          {user && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/upload")} className="rounded-2.5">
              上传任务
            </Button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex gap-2.5 mb-6 flex-wrap items-center p-4 rounded-3.5 bg-white border border-solid border-[#e8e3dc]">
        <Input
          placeholder="搜索任务..."
          prefix={<SearchOutlined className="text-[#c4bbb2]" />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={doSearch}
          className="max-w-70 rounded-2"
          allowClear
          size="middle"
        />
        <Select value={category || "全部"} onChange={setCategory} className="w-22.5">
          {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
        </Select>
        <Select value={sort} onChange={setSort} className="w-27.5">
          <Select.Option value="latest">最新发布</Select.Option>
          <Select.Option value="downloads">下载最多</Select.Option>
          <Select.Option value="likes">点赞最多</Select.Option>
        </Select>
        {data && (
          <span className="ml-auto text-[0.75rem] text-[#b8afa6]">共 {data.total} 个任务</span>
        )}
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Col key={i} xs={24} sm={12} md={8} xl={6} xxl={4}>
              <div className="rounded-3.5 overflow-hidden bg-white border border-solid border-[#f0ede8]">
                <div
                  className="h-[9.4rem]"
                  style={{
                    background: "linear-gradient(90deg, #f0ede8 25%, #e8e3dc 50%, #f0ede8 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s infinite",
                  }}
                />
                <div className="px-3.5 py-3">
                  <Skeleton active paragraph={{ rows: 2 }} title={{ width: "60%" }} />
                </div>
              </div>
            </Col>
          ))}
        </Row>
      ) : !data || data.items.length === 0 ? (
        <div className="text-center py-20 rounded-4 bg-white border border-solid border-[#e8e3dc]">
          <AppstoreOutlined className="text-[2.5rem] text-[#d4c8b8] mb-4" />
          <div className="text-[0.9375rem] text-[#6b5e55] mb-1">暂无任务</div>
          <div className="text-[0.75rem] text-[#b8afa6] mb-5">成为第一个分享脚本的人</div>
          {user && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/upload")}>
              上传任务
            </Button>
          )}
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {data.items.map((task, idx) => (
            <Col key={task.id} xs={24} sm={12} md={8} xl={6} xxl={4}>
              <MarketCard task={task} index={idx} />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export const page = "MarketPage";
export default MarketPage;
