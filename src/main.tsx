import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { onCLS, onINP, onLCP } from "web-vitals";
import App from "./App";
import { reportMetric } from "./utils/perf";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

[onLCP, onINP, onCLS].forEach((observe) =>
  observe((metric) =>
    reportMetric("web_vital", {
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
    }),
  ),
);

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
