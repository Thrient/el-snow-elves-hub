import { useEffect, useState, type FC } from "react";
import { Card, Typography, Button, Space, Tag } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import axios from "axios";

const { Title, Paragraph } = Typography;

interface Version {
  id: number; version: string; platform: string; changelog: string | null;
  file_url: string; file_size: number | null; is_latest: boolean; created_at: string;
}

const DownloadPage: FC = () => {
  const [versions, setVersions] = useState<Version[]>([]);

  useEffect(() => {
    axios.get("/api/v1/versions").then((r) => setVersions(r.data.data));
  }, []);

  const latest = versions.find((v) => v.is_latest);

  return (
    <div>
      <Title level={2} style={{ color: "#3d3630" }}>下载</Title>
      <Paragraph style={{ color: "#6b5e55" }}>下载桌面客户端，开始使用自动化工具</Paragraph>

      {/* Latest version hero */}
      {latest && (
        <Card
          style={{ borderRadius: 12, marginBottom: 24, border: "1px solid #d4513b33", background: "linear-gradient(135deg, #fffbf5, #fff)" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Tag color="red">最新版本</Tag>
                <span style={{ fontSize: 22, fontWeight: 700, color: "#3d3630" }}>v{latest.version}</span>
              </div>
              <div style={{ fontSize: 13, color: "#6b5e55" }}>{latest.platform}</div>
              {latest.changelog && (
                <div style={{ fontSize: 13, color: "#b8afa6", marginTop: 8, maxWidth: 500 }}>{latest.changelog}</div>
              )}
            </div>
            <a href={latest.file_url} target="_blank" rel="noreferrer">
              <Button type="primary" size="large" icon={<DownloadOutlined />} style={{ borderRadius: 8 }}>
                立即下载
              </Button>
            </a>
          </div>
        </Card>
      )}

      {/* Version history */}
      {versions.length > 0 && (
        <>
          <Title level={4} style={{ color: "#3d3630", marginBottom: 16 }}>历史版本</Title>
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            {versions.filter((v) => !v.is_latest).map((ver) => (
              <Card key={ver.id} hoverable style={{ borderRadius: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Title level={5} style={{ margin: 0, color: "#3d3630" }}>v{ver.version}</Title>
                      <span style={{ fontSize: 12, color: "#b8afa6" }}>{ver.platform}</span>
                    </div>
                    {ver.changelog && <div style={{ fontSize: 12, color: "#b8afa6", marginTop: 4 }}>{ver.changelog}</div>}
                    <div style={{ fontSize: 11, color: "#c4bbb2", marginTop: 4 }}>
                      {new Date(ver.created_at).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                  <a href={ver.file_url} target="_blank" rel="noreferrer">
                    <Button icon={<DownloadOutlined />} style={{ borderRadius: 8 }}>下载</Button>
                  </a>
                </div>
              </Card>
            ))}
          </Space>
        </>
      )}

      {versions.length === 0 && (
        <Card style={{ borderRadius: 12, textAlign: "center", padding: 40, color: "#b8afa6" }}>
          暂无下载版本
        </Card>
      )}
    </div>
  );
};

export default DownloadPage;
