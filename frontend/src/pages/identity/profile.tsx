import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Typography, Tabs, Input, Button, List, message, Upload, Row, Col } from "antd";
import { UserOutlined, DownloadOutlined, LikeOutlined, FileOutlined, CameraOutlined, AppstoreOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { taskApi } from "@/api/task";
import type { TaskItem, UserDownload, UserLike } from "@/types";
import { authApi, usersApi } from "@/api/identity";
import MarketCard from "@/pages/task/components/MarketCard";

const { Title } = Typography;

const UserTasks: FC<{ userId: number }> = ({ userId }) => {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  useEffect(() => { taskApi.userTasks(userId).then(setTasks); }, [userId]);

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
      {tasks.map((task, idx) => (
        <Col key={task.id} xs={24} sm={12} lg={6}>
          <MarketCard task={task} index={idx} />
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
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);

  useEffect(() => {
    usersApi.getDownloads().then(setDownloads);
    usersApi.getLikes().then(setLikes);
  }, []);

  const save = async () => {
    const v = username.trim();
    if (!v) return message.warning("用户名不能为空");
    if (v.length < 5 || v.length > 12) return message.warning("用户名 5-12 个字符");
    if (/[<>"'&/]/.test(v)) return message.warning("用户名不能包含特殊字符");
    try {
      await authApi.updateProfile(v);
      useAuthStore.getState().validateSession();
      setUsername(v);
      setEditing(false);
      message.success("已保存");
    } catch { /* ErrorToast */ }
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
                <div className="text-[0.8125rem] text-[#b8afa6] mt-1">
                  {user.email}
                  {user.email_verified ? (
                    <span className="text-[#52c41a] ml-1">已验证</span>
                  ) : (
                    <span className="text-[#faad14] ml-1">未验证</span>
                  )}
                  <span onClick={() => setChangingEmail(!changingEmail)} className="text-[#d4513b] cursor-pointer ml-2">更换</span>
                </div>
                {changingEmail && (
                  <div className="flex gap-2 mt-2">
                    <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="新邮箱" className="w-50" size="small" />
                    <Button size="small" type="primary" onClick={async () => {
                      if (!newEmail) return message.warning("请输入新邮箱");
                      try {
                        await authApi.changeEmail(newEmail);
                        message.success("验证邮件已发送到新邮箱");
                        setChangingEmail(false);
                      } catch { /* ErrorToast */ }
                    }}>保存</Button>
                    <Button size="small" onClick={() => setChangingEmail(false)}>取消</Button>
                  </div>
                )}
                <div className="text-[0.75rem] text-[#b8afa6]">{user.role_names?.includes("admin") ? "管理员" : "用户"}</div>
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
