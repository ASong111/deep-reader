import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n"; // 导入 i18n 配置
import "./index.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
