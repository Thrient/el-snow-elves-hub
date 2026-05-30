import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Row, Col, Tag, Typography, Spin, Button } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, CommentOutlined, CalendarOutlined, FileOutlined, ArrowLeftOutlined, AppstoreOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import type { TaskItem } from "@/types";

const { Title } = Typography;

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
    <div className="pt-8 w-[min(94%,75rem)] mx-auto">
      <style>{`@keyframes card-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
        className="text-[#b8afa6] mb-5 p-0! font-500">返回</Button>

      {/* Author card */}
      <div className="p-8 rounded-4.5 bg-white border border-solid border-[#e8e3dc] mb-7 flex items-center gap-5 flex-wrap">
        <div className="w-18 h-18 rounded-full flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#f5f0e8,#ebe4d8)] border-3 border-solid border-[#f0ede8]">
          <UserOutlined className="text-7.5 text-[#b8afa6]" />
        </div>
        <div className="flex-1 min-w-[12.5rem]">
          <Title level={3} className="m-0! mb-1 text-[#3d3630] font-700">{authorName}</Title>
          <div className="text-[0.8125rem] text-[#6b5e55] flex gap-1 items-center">
            <CalendarOutlined className="text-[#b8afa6]" /> <span>社区创作者</span>
          </div>
        </div>
        <div className="flex gap-8">
          <div className="text-center"><div className="text-6 font-700 text-[#3d3630]">{tasks.length}</div><div className="text-[0.6875rem] text-[#b8afa6] mt-0.5">发布任务</div></div>
          <div className="text-center"><div className="text-6 font-700 text-[#3d3630]">{totalDownloads.toLocaleString()}</div><div className="text-[0.6875rem] text-[#b8afa6] mt-0.5">总下载</div></div>
          <div className="text-center"><div className="text-6 font-700 text-[#3d3630]">{totalLikes.toLocaleString()}</div><div className="text-[0.6875rem] text-[#b8afa6] mt-0.5">总获赞</div></div>
        </div>
      </div>

      <div className="flex items-center gap-2.5 mb-5">
        <FileOutlined className="text-base text-[#d4513b]" />
        <Title level={4} className="m-0! text-[#3d3630] font-600">TA 的任务</Title>
      </div>

      {loading ? (
        <div className="text-center py-15"><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-15 rounded-4 bg-white border border-solid border-[#e8e3dc]">
          <AppstoreOutlined className="text-9 text-[#d4c8b8] mb-3" />
          <div className="text-[0.875rem] text-[#6b5e55] mb-1">暂无已发布的任务</div>
          <div className="text-[0.75rem] text-[#b8afa6]">该用户还没有上架的任务</div>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {tasks.map((task, idx) => (
            <Col key={task.id} xs={24} sm={12} lg={6}>
              <Card hoverable onClick={() => navigate(`/market/${task.id}`)}
                className="rounded-3.5 overflow-hidden border border-solid border-[#e8e3dc] transition-all duration-250 hover:-translate-y-1 hover:shadow-lg hover:border-[#d4513b]"
                style={{ animation: `card-in 0.4s ease-out ${idx * 0.04}s both` }}
                styles={{ body: { padding: "12px 14px" } }}
                cover={
                  task.cover_url ? (
                    <div className="h-[9.4rem] relative overflow-hidden bg-[#f3f0ec]">
                      <img src={task.cover_url} alt={task.title} loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-400 hover:scale-106" />
                      <div className="absolute bottom-0 left-0 right-0 h-12 bg-[linear-gradient(transparent,rgba(0,0,0,0.3))]" />
                    </div>
                  ) : (
                    <div className="h-[9.4rem] flex items-center justify-center bg-[linear-gradient(145deg,#f5f0e8,#ebe4d8)]">
                      <AppstoreOutlined className="text-9 text-[#d4c8b8]" />
                    </div>
                  )
                }>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Tag className="text-[0.625rem] leading-4.5 rounded-1 m-0! px-1.5 border-none text-[#d4513b] bg-[#fef3ef]">{task.category}</Tag>
                  <span className="text-[0.625rem] text-[#c4bbb2]">v{task.version}</span>
                </div>
                <div className="text-[0.8125rem] font-600 text-[#3d3630] mb-1 truncate">{task.title}</div>
                <div className="text-[0.6875rem] text-[#b8afa6] mb-2"><UserOutlined className="mr-1" />{task.author_name}</div>
                <div className="flex gap-3.5 text-[0.6875rem] text-[#b8afa6] pt-2 border-t border-solid border-[#f5f2ee]">
                  <span className="flex items-center gap-0.75"><DownloadOutlined /> {task.download_count.toLocaleString()}</span>
                  <span className={`flex items-center gap-0.75 ${task.liked ? "text-[#d4513b] font-500" : ""}`}><LikeOutlined /> {task.like_count.toLocaleString()}</span>
                  <span className="flex items-center gap-0.75"><CommentOutlined /> {task.comment_count.toLocaleString()}</span>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export const page = "AuthorPage";
export default AuthorPage;
