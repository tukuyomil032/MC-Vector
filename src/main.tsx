import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { useI18nStore } from './i18n';
import { ToastProvider } from './renderer/components/ToastProvider';
import './styles/index.scss';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

async function bootstrap() {
  await useI18nStore.getState().initLocale();

  root.render(
    <React.StrictMode>
      <ToastProvider>
        <App />
      </ToastProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
