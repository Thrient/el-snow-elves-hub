import { useEffect, useState, type FC } from "react";
import { Card, Row, Col, Statistic } from "antd";
import { UserOutlined, DownloadOutlined, DesktopOutlined, GlobalOutlined } from "@ant-design/icons";
import { adminApi } from "@/api/admin";
import { useAuthStore } from "@/store/auth";
import type { AdminStats } from "@/types";

const DashboardPage: FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const desktopOnline = useAuthStore((s) => s.desktop_online);
  const webOnline = useAuthStore((s) => s.web_online);

  useEffect(() => {
    adminApi.getStats().then(setStats).catch(() => {});
  }, []);

  return (
    <div className="pt-8 w-[min(92%,60rem)] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[1.125rem] font-600 text-[#3d3630] m-0">仪表盘</h2>
      </div>
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
            <Statistic title="桌面在线" value={desktopOnline}
              prefix={<DesktopOutlined />}
              styles={{ value: { color: "#1677ff" } }} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable className="rounded-3">
            <Statistic title="网页在线" value={webOnline}
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
