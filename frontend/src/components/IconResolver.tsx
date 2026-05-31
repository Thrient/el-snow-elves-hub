import { type FC } from "react";
import * as Icons from "@ant-design/icons";

const iconMap = Icons as unknown as Record<string, FC>;

export { iconMap };

export function resolveIcon(name: string | null): FC | undefined {
  if (!name) return undefined;
  return iconMap[name];
}
