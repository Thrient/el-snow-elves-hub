import { useEffect, useState, type FC } from "react";
import { useNavigate } from "react-router-dom";
import { Typography, Spin, Empty, Input } from "antd";
import { MessageOutlined, RightOutlined, FileTextOutlined } from "@ant-design/icons";
import { forumApi } from "@/api/forum";
import type { ForumBoard } from "@/types";

const { Title } = Typography;

const ForumPage: FC = () => {
  const navigate = useNavigate();
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    forumApi.listBoards().then(setBoards).finally(() => setLoading(false));
  }, []);

  const handleSearch = (value: string) => {
    if (value.trim()) {
      navigate(`/forum/search?q=${encodeURIComponent(value.trim())}`);
    }
  };

  if (loading) {
    return <div className="text-center py-20"><Spin size="large" /></div>;
  }

  return (
    <div className="w-full max-w-[1600px] mx-auto pt-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-0.75 h-5.5 rounded-0.5 bg-[linear-gradient(180deg,#d4513b,#e87a5a)]" />
          <Title level={2} className="m-0! text-[#3d3630] text-[1.375rem] font-700">
            社区论坛
          </Title>
        </div>
        <Input.Search
          placeholder="搜索帖子..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onSearch={handleSearch}
          className="w-55 rounded-2"
        />
      </div>

      {boards.length === 0 ? (
        <Empty description="暂无板块" className="py-15" />
      ) : (
        <div className="flex flex-col gap-2.5">
          {boards.map((board) => (
            <div
              key={board.id}
              onClick={() => navigate(`/forum/${board.id}`)}
              className="p-5 px-6 rounded-3.5 cursor-pointer bg-white border border-solid border-[#e8e3dc] flex items-center gap-4 transition-all duration-200 hover:border-[#d4513b] hover:translate-x-1 hover:shadow-[0_4px_16px_rgba(212,81,59,0.08)]"
            >
              <div className="w-11 h-11 rounded-3 flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#fef3ef,#fdf6ef)]">
                <MessageOutlined className="text-xl text-[#d4513b]" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="font-600 text-[0.9375rem] text-[#3d3630] mb-1">
                  {board.name}
                </div>
                <div className="text-[0.75rem] text-[#b8afa6]">{board.description || ""}</div>
              </div>

              <div className="flex items-center gap-1 text-[0.75rem] text-[#b8afa6] flex-shrink-0">
                <FileTextOutlined />
                <span>{board.thread_count}</span>
                <RightOutlined className="ml-1 text-[0.625rem]" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const page = "ForumPage";
export default ForumPage;
