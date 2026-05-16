import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Tabs, Input, Button, List, message, Upload } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, FileOutlined, CameraOutlined } from "@ant-design/icons";
import { useAuthStore } from "../store/auth";
import { taskApi } from "../api/tasks";
import axios from "axios";

const { Title } = Typography;
const API = axios.create({ baseURL: "/api/v1" });
API.interceptors.request.use((c) => { const t = localStorage.getItem("token"); if (t) c.headers.Authorization = `Bearer ${t}`; return c; });

const ProfilePage: FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<{ task_id: number; task_title: string; downloaded_at: string }[]>([]);
  const [likes, setLikes] = useState<{ task_id: number; task_title: string; created_at: string }[]>([]);

  useEffect(() => {
    API.get("/users/me/downloads").then((r) => setDownloads(r.data.data));
    API.get("/users/me/likes").then((r) => setLikes(r.data.data));
  }, []);

  const save = async () => {
    try {
      await axios.put("/api/v1/auth/me", { username }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      useAuthStore.getState().loadFromStorage();
      setEditing(false);
      message.success("已保存");
    } catch { message.error("保存失败"); }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
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
              const res = await API.post("/users/me/avatar", fd);
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
                <div style={{ fontSize: 13, color: "#b8afa6", marginTop: 4 }}>{user.email} · {user.role_name === "admin" ? "管理员" : "用户"}</div>
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
  const [tasks, setTasks] = useState<{ id: number; title: string; download_count: number; like_count: number }[]>([]);

  useEffect(() => { taskApi.userTasks(userId).then((arr) => setTasks(arr as any)); }, [userId]);

  return (
    <List
      dataSource={tasks}
      renderItem={(t) => (
        <List.Item onClick={() => navigate(`/market/${t.id}`)} style={{ cursor: "pointer" }}>
          <span style={{ fontWeight: 500, color: "#3d3630" }}>{t.title}</span>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#b8afa6" }}>
            <span><DownloadOutlined /> {t.download_count}</span>
            <span><LikeOutlined /> {t.like_count}</span>
          </div>
        </List.Item>
      )}
      locale={{ emptyText: "暂无已上架任务" }}
    />
  );
};

export default ProfilePage;
