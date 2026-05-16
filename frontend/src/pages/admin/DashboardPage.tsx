import { useEffect, useState, type FC } from "react";
import { Card, Row, Col, Statistic } from "antd";
import { UserOutlined, DownloadOutlined } from "@ant-design/icons";
import { adminApi, type AdminStats } from "../../api/admin";

const DashboardPage: FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    adminApi.getStats().then(setStats);
  }, []);

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, color: "#3d3630", marginBottom: 24 }}>仪表盘</h2>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic title="注册用户" value={stats?.user_count ?? "-"} prefix={<UserOutlined style={{ color: "#d4513b" }} />} />
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic title="下载版本" value={stats?.version_count ?? "-"} prefix={<DownloadOutlined style={{ color: "#d4513b" }} />} />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DashboardPage;
