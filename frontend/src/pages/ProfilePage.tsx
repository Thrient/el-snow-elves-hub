import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Tabs, Input, Button, List, message, Upload, Row, Col, Tag } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, FileOutlined, CameraOutlined, CommentOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useAuthStore } from "../store/auth";
import { taskApi, type TaskItem } from "../api/tasks";
import { usersApi, type UserDownload, type UserLike } from "../api/users";
import { authApi } from "../api/auth";

const { Title } = Typography;

const ProfilePage: FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<UserDownload[]>([]);
  const [likes, setLikes] = useState<UserLike[]>([]);

  useEffect(() => {
    usersApi.getDownloads().then(setDownloads);
    usersApi.getLikes().then(setLikes);
  }, []);

  const save = async () => {
    try {
      await authApi.updateProfile(username);
      useAuthStore.getState().loadFromStorage();
      setEditing(false);
      message.success("已保存");
    } catch { message.error("保存失败"); }
  };

  if (!user) return null;

  return (
    <div style={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {/* Profile card */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Upload
            accept="image/*"
            maxCount={1}
            showUploadList={false}
            customRequest={async ({ file }) => {
              const fd = new FormData();
              fd.append("file", file as File);
              const res = await usersApi.uploadAvatar(file as File);
              if (res.data.code === 0) {
                setAvatarUrl(res.data.data.avatar_url);
                message.success("头像已更新");
              }
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", cursor: "pointer", background: "#f3f0ec", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
              {avatarUrl || user.avatar_url ? (
                <img src={avatarUrl || user.avatar_url || ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <UserOutlined style={{ fontSize: 28, color: "#b8afa6" }} />
              )}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,.4)", textAlign: "center", padding: "2px 0" }}>
                <CameraOutlined style={{ color: "#fff", fontSize: 10 }} />
              </div>
            </div>
          </Upload>
          <div style={{ flex: 1 }}>
            {editing ? (
              <div style={{ display: "flex", gap: 8 }}>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: 200 }} />
                <Button type="primary" size="small" onClick={save}>保存</Button>
                <Button size="small" onClick={() => { setUsername(user.username); setEditing(false); }}>取消</Button>
              </div>
            ) : (
              <>
                <Title level={4} style={{ margin: 0, color: "#3d3630" }}>{user.username}</Title>
                <div style={{ fontSize: 13, color: "#b8afa6", marginTop: 4 }}>{user.email} · {user.role_names?.includes("admin") ? "管理员" : "用户"}</div>
              </>
            )}
          </div>
          {!editing && <Button size="small" onClick={() => setEditing(true)} style={{ borderRadius: 8 }}>编辑资料</Button>}
        </div>
      </Card>

      {/* Tabs */}
      <Card style={{ borderRadius: 12 }}>
        <Tabs
          items={[
            {
              key: "tasks",
              label: <span><FileOutlined /> 我的任务</span>,
              children: <UserTasks userId={user.id} />,
            },
            {
              key: "downloads",
              label: <span><DownloadOutlined /> 下载记录 ({downloads.length})</span>,
              children: (
                <List
                  dataSource={downloads}
                  renderItem={(item) => (
                    <List.Item onClick={() => navigate(`/market/${item.task_id}`)} style={{ cursor: "pointer" }}>
                      <span style={{ color: "#3d3630" }}>{item.task_title}</span>
                      <span style={{ fontSize: 12, color: "#b8afa6" }}>{new Date(item.downloaded_at).toLocaleString("zh-CN")}</span>
                    </List.Item>
                  )}
                  locale={{ emptyText: "暂无下载记录" }}
                />
              ),
            },
            {
              key: "likes",
              label: <span><LikeOutlined /> 我的点赞 ({likes.length})</span>,
              children: (
                <List
                  dataSource={likes}
                  renderItem={(item) => (
                    <List.Item onClick={() => navigate(`/market/${item.task_id}`)} style={{ cursor: "pointer" }}>
                      <span style={{ color: "#3d3630" }}>{item.task_title}</span>
                      <span style={{ fontSize: 12, color: "#b8afa6" }}>{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                    </List.Item>
                  )}
                  locale={{ emptyText: "暂无点赞" }}
                />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

// Sub-component for user's tasks
const UserTasks: FC<{ userId: number }> = ({ userId }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => { taskApi.userTasks(userId).then((arr) => setTasks(arr as any)); }, [userId]);

  if (tasks.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 40, color: "#b8afa6" }}>
        <AppstoreOutlined style={{ fontSize: 32, marginBottom: 8, color: "#d4c8b8" }} />
        <div>暂无已上架任务</div>
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {tasks.map((task) => (
        <Col key={task.id} xs={24} sm={12} lg={6}>
          <Card
            hoverable
            onClick={() => navigate(`/market/${task.id}`)}
            style={{
              borderRadius: 14, overflow: "hidden",
              border: "1px solid #e8e3dc",
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
                  <img src={task.cover_url} alt={task.title} loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ) : (
                <div style={{
                  height: 150, background: "linear-gradient(145deg, #f5f0e8, #ebe4d8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <AppstoreOutlined style={{ fontSize: 36, color: "#d4c8b8" }} />
                </div>
              )
            }
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Tag style={{ fontSize: 10, lineHeight: "18px", borderRadius: 4, margin: 0,
                padding: "0 6px", background: "#fef3ef", color: "#d4513b", border: "none" }}>
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
            <div style={{
              display: "flex", gap: 14, fontSize: 11, color: "#b8afa6",
              paddingTop: 6, borderTop: "1px solid #f5f2ee",
            }}>
              <span><DownloadOutlined /> {task.download_count.toLocaleString()}</span>
              <span><LikeOutlined /> {task.like_count.toLocaleString()}</span>
              <span><CommentOutlined /> {task.comment_count.toLocaleString()}</span>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default ProfilePage;
