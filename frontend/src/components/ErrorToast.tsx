import { useEffect, type FC } from "react";
import { message } from "antd";
import { bus } from "@/event/bus";

const ErrorToast: FC = () => {
  useEffect(() => {
    const handler = (msg: string) => { message.error(msg); };
    bus.on("app:error", handler);
    return () => bus.off("app:error", handler);
  }, []);

  return null;
};

export default ErrorToast;
