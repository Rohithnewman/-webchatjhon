import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

// Order matters: tokens define the variables that base and every CSS Module
// consume, so it must be imported first.
import "./shared/styles/tokens.css";
import "./shared/styles/base.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
