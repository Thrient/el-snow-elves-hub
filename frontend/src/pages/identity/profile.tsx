import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Tabs, Input, Button, List, message, Upload, Row, Col, Tag } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, FileOutlined, CameraOutlined, CommentOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { taskApi } from "@/api/task";
import type { TaskItem, UserDownload, UserLike } from "@/types";
import { authApi, usersApi } from "@/api/identity";

const { Title } = Typography;

const UserTasks: FC<{ userId: number }> = ({ userId }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  useEffect(() => { taskApi.userTasks(userId).then((arr) => setTasks(arr as any)); }, [userId]);

  if (tasks.length === 0) {
    return (
      <div className="text-center py-10 text-[#b8afa6]">
        <AppstoreOutlined className="text-8 mb-2 text-[#d4c8b8]" />
        <div>暂无已上架任务</div>
      </div>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {tasks.map((task) => (
        <Col key={task.id} xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate(`/market/${task.id}`)}
            className="rounded-3.5 overflow-hidden border border-solid border-[#e8e3dc] transition-all duration-250 hover:-translate-y-1 hover:shadow-lg hover:border-[#d4513b]"
            styles={{ body: { padding: "12px 14px" } }}
            cover={
              task.cover_url ? (
                <div className="h-[9.4rem] relative overflow-hidden bg-[#f3f0ec]">
                  <img src={task.cover_url} alt={task.title} loading="lazy" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-[9.4rem] flex items-center justify-center bg-[linear-gradient(145deg,#f5f0e8,#ebe4d8)]">
                  <AppstoreOutlined className="text-9 text-[#d4c8b8]" />
                </div>
              )
            }
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Tag className="text-[0.625rem] leading-4.5 rounded-1 m-0! px-1.5 border-none text-[#d4513b] bg-[#fef3ef]">{task.category}</Tag>
              <span className="text-[0.625rem] text-[#c4bbb2]">v{task.version}</span>
            </div>
            <div className="text-[0.8125rem] font-600 text-[#3d3630] mb-1 truncate">{task.title}</div>
            <div className="flex gap-3.5 text-[0.6875rem] text-[#b8afa6] pt-1.5">
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
    <div className="w-full max-w-75rem mx-auto pt-8">
      {/* Profile card */}
      <Card className="rounded-3 mb-6">
        <div className="flex items-center gap-4">
          <Upload accept="image/*" maxCount={1} showUploadList={false}
            customRequest={async ({ file }) => {
              const res = await usersApi.uploadAvatar(file as File);
              if (res.code === 0) { setAvatarUrl(res.data.avatar_url); message.success("头像已更新"); }
            }}>
            <div className="w-16 h-16 rounded-full overflow-hidden cursor-pointer bg-[#f3f0ec] flex items-center justify-center relative">
              {avatarUrl || user.avatar_url ? (
                <img src={avatarUrl || user.avatar_url || ""} className="w-full h-full object-cover" />
              ) : (
                <UserOutlined className="text-7 text-[#b8afa6]" />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-[rgba(0,0,0,.4)] text-center py-0.5">
                <CameraOutlined className="text-white text-[0.625rem]" />
              </div>
            </div>
          </Upload>
          <div className="flex-1">
            {editing ? (
              <div className="flex gap-2">
                <Input value={username} onChange={(e) => setUsername(e.target.value)} className="w-50" />
                <Button type="primary" size="small" onClick={save}>保存</Button>
                <Button size="small" onClick={() => { setUsername(user.username); setEditing(false); }}>取消</Button>
              </div>
            ) : (
              <>
                <Title level={4} className="m-0! text-[#3d3630]">{user.username}</Title>
                <div className="text-[0.8125rem] text-[#b8afa6] mt-1">{user.email} · {user.role_names?.includes("admin") ? "管理员" : "用户"}</div>
              </>
            )}
          </div>
          {!editing && <Button size="small" onClick={() => setEditing(true)} className="rounded-2">编辑资料</Button>}
        </div>
      </Card>

      {/* Tabs */}
      <Card className="rounded-3">
        <Tabs items={[
          { key: "tasks", label: <span><FileOutlined /> 我的任务</span>, children: <UserTasks userId={user.id} /> },
          {
            key: "downloads", label: <span><DownloadOutlined /> 下载记录 ({downloads.length})</span>,
            children: (
              <List dataSource={downloads} locale={{ emptyText: "暂无下载记录" }}
                renderItem={(item) => (
                  <List.Item onClick={() => navigate(`/market/${item.task_id}`)} className="cursor-pointer!">
                    <span className="text-[#3d3630]">{item.task_title}</span>
                    <span className="text-[0.75rem] text-[#b8afa6]">{new Date(item.downloaded_at).toLocaleString("zh-CN")}</span>
                  </List.Item>
                )} />
            ),
          },
          {
            key: "likes", label: <span><LikeOutlined /> 我的点赞 ({likes.length})</span>,
            children: (
              <List dataSource={likes} locale={{ emptyText: "暂无点赞" }}
                renderItem={(item) => (
                  <List.Item onClick={() => navigate(`/market/${item.task_id}`)} className="cursor-pointer!">
                    <span className="text-[#3d3630]">{item.task_title}</span>
                    <span className="text-[0.75rem] text-[#b8afa6]">{new Date(item.created_at).toLocaleString("zh-CN")}</span>
                  </List.Item>
                )} />
            ),
          },
        ]} />
      </Card>
    </div>
  );
};

export const page = "ProfilePage";
export default ProfilePage;
