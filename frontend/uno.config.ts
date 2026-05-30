import { defineConfig } from "unocss";

export default defineConfig({
  theme: {
    animation: {
      keyframes: {
        "rise-in": "{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:translateY(0)}}",
        "fade-in": "{from{opacity:0}to{opacity:1}}",
        "breathe": "{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.05);opacity:1}}",
      },
    },
  },
  rules: [
    [
      /^stagger-(\d+)$/,
      ([, n]) => ({ "animation-delay": `${Number(n) * 0.12}s` }),
    ],
  ],
  shortcuts: {
    "card-hover": "transition-all duration-300 hover:-translate-y-1 hover:shadow-lg",
  },
});
