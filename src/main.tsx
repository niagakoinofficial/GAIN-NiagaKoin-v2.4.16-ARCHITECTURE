import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';
import { initClientObservability, reportWebVital } from './services/observabilityService';

initClientObservability();
onCLS(reportWebVital);
onFCP(reportWebVital);
onINP(reportWebVital);
onLCP(reportWebVital);
onTTFB(reportWebVital);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
