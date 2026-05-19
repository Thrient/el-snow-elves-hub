import { type FC } from "react";
import { Result } from "antd";

interface GenericPageProps {
  title?: string;
}

const GenericPage: FC<GenericPageProps> = ({ title }) => (
  <div style={{ padding: 40, textAlign: "center" }}>
    <Result
      status="info"
      title={title || "页面"}
      subTitle="此页面内容暂未配置，请联系管理员。"
    />
  </div>
);

export default GenericPage;
