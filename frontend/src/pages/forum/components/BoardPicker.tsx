import type { FC } from "react";
import { MessageOutlined } from "@ant-design/icons";
import type { ForumBoard } from "@/types";

interface Props {
  boards: ForumBoard[];
  selected: number;
  onChange: (id: number) => void;
}

const BoardPicker: FC<Props> = ({ boards, selected, onChange }) => (
  <div className="mb-5">
    <div className="text-[0.8125rem] font-600 text-[#3d3630] mb-2.5">
      发布到 <span className="text-[#d4513b]">*</span>
    </div>
    <div className="flex gap-2 flex-wrap">
      {boards.map((b) => (
        <div
          key={b.id}
          onClick={() => onChange(b.id)}
          className={`py-2 px-4.5 rounded-2.5 cursor-pointer text-[0.8125rem] font-500 transition-all duration-150 border border-solid ${
            selected === b.id
              ? "bg-[#fef3ef] text-[#d4513b] border-[#f5c6b8]"
              : "bg-[#f5f2ee] text-[#6b5e55] border-transparent hover:bg-[#faf6f2] hover:border-[#e8e3dc]"
          }`}
        >
          <MessageOutlined className="mr-1.5 text-[0.75rem]" />
          {b.name}
        </div>
      ))}
    </div>
  </div>
);

export default BoardPicker;
