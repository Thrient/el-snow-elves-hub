import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "virtual:uno.css";

// 全局样式：去掉 body 默认边距，修复右侧多余滚动条
const style = document.createElement("style");
style.textContent = `html, body { margin: 0; padding: 0; overflow-x: hidden; } #root { min-height: 100vh; }`;
document.head.appendChild(style);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
