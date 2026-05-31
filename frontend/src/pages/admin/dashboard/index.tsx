import { useEffect, useState, type FC } from "react";
import { Card, Row, Col, Statistic } from "antd";
import { UserOutlined, DownloadOutlined, DesktopOutlined, GlobalOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import type { AdminStats } from "@/types";

const DashboardPage: FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/v1/admin/stream");
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "online_count") {
          setStats((prev) => prev ? { ...prev, desktop_online: d.desktop, web_online: d.web } : prev);
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => {};
    return () => es.close();
  }, []);

  return (
    <div className="pt-8 w-[min(92%,60rem)] mx-auto">
      <h2 className="text-[1.125rem] font-600 text-[#3d3630] mb-6">仪表盘</h2>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card hoverable className="rounded-3">
            <Statistic title="注册用户" value={stats?.user_count ?? "-"}
              prefix={<UserOutlined className="text-[#d4513b]" />} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable className="rounded-3">
            <Statistic title="下载版本" value={stats?.version_count ?? "-"}
              prefix={<DownloadOutlined className="text-[#d4513b]" />} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable className="rounded-3">
            <Statistic title="桌面在线" value={stats?.desktop_online ?? "-"}
              prefix={<DesktopOutlined />}
              styles={{ value: { color: "#1677ff" } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable className="rounded-3">
            <Statistic title="网页在线" value={stats?.web_online ?? "-"}
              prefix={<GlobalOutlined />}
              styles={{ value: { color: "#52c41a" } }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export const page = "DashboardPage";
export default DashboardPage;
