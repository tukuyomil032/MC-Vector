import { loader } from '@monaco-editor/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as monaco from 'monaco-editor';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import { useI18nStore } from './i18n';
import { ToastProvider } from './renderer/components/ToastProvider';
import './styles/index.scss';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

loader.config({ monaco });

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

async function bootstrap() {
  await useI18nStore.getState().initLocale();

  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <App />
          <Toaster position="bottom-right" richColors />
        </ToastProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
