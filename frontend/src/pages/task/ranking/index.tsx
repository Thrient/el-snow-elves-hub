import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Segmented, Empty, Spin } from "antd";
import { DownloadOutlined, LikeOutlined, TrophyOutlined, UserOutlined } from "@ant-design/icons";
import { taskApi } from "@/api/task";
import type { TaskItem } from "@/types";

const { Title } = Typography;

const MEDALS = [
  { emoji: "🥇", bg: "bg-[linear-gradient(135deg,#fffbf0,#fef5e0)]", border: "border-[#fde68a]", shadow: "0 8px 24px rgba(245,158,11,0.2)" },
  { emoji: "🥈", bg: "bg-[linear-gradient(135deg,#fafafa,#f0f0f5)]", border: "border-[#d4d4d8]", shadow: "0 6px 20px rgba(148,163,184,0.18)" },
  { emoji: "🥉", bg: "bg-[linear-gradient(135deg,#fdf6f2,#fef0e6)]", border: "border-[#f5d0b8]", shadow: "0 4px 16px rgba(214,161,86,0.18)" },
];

const PodiumCard: FC<{ task: TaskItem; index: number }> = ({ task, index }) => {
  const navigate = useNavigate();
  const m = MEDALS[index];

  return (
    <div onClick={() => navigate(`/market/${task.id}`)}
      className={`flex flex-col items-center cursor-pointer border border-solid rounded-3.5 transition-all duration-200 hover:-translate-y-1 ${m.bg} ${m.border}`}
      style={{ animation: `podium-in 0.5s ease-out ${index * 0.1}s both`, boxShadow: m.shadow }}>
      <div className="text-8 mt-4 mb-1" style={{ animation: "medal-shine 2s ease-in-out infinite", animationDelay: `${index * 0.3}s` }}>{m.emoji}</div>
      <div className="font-600 text-[#3d3630] text-[0.9375rem] px-4 text-center truncate max-w-full">{task.title}</div>
      <div className="text-[0.75rem] text-[#b8afa6] mt-1"><UserOutlined /> {task.author_name}</div>
      <div className="flex gap-4 mt-2 mb-4 text-[0.75rem] text-[#6b5e55]">
        <span className="flex items-center gap-0.5"><DownloadOutlined className="text-[#d4513b]" /> {task.download_count.toLocaleString()}</span>
        <span className="flex items-center gap-0.5"><LikeOutlined className="text-[#b8afa6]" /> {task.like_count.toLocaleString()}</span>
      </div>
    </div>
  );
};

const RowCard: FC<{ task: TaskItem; index: number }> = ({ task, index }) => {
  const navigate = useNavigate();
  return (
    <div onClick={() => navigate(`/market/${task.id}`)}
      className="flex items-center gap-3 py-3 px-4 rounded-2.5 cursor-pointer bg-white border border-solid border-[#e8e3dc] transition-all duration-150 hover:border-[#d4513b] hover:translate-x-0.5"
      style={{ animation: `rank-in 0.3s ease-out ${index * 0.03}s both` }}>
      <span className="text-[0.8125rem] font-700 text-[#b8afa6] w-8 text-center flex-shrink-0">#{index + 1}</span>
      <div className="flex-1 min-w-0">
        <div className="font-600 text-[#3d3630] text-[0.875rem] truncate">{task.title}</div>
        <div className="text-[0.7rem] text-[#b8afa6]"><UserOutlined /> {task.author_name}</div>
      </div>
      <span className="flex items-center gap-0.5 text-[0.75rem] text-[#6b5e55] flex-shrink-0">
        <DownloadOutlined className="text-[#d4513b]" /> {task.download_count.toLocaleString()}
      </span>
      <span className="flex items-center gap-0.5 text-[0.75rem] text-[#b8afa6] flex-shrink-0 ml-3">
        <LikeOutlined /> {task.like_count.toLocaleString()}
      </span>
    </div>
  );
};

const RankingPage: FC = () => {
  const [period, setPeriod] = useState<string>("all");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    taskApi.ranking(period).then(setTasks).finally(() => setLoading(false));
  }, [period]);

  const top3 = tasks.slice(0, 3);
  const rest = tasks.slice(3);

  return (
    <div className="w-[min(90%,60rem)] mx-auto pt-8">
      <style>{`
        @keyframes rank-in { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes podium-in { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes medal-shine { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.2); } }
      `}</style>

      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-0.75 h-5.5 rounded-0.5 bg-[linear-gradient(180deg,#f59e0b,#d97706)]" />
          <Title level={3} className="m-0! text-[#3d3630] font-700">
            <TrophyOutlined className="mr-2 text-[#f59e0b]" />排行榜
          </Title>
        </div>
        <Segmented value={period} onChange={(v) => setPeriod(v as string)}
          options={[{ value: "week", label: "周榜" }, { value: "month", label: "月榜" }, { value: "all", label: "总榜" }]} />
      </div>

      {loading ? (
        <div className="text-center py-20"><Spin size="large" /></div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20 rounded-4 bg-white border border-solid border-[#e8e3dc]"><Empty description="暂无数据" /></div>
      ) : (
        <>
          {top3.length > 0 && (
            <div className="grid grid-cols-3 gap-6 mb-14 pb-16 items-end overflow-visible">
              {/* #2 银 — 中等 */}
              <div className="translate-y-8">{top3[1] ? <PodiumCard task={top3[1]} index={1} /> : <div />}</div>
              {/* #1 金 — 最高 */}
              <div>{top3[0] ? <PodiumCard task={top3[0]} index={0} /> : <div />}</div>
              {/* #3 铜 — 最矮 */}
              <div className="translate-y-16">{top3[2] ? <PodiumCard task={top3[2]} index={2} /> : <div />}</div>
            </div>
          )}

          {rest.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {rest.map((task, idx) => (
                <RowCard key={task.id} task={task} index={idx + 3} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const page = "RankingPage";
export default RankingPage;
