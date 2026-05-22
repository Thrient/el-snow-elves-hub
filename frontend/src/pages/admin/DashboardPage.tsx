import { useEffect, useState } from "react";
import { Card, Row, Col, Statistic } from "antd";
import { UserOutlined, DownloadOutlined, DesktopOutlined, GlobalOutlined } from "@ant-design/icons";
import { adminApi, type AdminStats } from "../../api/admin";

export default function DashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  // SSE real-time online count
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const es = new EventSource(`/api/v1/admin/stream?token=${encodeURIComponent(token)}`);
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "online_count") {
          setStats((prev) =>
            prev ? { ...prev, desktop_online: d.desktop, web_online: d.web } : prev
          );
        }
      } catch {
        /* ignore malformed events */
      }
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", margin: "0 0 24px" }}>
        仪表盘
      </h2>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic
              title="注册用户"
              value={stats?.user_count ?? "-"}
              prefix={<UserOutlined style={{ color: "#d4513b" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic
              title="下载版本"
              value={stats?.version_count ?? "-"}
              prefix={<DownloadOutlined style={{ color: "#d4513b" }} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic
              title="桌面在线"
              value={stats?.desktop_online ?? "-"}
              prefix={<DesktopOutlined />}
              valueStyle={{ color: "#1677ff" }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic
              title="网页在线"
              value={stats?.web_online ?? "-"}
              prefix={<GlobalOutlined />}
              valueStyle={{ color: "#52c41a" }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
