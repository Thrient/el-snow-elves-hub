import { type FC, type ReactNode } from "react";
import { Result, Button } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";

interface RouteGuardProps {
  perm: string;
  children: ReactNode;
}

const RouteGuard: FC<RouteGuardProps> = ({ perm, children }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const hasPerm = useAuthStore((s) => s.hasPerm);

  if (user && !hasPerm(perm)) {
    return (
      <Result
        status="403"
        title="无权限"
        subTitle={`需要权限: ${perm}`}
        extra={
          <Button onClick={() => navigate("/")}>返回首页</Button>
        }
      />
    );
  }

  return <>{children}</>;
};

export default RouteGuard;
