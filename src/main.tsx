import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider } from '@mantine/core';
import { provideGlobalGridOptions } from 'ag-grid-community';
import '@mantine/core/styles.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import './styles/tokens.css';
import './styles/layout.css';
import './styles/tasks.css';
import { theme } from './theme';
import App from './App';
import { initAndroidBackButton } from './androidBack';
import './largeFont';

// CSS file themes (ag-theme-quartz) — keep legacy theming vs Theming API default.
provideGlobalGridOptions({ theme: 'legacy' });

void initAndroidBackButton();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="light" forceColorScheme="light">
      <App />
    </MantineProvider>
  </StrictMode>,
);
