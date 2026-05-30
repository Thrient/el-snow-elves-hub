import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Tag, Input, message, Empty, Typography, Spin, Popconfirm } from "antd";
import { DownloadOutlined, LikeOutlined, LikeFilled, UserOutlined, ArrowLeftOutlined, CommentOutlined, SendOutlined, CalendarOutlined, FileOutlined, DeleteOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import type { TaskItem, CommentItem } from "@/types";
import { useAuthStore } from "@/store/auth";

const { Title, Paragraph } = Typography;

const TaskDetailPage: FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [task, setTask] = useState<TaskItem | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try { const t = await taskApi.get(Number(id)); setTask(t); setComments(await taskApi.comments(Number(id))); }
    catch { message.error("加载失败"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [id]);

  const handleLike = async () => {
    if (!user) return message.warning("请先登录");
    if (!task) return;
    const result = await taskApi.like(task.id);
    setTask({ ...task, liked: result.liked, like_count: result.like_count });
  };

  const handleComment = async () => {
    if (!user) return message.warning("请先登录");
    if (!commentText.trim() || !task) return;
    await taskApi.addComment(task.id, commentText.trim());
    setCommentText(""); message.success("评论已发布"); load();
  };

  const handleDelete = async () => {
    if (!task) return;
    await taskApi.delete(task.id);
    message.success("任务已删除"); navigate("/market");
  };

  if (loading) return <div className="text-center py-30"><Spin size="large" /></div>;
  if (!task) return <Empty className="py-20" description="任务不存在" />;

  return (
    <div className="pt-8 w-[min(92%,58rem)] mx-auto">
      <style>{`@keyframes slide-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/market")}
        className="text-[#b8afa6] mb-5 p-0! font-500">返回市场</Button>

      {/* Cover */}
      <div className="rounded-4.5 overflow-hidden mb-7 flex items-center justify-center border border-solid border-[#e8e3dc]"
        style={{
          maxHeight: 420,
          background: task.cover_url ? undefined : "linear-gradient(145deg, #f5f0e8, #ebe4d8)",
          animation: "slide-up 0.5s ease-out both",
        }}>
        {task.cover_url ? (
          <img src={task.cover_url} alt={task.title} className="w-full object-cover" style={{ maxHeight: 420 }} />
        ) : (
          <DownloadOutlined className="text-[3.5rem] text-[#d4c8b8] py-20" />
        )}
      </div>

      <div className="flex gap-6 flex-wrap">
        {/* Main */}
        <div className="flex-1 min-w-[18.75rem]" style={{ animation: "slide-up 0.5s ease-out 0.1s both" }}>
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <Tag className="rounded-1 bg-[#fef3ef] text-[#d4513b] border-none font-500">{task.category}</Tag>
            {task.tags?.split(",").map((t) => (
              <Tag key={t} className="rounded-1 bg-[#f5f2ee] text-[#6b5e55] border border-solid border-[#e8e3dc]">{t.trim()}</Tag>
            ))}
          </div>

          <Title level={3} className="text-[#3d3630]! mb-2 font-700">{task.title}</Title>

          <div className="flex gap-4 flex-wrap mb-4 text-[0.75rem] text-[#b8afa6]">
            <span><CalendarOutlined className="mr-1" />{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
            {task.file_size ? <span><FileOutlined className="mr-1" />{(task.file_size / 1024).toFixed(0)} KB</span> : null}
            <span>v{task.version}</span>
          </div>

          <Paragraph className="text-[#6b5e55]! text-[0.875rem] leading-7 mb-6 whitespace-pre-line">
            {task.description || "暂无描述"}
          </Paragraph>

          <div className="flex gap-3 mb-10 flex-wrap">
            <Button type="primary" size="large" icon={<DownloadOutlined />}
              href={taskApi.download(task.id)} target="_blank"
              className="rounded-3 h-11 px-7 font-600 border-none"
              style={{ background: "linear-gradient(135deg, #d4513b, #c4402a)", boxShadow: "0 4px 16px rgba(212,81,59,0.3)" }}>
              下载 ({task.download_count.toLocaleString()})
            </Button>
            <Button size="large" className="rounded-3 h-11 px-6 font-500"
              icon={task.liked ? <LikeFilled className="text-[#d4513b]" /> : <LikeOutlined />}
              onClick={handleLike}>
              {task.liked ? "已点赞" : "点赞"} ({task.like_count.toLocaleString()})
            </Button>
            {user?.id === task.author_id && (
              <Popconfirm title="确定删除此任务？" description="删除后无法恢复"
                onConfirm={handleDelete} okText="删除" cancelText="取消" okButtonProps={{ danger: true }}>
                <Button size="large" icon={<DeleteOutlined />} className="rounded-3 h-11 px-6 font-500">删除</Button>
              </Popconfirm>
            )}
          </div>

          {/* Comments */}
          <div className="border-t border-solid border-[#e8e3dc] pt-7">
            <Title level={4} className="text-[#3d3630]! mb-5 font-600"><CommentOutlined /> 评论 ({comments.length})</Title>

            {comments.length === 0 ? (
              <Empty description="暂无评论，来说两句吧" image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-6" />
            ) : (
              <div className="flex flex-col gap-3 mb-6">
                {comments.map((c) => (
                  <div key={c.id} className="p-3.5 px-4.5 rounded-3 bg-[#faf8f5] border border-solid border-[#f0ede8]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)]">
                        <UserOutlined className="text-[0.75rem] text-[#b8afa6]" />
                      </div>
                      <span className="font-600 text-[0.8125rem] text-[#3d3630]">{c.user_name}</span>
                      <span className="text-[0.6875rem] text-[#c4bbb2]">{new Date(c.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    <div className="text-[0.8125rem] text-[#6b5e55] leading-7 ml-9">{c.content}</div>
                  </div>
                ))}
              </div>
            )}

            {user ? (
              <div className="flex gap-2.5">
                <Input.TextArea rows={2} placeholder="写下你的评论..." value={commentText}
                  onChange={(e) => setCommentText(e.target.value)} className="rounded-2.5" />
                <Button type="primary" icon={<SendOutlined />} onClick={handleComment}
                  className="self-end rounded-2.5">发送</Button>
              </div>
            ) : (
              <div className="text-center py-5 rounded-3 bg-[#faf8f5] border border-solid border-[#f0ede8] text-[0.8125rem] text-[#b8afa6]">
                请 <Button type="link" size="small" onClick={() => navigate("/login")} className="p-0!">登录</Button> 后发表评论
              </div>
            )}
          </div>
        </div>

        {/* Author sidebar */}
        <div className="w-55 flex-shrink-0" style={{ animation: "slide-up 0.5s ease-out 0.2s both" }}>
          <div className="p-6 rounded-4 bg-white border border-solid border-[#e8e3dc] sticky top-20">
            <div className="text-center mb-4">
              <div className="w-14 h-14 rounded-full mx-auto mb-2.5 flex items-center justify-center bg-[linear-gradient(135deg,#f5f0e8,#e8e3dc)]">
                <UserOutlined className="text-5.5 text-[#b8afa6]" />
              </div>
              <div className="font-600 text-[0.9375rem] text-[#3d3630]">{task.author_name}</div>
              <div className="text-[0.75rem] text-[#b8afa6] mt-0.5">任务作者</div>
            </div>

            <div className="flex justify-center gap-6 py-3 border-t border-b border-solid border-[#f0ede8] mb-3.5">
              <div className="text-center">
                <div className="font-700 text-[#3d3630] text-base">{task.download_count.toLocaleString()}</div>
                <div className="text-[0.625rem] text-[#b8afa6]">下载</div>
              </div>
              <div className="text-center">
                <div className="font-700 text-[#3d3630] text-base">{task.like_count.toLocaleString()}</div>
                <div className="text-[0.625rem] text-[#b8afa6]">点赞</div>
              </div>
            </div>

            <Button type="text" block className="text-[#d4513b] font-500 rounded-2"
              onClick={() => navigate(`/user/${task.author_id}`)}>查看作者主页 →</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const page = "TaskDetailPage";
export default TaskDetailPage;
