import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { resolveRosbridgeUrl } from './runtime/rosbridge-url';
import { createSensorSuiteWebApplication } from './runtime/sensor-suite-application';

async function startWebApplication() {
  const application = createSensorSuiteWebApplication({
    rosbridgeUrl: resolveRosbridgeUrl({
      envUrl: process.env.REACT_APP_GGCS_ROSBRIDGE_URL,
    }),
  });

  // M05 removes the legacy/shadow rollback stack: Runtime startup is now the
  // sole application backend and failures are surfaced rather than bypassed.
  await application.start();

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
