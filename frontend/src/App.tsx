import type { FC } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import AppLayout from "@/layout/AppLayout";

const App: FC = () => (
  <ConfigProvider
    locale={zhCN}
    theme={{
      token: {
        colorPrimary: "#d4513b",
        borderRadius: 8,
        fontFamily: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`,
      },
    }}
  >
    <AppLayout />
  </ConfigProvider>
);

export default App;
