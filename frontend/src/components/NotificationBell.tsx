import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Badge, Popover, List } from "antd";
import { BellOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { notificationApi } from "@/api/notification";
import type { NotificationItem } from "@/types";

const NotificationBell: FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [recentNotifs, setRecentNotifs] = useState<NotificationItem[]>([]);

  // SSE 实时推送
  useEffect(() => {
    notificationApi.unreadCount().then(setUnreadCount);
    const es = new EventSource("/api/v1/stream?client=web");
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "online_count") {
          useAuthStore.getState().setOnlineCount(d.desktop, d.web);
        } else if (d.id) {
          setUnreadCount((c) => c + 1);
          setRecentNotifs((prev) => [d, ...prev].slice(0, 5));
        }
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }, [user]);

  const loadRecent = () => {
    if (!user) return;
    notificationApi.list(1).then((d) => setRecentNotifs(d.items.slice(0, 5)));
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) { loadRecent(); notificationApi.unreadCount().then(setUnreadCount); }
  };

  const handleRead = (n: NotificationItem) => {
    if (!n.is_read) {
      setUnreadCount((c) => Math.max(0, c - 1));
      setRecentNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x));
    }
    void notificationApi.markRead(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  if (!user) return null;

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      open={open}
      onOpenChange={handleOpen}
      content={
        <div style={{ width: 320 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#3d3630" }}>消息通知</span>
            <Button type="link" size="small" style={{ fontSize: 11 }} onClick={() => { setOpen(false); navigate("/notifications"); }}>
              查看全部
            </Button>
          </div>
          {recentNotifs.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20, color: "#b8afa6", fontSize: 12 }}>暂无通知</div>
          ) : (
            <List
              size="small"
              dataSource={recentNotifs}
              renderItem={(n) => (
                <List.Item
                  style={{ cursor: "pointer", background: n.is_read ? "transparent" : "#fef3ef", borderRadius: 6, padding: "6px 8px", marginBottom: 2 }}
                  onClick={() => handleRead(n)}
                >
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                    <div style={{ color: n.is_read ? "#6b5e55" : "#3d3630", fontWeight: n.is_read ? 400 : 500 }}>
                      {n.content}
                    </div>
                    <div style={{ fontSize: 10, color: "#c4bbb2", marginTop: 2 }}>
                      {new Date(n.created_at).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>
      }
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button type="text" size="small" icon={<BellOutlined />} style={{ color: "#6b5e55" }} />
      </Badge>
    </Popover>
  );
};

export default NotificationBell;
