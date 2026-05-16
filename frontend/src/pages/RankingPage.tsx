import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Segmented, Empty, Spin } from "antd";
import { DownloadOutlined, LikeOutlined, TrophyOutlined, UserOutlined } from "@ant-design/icons";
import { taskApi, type TaskItem } from "../api/tasks";

const { Title } = Typography;

const medals = [
  { emoji: "🥇", gradient: "linear-gradient(135deg, #f59e0b, #d97706)", glow: "0 0 20px rgba(245,158,11,0.3)" },
  { emoji: "🥈", gradient: "linear-gradient(135deg, #94a3b8, #64748b)", glow: "0 0 16px rgba(148,163,184,0.25)" },
  { emoji: "🥉", gradient: "linear-gradient(135deg, #d6a156, #b87c2c)", glow: "0 0 14px rgba(214,161,86,0.25)" },
];

const rankKeyframes = `
@keyframes rank-in {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes medal-shine {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}
`;

const RankingPage: FC = () => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<string>("all");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    taskApi.ranking(period).then(setTasks).finally(() => setLoading(false));
  }, [period]);

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <style>{rankKeyframes}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 3, height: 22, borderRadius: 2, background: "linear-gradient(180deg, #f59e0b, #d97706)" }} />
          <Title level={3} style={{ color: "#3d3630", margin: 0, fontWeight: 700 }}>
            <TrophyOutlined style={{ marginRight: 8, color: "#f59e0b" }} />
            排行榜
          </Title>
        </div>
        <Segmented
          value={period}
          onChange={(v) => setPeriod(v as string)}
          options={[
            { value: "week", label: "周榜" },
            { value: "month", label: "月榜" },
            { value: "all", label: "总榜" },
          ]}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 80 }}><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <div style={{
          textAlign: "center", padding: 80, borderRadius: 16,
          background: "#fff", border: "1px solid #e8e3dc",
        }}>
          <Empty description="暂无数据" />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {tasks.map((task, idx) => {
            const medal = idx < 3 ? medals[idx] : null;
            return (
              <div
                key={task.id}
                onClick={() => navigate(`/market/${task.id}`)}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: medal ? "18px 22px" : "14px 20px",
                  borderRadius: 14,
                  background: medal ? "linear-gradient(135deg, #fffbf5, #fff8ed)" : "#fff",
                  border: medal ? "1px solid #fde68a" : "1px solid #e8e3dc",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  animation: `rank-in 0.35s ease-out ${idx * 0.04}s both`,
                  position: "relative" as const,
                  boxShadow: medal ? medal.glow : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = medal ? "#f59e0b" : "#d4513b";
                  e.currentTarget.style.transform = "translateX(4px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = medal ? "#fde68a" : "#e8e3dc";
                  e.currentTarget.style.transform = "translateX(0)";
                }}
              >
                {/* Rank number / medal */}
                <div style={{
                  width: 40, textAlign: "center", fontSize: medal ? 28 : 15,
                  fontWeight: 700, color: medal ? undefined : "#b8afa6",
                  flexShrink: 0,
                  animation: medal ? "medal-shine 2s ease-in-out infinite" : undefined,
                }}>
                  {medal ? medal.emoji : `#${idx + 1}`}
                </div>

                {/* Task info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: 600, color: "#3d3630", fontSize: 15,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    marginBottom: 3,
                  }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#b8afa6", display: "flex", alignItems: "center", gap: 6 }}>
                    <UserOutlined /> {task.author_name}
                    <span style={{ color: "#d9cfc4" }}>·</span>
                    {task.category}
                    <span style={{ color: "#d9cfc4" }}>·</span>
                    v{task.version}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: "flex", gap: 18, color: "#6b5e55", fontSize: 13, flexShrink: 0 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}>
                    <DownloadOutlined style={{ color: "#d4513b" }} /> {task.download_count.toLocaleString()}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <LikeOutlined style={{ color: "#b8afa6" }} /> {task.like_count.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RankingPage;
