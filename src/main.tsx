import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { DizaWebGate } from "./components/DizaWebGate";
import { ThemeProvider } from "./lib/theme";
import "@fontsource-variable/inter";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <DizaWebGate>
        <App />
      </DizaWebGate>
    </ThemeProvider>
  </StrictMode>,
);
