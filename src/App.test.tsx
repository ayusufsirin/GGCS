import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';
import type { SensorSuiteCompatibilityAccess } from './runtime/sensor-suite-application';

jest.mock('./bootstrap', () => ({
  Dashboard: () => <div>GGCS dashboard</div>,
}));

const legacyAccess: SensorSuiteCompatibilityAccess = {
  mode: 'legacy',
  runtimeEnabled: false,
  runtimeState: () => 'disabled',
  resolvePort: () => undefined,
  resolveCapability: () => undefined,
  resourceForPort: () => undefined,
  resourceForCapability: () => undefined,
};

test('renders the existing Dashboard beneath the M04 compatibility provider', () => {
  render(<App runtimeCompatibility={legacyAccess} />);
  expect(screen.getByText('GGCS dashboard')).toBeInTheDocument();
});
