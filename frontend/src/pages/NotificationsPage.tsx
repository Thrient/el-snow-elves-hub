import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Typography, List, message, Pagination } from "antd";
import { ArrowLeftOutlined, CheckOutlined, BellOutlined } from "@ant-design/icons";
import { notificationApi, type NotificationItem } from "../api/notifications";

const { Title } = Typography;

const NotificationsPage: FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p: number) => {
    setLoading(true);
    notificationApi.list(p).then((d) => {
      setItems(d.items);
      setTotal(d.total);
      setPage(d.page);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const handleMarkAll = async () => {
    try {
      await notificationApi.markAllRead();
      message.success("已全部标记为已读");
      load(page);
    } catch { message.error("操作失败"); }
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      try { await notificationApi.markRead(n.id); } catch {}
    }
    if (n.link) navigate(n.link);
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "reply": return "回复";
      case "mention": return "提及";
      case "system": return "系统";
      default: return "通知";
    }
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "reply": return "#3b82f6";
      case "mention": return "#f59e0b";
      case "system": return "#10b981";
      default: return "#b8afa6";
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
          style={{ color: "#b8afa6", padding: 0, fontWeight: 500 }}>返回</Button>
        <Button size="small" icon={<CheckOutlined />} onClick={handleMarkAll} style={{ fontSize: 12 }}>
          全部已读
        </Button>
      </div>

      <Title level={3} style={{ color: "#3d3630", margin: "0 0 20px", fontSize: 20 }}>
        消息通知
      </Title>

      {items.length === 0 && !loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#b8afa6" }}>
          <BellOutlined style={{ fontSize: 32, marginBottom: 12, display: "block" }} />
          暂无通知
        </div>
      ) : (
        <List
          loading={loading}
          dataSource={items}
          renderItem={(n) => (
            <div
              onClick={() => handleClick(n)}
              style={{
                padding: "14px 18px", marginBottom: 6, borderRadius: 12, cursor: "pointer",
                background: n.is_read ? "#fff" : "linear-gradient(135deg, #fffbf5, #fff)",
                border: `1px solid ${n.is_read ? "#e8e3dc" : "#f59e0b22"}`,
                transition: "border-color .2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 6,
                  background: n.is_read ? "transparent" : "#d4513b",
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "0 6px", borderRadius: 4,
                      background: `${typeColor(n.type)}18`, color: typeColor(n.type),
                      lineHeight: "18px",
                    }}>
                      {typeLabel(n.type)}
                    </span>
                    <span style={{ fontSize: 11, color: "#c4bbb2" }}>
                      {new Date(n.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: n.is_read ? "#6b5e55" : "#3d3630", lineHeight: 1.6 }}>
                    {n.content}
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {total > 20 && (
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Pagination
            current={page} total={total} pageSize={20} size="small"
            onChange={(p) => load(p)}
          />
        </div>
      )}
    </div>
  );
};

export default NotificationsPage;
