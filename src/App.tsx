import React from 'react';
import './App.css';
import { Dashboard } from "./bootstrap";
import { RuntimeCompatibilityProvider } from "./runtime/compatibility-context";
import type { SensorSuiteCompatibilityAccess } from "./runtime/sensor-suite-application";

export interface AppProps {
  readonly runtimeCompatibility: SensorSuiteCompatibilityAccess;
}

function App({ runtimeCompatibility }: AppProps) {
  return (
    <RuntimeCompatibilityProvider access={runtimeCompatibility}>
      <div className="App">
        <Dashboard/>
      </div>
    </RuntimeCompatibilityProvider>
  );
}

export default App;
