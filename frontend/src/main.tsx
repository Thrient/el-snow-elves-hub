import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "virtual:uno.css";

// 全局样式：去掉 body 默认边距，修复右侧多余滚动条
const style = document.createElement("style");
style.textContent = `
  html, body { margin: 0; padding: 0; }
  #root { min-height: 100vh; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #d4c8bc; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #b8a89a; }
  ::-webkit-scrollbar-corner { background: transparent; }
`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
