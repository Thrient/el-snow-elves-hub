import { useEffect, useState, type FC } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Tag, Input, message, Empty, Typography, Spin, Popconfirm } from "antd";
import { DownloadOutlined, LikeOutlined, LikeFilled, UserOutlined, ArrowLeftOutlined, CommentOutlined, SendOutlined, CalendarOutlined, FileOutlined, DeleteOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem, type CommentItem } from "../api/tasks";
import { useAuthStore } from "../store/auth";

const { Title, Paragraph } = Typography;

const fadeIn = `
@keyframes slide-up {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
`;

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
    try {
      const t = await taskApi.get(Number(id));
      setTask(t);
      const c = await taskApi.comments(Number(id));
      setComments(c);
    } catch { message.error("加载失败"); }
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
    setCommentText("");
    message.success("评论已发布");
    load();
  };

  const handleDelete = async () => {
    if (!task) return;
    await taskApi.delete(task.id);
    message.success("任务已删除");
    navigate("/market");
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 120 }}><Spin size="large" /></div>;
  }

  if (!task) {
    return <Empty style={{ padding: 80 }} description="任务不存在" />;
  }

  return (
    <div style={{ maxWidth: 920, margin: "0 auto" }}>
      <style>{fadeIn}</style>

      {/* Back nav */}
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate("/market")}
        style={{ color: "#b8afa6", marginBottom: 20, padding: 0, fontWeight: 500 }}>
        返回市场
      </Button>

      {/* Cover */}
      <div style={{
        borderRadius: 18, overflow: "hidden", marginBottom: 28,
        background: task.cover_url ? undefined : "linear-gradient(145deg, #f5f0e8, #ebe4d8)",
        maxHeight: 420, display: "flex", alignItems: "center", justifyContent: "center",
        border: task.cover_url ? undefined : "1px solid #e8e3dc",
        animation: "slide-up 0.5s ease-out both",
      }}>
        {task.cover_url ? (
          <img src={task.cover_url} alt={task.title} style={{ width: "100%", objectFit: "cover", maxHeight: 420 }} />
        ) : (
          <DownloadOutlined style={{ fontSize: 56, color: "#d4c8b8", padding: 80 }} />
        )}
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {/* Main column */}
        <div style={{ flex: 1, minWidth: 300, animation: "slide-up 0.5s ease-out 0.1s both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <Tag style={{ borderRadius: 4, background: "#fef3ef", color: "#d4513b", border: "none", fontWeight: 500 }}>
              {task.category}
            </Tag>
            {task.tags?.split(",").map((t) => (
              <Tag key={t} style={{ borderRadius: 4, background: "#f5f2ee", color: "#6b5e55", border: "1px solid #e8e3dc" }}>
                {t.trim()}
              </Tag>
            ))}
          </div>

          <Title level={3} style={{ color: "#3d3630", marginBottom: 8, fontWeight: 700 }}>{task.title}</Title>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16, fontSize: 12, color: "#b8afa6" }}>
            <span><CalendarOutlined style={{ marginRight: 4 }} />{new Date(task.created_at).toLocaleDateString("zh-CN")}</span>
            {task.file_size ? <span><FileOutlined style={{ marginRight: 4 }} />{(task.file_size / 1024).toFixed(0)} KB</span> : null}
            <span>v{task.version}</span>
          </div>

          <Paragraph style={{ color: "#6b5e55", fontSize: 14, lineHeight: 1.9, marginBottom: 24, whiteSpace: "pre-line" }}>
            {task.description || "暂无描述"}
          </Paragraph>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 12, marginBottom: 40 }}>
            <Button
              type="primary"
              size="large"
              icon={<DownloadOutlined />}
              href={taskApi.download(task.id)}
              target="_blank"
              style={{
                borderRadius: 12, height: 44, padding: "0 28px", fontWeight: 600,
                background: "linear-gradient(135deg, #d4513b, #c4402a)", border: "none",
                boxShadow: "0 4px 16px rgba(212,81,59,0.3)",
              }}
            >
              下载 ({task.download_count.toLocaleString()})
            </Button>
            <Button
              size="large"
              icon={task.liked ? <LikeFilled style={{ color: "#d4513b" }} /> : <LikeOutlined />}
              onClick={handleLike}
              style={{ borderRadius: 12, height: 44, padding: "0 24px", fontWeight: 500 }}
            >
              {task.liked ? "已点赞" : "点赞"} ({task.like_count.toLocaleString()})
            </Button>
            {user?.id === task.author_id && (
              <Popconfirm
                title="确定删除此任务？"
                description="删除后无法恢复"
                onConfirm={handleDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button
                  size="large"
                  icon={<DeleteOutlined />}
                  style={{ borderRadius: 12, height: 44, padding: "0 24px", fontWeight: 500 }}
                >
                  删除
                </Button>
              </Popconfirm>
            )}
          </div>

          {/* Comments */}
          <div style={{ borderTop: "1px solid #e8e3dc", paddingTop: 28 }}>
            <Title level={4} style={{ color: "#3d3630", marginBottom: 20, fontWeight: 600 }}>
              <CommentOutlined /> 评论 ({comments.length})
            </Title>

            {comments.length === 0 ? (
              <Empty description="暂无评论，来说两句吧" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {comments.map((c) => (
                  <div key={c.id} style={{
                    padding: "14px 18px", borderRadius: 12, background: "#faf8f5",
                    border: "1px solid #f0ede8",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%",
                        background: "linear-gradient(135deg, #f3f0ec, #e8e3dc)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <UserOutlined style={{ fontSize: 12, color: "#b8afa6" }} />
                      </div>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#3d3630" }}>{c.user_name}</span>
                      <span style={{ fontSize: 11, color: "#c4bbb2" }}>{new Date(c.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#6b5e55", lineHeight: 1.7, marginLeft: 36 }}>{c.content}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            {user ? (
              <div style={{ display: "flex", gap: 10 }}>
                <Input.TextArea
                  rows={2}
                  placeholder="写下你的评论..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  style={{ borderRadius: 10 }}
                />
                <Button type="primary" icon={<SendOutlined />} onClick={handleComment}
                  style={{ alignSelf: "flex-end", borderRadius: 10 }}>
                  发送
                </Button>
              </div>
            ) : (
              <div style={{
                textAlign: "center", padding: 20, borderRadius: 12,
                background: "#faf8f5", border: "1px solid #f0ede8",
                fontSize: 13, color: "#b8afa6",
              }}>
                请 <Button type="link" size="small" onClick={() => navigate("/login")} style={{ padding: 0 }}>登录</Button> 后发表评论
              </div>
            )}
          </div>
        </div>

        {/* Author sidebar */}
        <div style={{
          width: 220, flexShrink: 0,
          animation: "slide-up 0.5s ease-out 0.2s both",
        }}>
          <div style={{
            padding: 24, borderRadius: 16, background: "#fff",
            border: "1px solid #e8e3dc", position: "sticky", top: 80,
          }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", margin: "0 auto 10px",
                background: "linear-gradient(135deg, #f5f0e8, #e8e3dc)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <UserOutlined style={{ fontSize: 22, color: "#b8afa6" }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#3d3630" }}>{task.author_name}</div>
              <div style={{ fontSize: 12, color: "#b8afa6", marginTop: 2 }}>任务作者</div>
            </div>

            <div style={{
              display: "flex", justifyContent: "center", gap: 24,
              padding: "12px 0", borderTop: "1px solid #f0ede8", borderBottom: "1px solid #f0ede8",
              marginBottom: 14,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, color: "#3d3630", fontSize: 16 }}>{task.download_count.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "#b8afa6" }}>下载</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontWeight: 700, color: "#3d3630", fontSize: 16 }}>{task.like_count.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "#b8afa6" }}>点赞</div>
              </div>
            </div>

            <Button type="text" block style={{ color: "#d4513b", fontWeight: 500, borderRadius: 8 }}
              onClick={() => navigate(`/user/${task.author_id}`)}>
              查看作者主页 →
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailPage;
