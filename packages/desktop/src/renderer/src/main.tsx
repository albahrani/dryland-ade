import { createRoot } from "react-dom/client";
import type { DrylandApi } from "../../shared/api.ts";
import { App } from "./App.tsx";
import "./styles.css";

declare global {
  interface Window {
    dryland: DrylandApi;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
