import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Typography, List, message, Pagination } from "antd";
import { ArrowLeftOutlined, CheckOutlined, BellOutlined } from "@ant-design/icons";
import { notificationApi } from "@/api/notification";
import type { NotificationItem } from "@/types";

const { Title } = Typography;

const TYPE_MAP: Record<string, { label: string; color: string }> = {
  reply: { label: "回复", color: "#3b82f6" },
  mention: { label: "提及", color: "#f59e0b" },
  system: { label: "系统", color: "#10b981" },
};

const NotificationsPage: FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = (p: number) => {
    setLoading(true);
    notificationApi.list(p).then((d) => {
      setItems(d.items); setTotal(d.total); setPage(d.page);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const handleMarkAll = async () => {
    try { await notificationApi.markAllRead(); message.success("已全部标记为已读"); load(page); }
    catch { /* ErrorToast */ }
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.is_read) { try { await notificationApi.markRead(n.id); } catch {} }
    if (n.link) navigate(n.link);
  };

  const t = (type: string) => TYPE_MAP[type] || { label: "通知", color: "#b8afa6" };

  return (
    <div className="max-w-[44rem] mx-auto pt-8">
      <div className="flex justify-between items-center mb-5">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}
          className="text-[#b8afa6] p-0! font-500">返回</Button>
        <Button size="small" icon={<CheckOutlined />} onClick={handleMarkAll} className="text-[0.75rem]">全部已读</Button>
      </div>

      <Title level={3} className="text-[#3d3630]! m-0! mb-5 text-xl">消息通知</Title>

      {items.length === 0 && !loading ? (
        <div className="text-center py-15 text-[#b8afa6]">
          <BellOutlined className="text-8 mb-3 block" />
          暂无通知
        </div>
      ) : (
        <List loading={loading} dataSource={items}
          renderItem={(n) => (
            <div onClick={() => handleClick(n)}
              className={`p-3.5 px-4.5 mb-1.5 rounded-3 cursor-pointer border border-solid transition-colors duration-200 ${
                n.is_read ? "bg-white border-[#e8e3dc]" : "bg-[linear-gradient(135deg,#fffbf5,#fff)] border-[#f59e0b22]"
              }`}>
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${n.is_read ? "bg-transparent" : "bg-[#d4513b]"}`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[0.625rem] font-600 px-1.5 rounded-1 leading-4.5"
                      style={{ background: `${t(n.type).color}18`, color: t(n.type).color }}>
                      {t(n.type).label}
                    </span>
                    <span className="text-[0.6875rem] text-[#c4bbb2]">
                      {new Date(n.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <div className={`text-[0.8125rem] leading-relaxed ${n.is_read ? "text-[#6b5e55]" : "text-[#3d3630]"}`}>
                    {n.content}
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      )}

      {total > 20 && (
        <div className="text-center mt-4">
          <Pagination current={page} total={total} pageSize={20} size="small" onChange={(p) => load(p)} />
        </div>
      )}
    </div>
  );
};

export const page = "NotificationsPage";
export default NotificationsPage;
