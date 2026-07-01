import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, message } from "antd";
import { UserOutlined, MailOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "@/store/auth";
import { api } from "@/api/axios";
import { bus } from "@/event/bus";

type Mode = "login" | "register";

const PWD_MIN = 8;

const LoginPage: FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);
  const [form] = Form.useForm();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const [mode, setMode] = useState<Mode>("login");

  const toggle = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    form.resetFields();
  };

  const [verifyMsg, setVerifyMsg] = useState("");

  // 监听全局错误事件，检测"请先验证邮箱"提示
  useEffect(() => {
    const handler = (msg: string) => {
      if (msg === "请先验证邮箱后再登录") {
        setVerifyMsg(form.getFieldValue("email"));
      }
    };
    bus.on("app:error", handler);
    return () => bus.off("app:error", handler);
  }, []);

  const submit = async (values: { email: string; password: string; username?: string }) => {
    try {
      if (mode === "login") {
        await login(values.email, values.password);
        message.success("登录成功");
        navigate("/");
      } else {
        await register(values.username!, values.email, values.password);
        message.info("注册成功，请查收验证邮件");
        setMode("login");
      }
    } catch {
      // 错误已由 ErrorToast 全局显示
    }
  };

  const resendVerify = async () => {
    if (!verifyMsg) return;
    try {
      await api.post("/api/v1/auth/send-verification", { email: verifyMsg });
      message.success("验证邮件已重新发送，请查收");
      setVerifyMsg("");
    } catch { /* 错误由 ErrorToast 显示 */ }
  };

  const delay = (base: number) => ({ animation: `fadeUp .5s ${(base + (mode === "register" ? 0.05 : 0))}s both` });

  return (
    <div className="flex items-center justify-center bg-[#faf8f5]" style={{ minHeight: "calc(100vh - 100px)" }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulseDot { 0%,100% { opacity: .4; } 50% { opacity: 1; } }
        .login-input .ant-input {
          background: transparent; border: none; border-bottom: 1px solid #e0dbd4;
          border-radius: 0; padding: 10px 4px 10px 12px; font-size: 14px; color: #3d3630;
        }
        .login-input .ant-input:focus { border-bottom-color: #d4513b; box-shadow: none; }
        .login-input .ant-input-prefix { margin-right: 10px; color: #b8afa6; }
        .login-input .ant-form-item-explain-error { font-size: 0.6875rem; padding-left: 4px; }
      `}</style>

      <div className="flex w-[56.25rem] min-h-[35rem] rounded-4 overflow-hidden bg-white" style={{ boxShadow: "0 8px 40px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)" }}>

        {/* Left — brand */}
        <div className="w-[42%] flex-shrink-0 relative flex items-center justify-center overflow-hidden"
          style={{ background: "linear-gradient(160deg, #2a2520 0%, #3d3630 40%, #4a3a32 100%)" }}>
          <div className="relative z-1 p-12 flex flex-col gap-5 pointer-events-none">
            <div className="mb-2">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="8" fill="#d4513b" />
                <path d="M12 28V14l8 10 8-10v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h1 className="text-9 font-700 text-white m-0 tracking-[0.08em] leading-tight">时雪</h1>
              <p className="text-[0.75rem] text-[rgba(255,255,255,.45)] m-0 tracking-[0.24em]">WORKSHOP</p>
            </div>
            <p className="text-[0.875rem] text-[rgba(255,255,255,.65)] m-0 leading-7 tracking-[0.02em]">
              游戏自动化脚本社区<br />创作、分享、解放双手
            </p>
            <div className="flex gap-2 mt-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4513b]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4513b] opacity-30" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#d4513b] opacity-30" />
            </div>
          </div>
          <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
            <defs>
              <pattern id="grain" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.5" fill="#d4513b" opacity="0.06" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grain)" />
          </svg>
        </div>

        {/* Right — form */}
        <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white">
          <div className="w-full max-w-80" style={{ animation: "fadeUp .6s cubic-bezier(.16,1,.3,1)" }}>
            <div className="flex items-baseline gap-2 mb-8">
              <span onClick={toggle} className={`text-xl font-600 cursor-pointer transition-colors duration-200 ${mode === "login" ? "text-[#3d3630]" : "text-[#b8afa6]"}`}>登录</span>
              <span className="text-[#d9d2ca] text-base">/</span>
              <span onClick={toggle} className={`text-xl font-600 cursor-pointer transition-colors duration-200 ${mode === "register" ? "text-[#3d3630]" : "text-[#b8afa6]"}`}>注册</span>
            </div>

            <Form form={form} onFinish={submit} validateTrigger="onBlur">
              {mode === "register" && (
                <Form.Item
                  name="username"
                  className="login-input mb-1"
                  style={delay(0.1)}
                  rules={[
                    { required: true, message: "请输入用户名" },
                    { pattern: /^[^<>"'&/]*$/, message: "用户名包含非法字符" },
                  ]}
                >
                  <Input prefix={<UserOutlined />} placeholder="用户名" />
                </Form.Item>
              )}
              <Form.Item
                name="email"
                className="login-input mb-1"
                style={delay(mode === "register" ? 0.15 : 0.1)}
                rules={[
                  { required: true, message: "请输入邮箱" },
                  { type: "email", message: "邮箱格式不正确" },
                ]}
              >
                <Input prefix={<MailOutlined />} placeholder="邮箱"/>
              </Form.Item>
              <Form.Item
                name="password"
                className="login-input mb-1"
                style={delay(mode === "register" ? 0.2 : 0.15)}
                rules={[
                  { required: true, message: "请输入密码" },
                  { min: PWD_MIN, message: `密码至少 ${PWD_MIN} 位` },
                  () => ({
                    validator(_, v: string) {
                      if (!v) return Promise.resolve();
                      const kinds = (/[a-z]/.test(v) ? 1 : 0) + (/[A-Z]/.test(v) ? 1 : 0) + (/\d/.test(v) ? 1 : 0);
                      return kinds >= 2 ? Promise.resolve() : Promise.reject("需包含大小写字母、数字中至少两种");
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="密码"/>
              </Form.Item>

              <Form.Item style={delay(mode === "register" ? 0.25 : 0.2)}>
                <Button type="primary" htmlType="submit" block loading={loading}
                  className="mt-5 h-11 rounded-2 text-[0.875rem] font-600 tracking-[0.04em] border-none"
                  style={{ background: "#d4513b", boxShadow: "0 4px 16px rgba(212,81,59,.25)" }}>
                  {mode === "login" ? "登录" : "创建账号"}
                </Button>
              </Form.Item>
            </Form>

            {verifyMsg && (
              <p className="text-center mt-3 text-[0.75rem] text-[#b8afa6]">
                没收到验证邮件？
                <span onClick={resendVerify} className="text-[#d4513b] cursor-pointer ml-1 font-500">重新发送</span>
              </p>
            )}
            <p className="text-center mt-4 text-[0.75rem] text-[#b8afa6]" style={{ animation: "fadeIn .6s .3s both" }}>
              {mode === "login" ? "还没有账号？" : "已有账号？"}
              <span onClick={toggle} className="text-[#d4513b] cursor-pointer ml-1 font-500">{mode === "login" ? "立即注册" : "去登录"}</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};

export const page = "LoginPage";
export default LoginPage;
