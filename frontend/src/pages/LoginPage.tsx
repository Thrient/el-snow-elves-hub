import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Input, message } from "antd";
import { UserOutlined, MailOutlined, LockOutlined } from "@ant-design/icons";
import { useAuthStore } from "../store/auth";
import { isAxiosError } from "../api/utils";

type Mode = "login" | "register";

const LoginPage: FC = () => {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const loading = useAuthStore((s) => s.loading);

  // 已登录则跳回首页
  useEffect(() => {
    if (token) navigate("/", { replace: true });
  }, [token, navigate]);

  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });

  const toggle = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setForm({ username: "", email: "", password: "" });
  };

  const submit = async () => {
    if (!form.email || !form.password) return message.warning("请填写完整信息");
    if (mode === "register" && !form.username) return message.warning("请输入用户名");
    try {
      if (mode === "login") {
        await login(form.email, form.password);
      } else {
        await register(form.username, form.email, form.password);
      }
      message.success(mode === "login" ? "登录成功" : "注册成功");
      navigate("/");
    } catch (err: unknown) {
      const msg = isAxiosError(err) ? err.response?.data?.detail : "请求失败";
      message.error(msg || "请求失败");
    }
  };

  return (
    <div style={styles.wrapper}>
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
      `}</style>

      <div style={styles.container}>
        {/* Left — brand */}
        <div style={styles.left}>
          <div style={styles.leftInner}>
            <div style={styles.brandMark}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect width="40" height="40" rx="8" fill="#d4513b" />
                <path d="M12 28V14l8 10 8-10v14" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            <div style={styles.brand}>
              <h1 style={styles.title}>时雪</h1>
              <p style={styles.subtitle}>WORKSHOP</p>
            </div>

            <p style={styles.tagline}>
              游戏自动化脚本社区<br />
              创作、分享、解放双手
            </p>

            <div style={styles.dots}>
              <span style={styles.dot} />
              <span style={{ ...styles.dot, opacity: 0.3 }} />
              <span style={{ ...styles.dot, opacity: 0.3 }} />
            </div>
          </div>

          <svg style={styles.bgPattern} width="100%" height="100%">
            <defs>
              <pattern id="g" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="0.5" fill="#d4513b" opacity="0.06" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)" />
          </svg>
        </div>

        {/* Right — form */}
        <div style={styles.right}>
          <div style={{ ...styles.formCard, animation: "fadeUp .6s cubic-bezier(.16,1,.3,1)" }}>
            <div style={styles.formHeader}>
              <span
                onClick={toggle}
                style={{ ...styles.tab, ...(mode === "login" ? styles.tabActive : {}) }}
              >登录</span>
              <span style={styles.tabSep}>/</span>
              <span
                onClick={toggle}
                style={{ ...styles.tab, ...(mode === "register" ? styles.tabActive : {}) }}
              >注册</span>
            </div>

            <div style={styles.formBody}>
              {mode === "register" && (
                <div className="login-input" style={{ ...styles.inputGroup, animation: "fadeUp .5s .1s both" }}>
                  <Input
                    prefix={<UserOutlined />}
                    placeholder="用户名"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    onPressEnter={submit}
                  />
                </div>
              )}
              <div className="login-input" style={{ ...styles.inputGroup, animation: `fadeUp .5s ${mode === "register" ? ".15s" : ".1s"} both` }}>
                <Input
                  prefix={<MailOutlined />}
                  placeholder="邮箱"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onPressEnter={submit}
                />
              </div>
              <div className="login-input" style={{ ...styles.inputGroup, animation: `fadeUp .5s ${mode === "register" ? ".2s" : ".15s"} both` }}>
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="密码"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onPressEnter={submit}
                />
              </div>

              <Button
                type="primary"
                block
                loading={loading}
                onClick={submit}
                style={{ ...styles.submitBtn, animation: `fadeUp .5s ${mode === "register" ? ".25s" : ".2s"} both` }}
              >
                {mode === "login" ? "登录" : "创建账号"}
              </Button>

              <p style={{ ...styles.switchHint, animation: "fadeIn .6s .3s both" }}>
                {mode === "login" ? "还没有账号？" : "已有账号？"}
                <span onClick={toggle} style={styles.switchLink}>
                  {mode === "login" ? "立即注册" : "去登录"}
                </span>
              </p>
            </div>
          </div>

          <p style={{ ...styles.footerNote, animation: "fadeIn .8s .5s both" }}>
            <span style={{ ...styles.footerDot, animation: "pulseDot 2s infinite" }} />
            已部署至 NAS · 数据安全可控
          </p>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "calc(100vh - 100px)", background: "#faf8f5",
    fontFamily: `"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif`,
  },
  container: {
    display: "flex", width: 900, minHeight: 560,
    borderRadius: 16, overflow: "hidden",
    boxShadow: "0 8px 40px rgba(0,0,0,.06), 0 1px 3px rgba(0,0,0,.04)",
    background: "#fff",
  },
  left: {
    flex: "0 0 42%", position: "relative",
    background: "linear-gradient(160deg, #2a2520 0%, #3d3630 40%, #4a3a32 100%)",
    display: "flex", alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  leftInner: {
    position: "relative", zIndex: 1, padding: 48,
    display: "flex", flexDirection: "column", gap: 20,
  },
  bgPattern: { position: "absolute", inset: 0, pointerEvents: "none" },
  brandMark: { marginBottom: 8 },
  brand: { display: "flex", flexDirection: "column" as const, gap: 0 },
  title: {
    fontSize: 36, fontWeight: 700, color: "#fff", margin: 0,
    letterSpacing: "0.08em", lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 12, color: "rgba(255,255,255,.45)", margin: 0,
    letterSpacing: "0.24em",
  },
  tagline: {
    fontSize: 14, color: "rgba(255,255,255,.65)", margin: 0,
    lineHeight: 1.8, letterSpacing: "0.02em",
  },
  dots: { display: "flex", gap: 8, marginTop: 8 },
  dot: { width: 6, height: 6, borderRadius: "50%", background: "#d4513b" },
  right: {
    flex: 1, display: "flex", flexDirection: "column" as const,
    alignItems: "center", justifyContent: "center", padding: 48,
    background: "#fff",
  },
  formCard: { width: "100%", maxWidth: 320 },
  formHeader: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 32 },
  tab: {
    fontSize: 20, fontWeight: 600, color: "#b8afa6",
    cursor: "pointer", transition: "color .2s",
    background: "none", border: "none", padding: 0,
  },
  tabActive: { color: "#3d3630" },
  tabSep: { color: "#d9d2ca", fontSize: 16 },
  formBody: { display: "flex", flexDirection: "column" as const, gap: 8 },
  inputGroup: { marginBottom: 4 },
  submitBtn: {
    marginTop: 20, height: 44, borderRadius: 8,
    background: "#d4513b", border: "none",
    fontSize: 14, fontWeight: 600, letterSpacing: "0.04em",
    boxShadow: "0 4px 16px rgba(212,81,59,.25)",
  },
  switchHint: { textAlign: "center" as const, marginTop: 16, fontSize: 12, color: "#b8afa6" },
  switchLink: { color: "#d4513b", cursor: "pointer", marginLeft: 4, fontWeight: 500 },
  footerNote: { marginTop: 32, fontSize: 11, color: "#c4bbb2", display: "flex", alignItems: "center", gap: 6 },
  footerDot: { width: 6, height: 6, borderRadius: "50%", background: "#52c41a", display: "inline-block" },
};

export default LoginPage;
