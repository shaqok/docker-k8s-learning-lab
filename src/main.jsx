import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { LanguageProvider } from './i18n/LanguageContext.jsx';
import { ProgressProvider } from './context/ProgressContext.jsx';
import { RouteProvider } from './context/RouteContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ProgressProvider>
        <RouteProvider>
          <App />
        </RouteProvider>
      </ProgressProvider>
    </LanguageProvider>
  </React.StrictMode>,
);
