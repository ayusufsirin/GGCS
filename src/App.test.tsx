import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { SensorSuiteCompatibilityAccess } from './runtime/sensor-suite-application';

jest.mock('./bootstrap', () => ({
  Dashboard: () => <div>GGCS dashboard</div>,
}));

const runtimeAccess: SensorSuiteCompatibilityAccess = {
  runtimeState: () => 'running',
  resolvePort: () => undefined,
  resolveCapability: () => undefined,
  resourceForPort: () => undefined,
  resourceForCapability: () => undefined,
};

test('renders the existing Dashboard beneath the temporary Runtime access provider', () => {
  render(<App runtimeCompatibility={runtimeAccess} />);
  expect(screen.getByText('GGCS dashboard')).toBeInTheDocument();
});
