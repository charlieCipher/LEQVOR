import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/tokens.css";
import "./styles/globals.css";
import "./styles/reference.css";
import "./styles/screens.css";
import "./styles/insurance.css";
import "./styles/preferences.css";
import "./styles/secure-entry.css";
import "./styles/devices.css";
import "./styles/legal.css";

// Opt-in local acceptance tooling; Vite removes this branch from production.
if (import.meta.env.DEV && ['127.0.0.1', 'localhost'].includes(location.hostname) &&
    new URLSearchParams(location.search).get('a11y') === '1') {
  import('../scripts/frontend-audit-client.js');
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
