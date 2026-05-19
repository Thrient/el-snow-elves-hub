import { type FC } from "react";
import * as Icons from "@ant-design/icons";

const iconMap: Record<string, FC> = {
  HomeOutlined: Icons.HomeOutlined,
  DownloadOutlined: Icons.DownloadOutlined,
  AppstoreOutlined: Icons.AppstoreOutlined,
  MessageOutlined: Icons.MessageOutlined,
  SettingOutlined: Icons.SettingOutlined,
  DashboardOutlined: Icons.DashboardOutlined,
  UserOutlined: Icons.UserOutlined,
  TeamOutlined: Icons.TeamOutlined,
  SafetyCertificateOutlined: Icons.SafetyCertificateOutlined,
  CloudDownloadOutlined: Icons.CloudDownloadOutlined,
  ArrowLeftOutlined: Icons.ArrowLeftOutlined,
  NodeIndexOutlined: Icons.NodeIndexOutlined,
  BellOutlined: Icons.BellOutlined,
};

export function resolveIcon(name: string | null): FC | undefined {
  if (!name) return undefined;
  return iconMap[name];
}

export default iconMap;
