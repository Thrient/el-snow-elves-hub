import { useEffect, useState, type FC } from "react";
import { Button, Tag, Typography } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { releaseApi } from "@/api/release";
import type { VersionItem } from "@/types";

const { Title, Paragraph } = Typography;

const DownloadPage: FC = () => {
  const [versions, setVersions] = useState<VersionItem[]>([]);

  useEffect(() => {
    releaseApi.list().then(setVersions);
  }, []);

  const latest = versions.find((v) => v.is_latest);

  return (
    <div>
      <Title level={2} className="text-[#3d3630]!">下载</Title>
      <Paragraph className="text-[#6b5e55]!">下载桌面客户端，开始使用自动化工具</Paragraph>

      {latest && (
        <div
          className="rounded-3 mb-6 p-6 flex items-center justify-between flex-wrap gap-4"
          style={{ border: "1px solid rgba(212,81,59,0.2)", background: "linear-gradient(135deg, #fffbf5, #fff)" }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Tag color="red">最新版本</Tag>
              <span className="text-[1.375rem] font-700 text-[#3d3630]">v{latest.version}</span>
            </div>
            <div className="text-[0.8125rem] text-[#6b5e55]">{latest.platform}</div>
            {latest.changelog && (
              <div className="text-[0.8125rem] text-[#b8afa6] mt-2 max-w-[32rem]">{latest.changelog}</div>
            )}
          </div>
          <a href={releaseApi.download(latest.id)} target="_blank" rel="noreferrer">
            <Button type="primary" size="large" icon={<DownloadOutlined />} className="rounded-2">
              立即下载
            </Button>
          </a>
        </div>
      )}

      {versions.length > 0 && (
        <>
          <Title level={4} className="text-[#3d3630]! mb-4">历史版本</Title>
          <div className="flex flex-col gap-3">
            {versions.filter((v) => !v.is_latest).map((ver) => (
              <div
                key={ver.id}
                className="rounded-3 p-4 flex items-center justify-between bg-white border border-solid border-[#e8e0d5] card-hover"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[1rem] font-600 text-[#3d3630]">v{ver.version}</span>
                    <span className="text-[0.75rem] text-[#b8afa6]">{ver.platform}</span>
                  </div>
                  {ver.changelog && <div className="text-[0.75rem] text-[#b8afa6] mt-1">{ver.changelog}</div>}
                  <div className="text-[0.6875rem] text-[#c4bbb2] mt-1">
                    {new Date(ver.created_at).toLocaleDateString("zh-CN")}
                  </div>
                </div>
                <a href={releaseApi.download(ver.id)} target="_blank" rel="noreferrer">
                  <Button icon={<DownloadOutlined />} className="rounded-2">下载</Button>
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {versions.length === 0 && (
        <div className="text-center py-20 text-[#b8afa6] text-[0.9rem]">
          暂无下载版本
        </div>
      )}
    </div>
  );
};

export const page = "DownloadPage";
export default DownloadPage;
