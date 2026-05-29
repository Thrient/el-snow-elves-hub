import { defineConfig } from "unocss";

export default defineConfig({
  theme: {
    animation: {
      keyframes: {
        "rise-in": "{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}",
        "breathe": "{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.05);opacity:1}}",
      },
    },
  },
  rules: [
    [
      /^stagger-(\d+)$/,
      ([, n]) => ({ "animation-delay": `${Number(n) * 0.1}s` }),
    ],
  ],
  shortcuts: {
    "badge-gold": "bg-[linear-gradient(135deg,#f59e0b,#d97706)]",
    "badge-silver": "bg-[linear-gradient(135deg,#94a3b8,#64748b)]",
    "badge-bronze": "bg-[linear-gradient(135deg,#d6a156,#b87c2c)]",
    "badge-default": "bg-[rgba(0,0,0,0.5)]",
  },
});
