import type { FC } from "react";
import { InboxOutlined, InfoCircleOutlined, CloudUploadOutlined } from "@ant-design/icons";

const STEPS = [
  { num: 1, label: "选择文件", icon: <InboxOutlined /> },
  { num: 2, label: "填写信息", icon: <InfoCircleOutlined /> },
  { num: 3, label: "发布", icon: <CloudUploadOutlined /> },
];

interface Props { step: number }

const StepIndicator: FC<Props> = ({ step }) => (
  <div className="flex gap-2 mb-6 p-1.5 rounded-3 bg-[#f5f2ee]">
    {STEPS.map((s) => {
      const active = step === s.num;
      const done = step > s.num;
      return (
        <div key={s.num} className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2.5 text-[0.8125rem] font-500 transition-all duration-300 ${
          active ? "bg-white text-[#d4513b]" : done ? "bg-transparent text-[#22c55e]" : "bg-transparent text-[#b8afa6]"
        }`} style={{ boxShadow: active ? "0 1px 3px rgba(0,0,0,0.06)" : "none" }}>
          <span className={`inline-flex items-center justify-center w-5.5 h-5.5 rounded-full text-[0.6875rem] font-700 ${
            done ? "bg-[#f0fdf4] text-[#22c55e]" : active ? "bg-[#fef3ef] text-[#d4513b]" : "bg-[#f5f2ee] text-[#c4bbb2]"
          }`}>
            {done ? "✓" : s.num}
          </span>
          {s.label}
        </div>
      );
    })}
  </div>
);

export default StepIndicator;
