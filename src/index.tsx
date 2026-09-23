import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { parseSensorSuiteBackendMode } from './runtime/backend-mode';
import { resolveRosbridgeUrl } from './runtime/rosbridge-url';
import { createSensorSuiteWebApplication } from './runtime/sensor-suite-application';

async function startWebApplication() {
  const mode = parseSensorSuiteBackendMode(process.env.REACT_APP_GGCS_BACKEND_MODE);
  const application = createSensorSuiteWebApplication({
    mode,
    rosbridgeUrl: resolveRosbridgeUrl({
      envUrl: process.env.REACT_APP_GGCS_ROSBRIDGE_URL,
    }),
  });

  // Shadow Runtime failure must not take down the authoritative legacy UI.
  // compat-read/full are authoritative for their mapped Runtime paths, so
  // startup never silently falls back to legacy. Rollback is mode + restart.
  try {
    await application.start();
  } catch (error) {
    if (mode !== 'shadow') throw error;
    console.error('GGCS shadow Runtime failed to start; continuing with legacy UI', error);
  }

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );

  root.render(
    <React.StrictMode>
      <App runtimeCompatibility={application.compatibility} />
    </React.StrictMode>
  );

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    root.unmount();
    void application.stop().catch((error) => {
      console.error('GGCS Runtime shutdown failed', error);
    });
  };
  window.addEventListener('pagehide', shutdown, { once: true });
}

void startWebApplication().catch((error) => {
  console.error('GGCS Web application failed to start', error);
});

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
