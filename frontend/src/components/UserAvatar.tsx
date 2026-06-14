import type { FC } from "react";
import { UserOutlined } from "@ant-design/icons";

interface Props {
  src: string | null | undefined;
  size?: number; // rem, default 1
  quality?: number; // default 50
  className?: string;
}

const UserAvatar: FC<Props> = ({ src, size = 1, quality = 50, className = "" }) => {
  const s = `${size}rem`;
  if (src) {
    return (
      <img src={`${src}?q=${quality}`} alt=""
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ width: s, height: s }} />
    );
  }
  return (
    <span className={`rounded-full flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#f3f0ec,#e8e3dc)] ${className}`}
      style={{ width: s, height: s }}>
      <UserOutlined style={{ fontSize: `${size * 0.65}rem` }} className="text-[#b8afa6]" />
    </span>
  );
};

export default UserAvatar;
