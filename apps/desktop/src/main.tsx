import '@fontsource-variable/dm-sans';
import { TooltipProvider } from './components/ui/tooltip';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { App } from './App';
import { VoiceOverlay } from './components/overlay';
import { queryClient, useNativeEvents } from './lib/api';
import './styles.css';

const overlay = new URLSearchParams(location.search).get('window') === 'overlay';
const root = document.getElementById('root');

document.documentElement.className = overlay
  ? 'h-full min-w-0 overflow-hidden bg-transparent scheme-dark'
  : 'bg-canvas font-sans text-base text-ink antialiased scheme-light [font-synthesis:none] [text-rendering:optimizeLegibility]';

document.body.className = overlay
  ? 'm-0 h-full min-w-0 overflow-hidden bg-transparent'
  : 'm-0 min-w-[360px] bg-canvas';

root!.className = overlay ? 'h-full w-full overflow-hidden bg-transparent' : '';
if (overlay) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#171925');

function Root() {
  useNativeEvents();
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={500} skipDelayDuration={300}>
        {overlay ? <VoiceOverlay /> : <App />}
        {!overlay && (
          <Toaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              className:
                'border-line bg-surface font-sans text-ink [--normal-bg:theme(colors.surface)] [--normal-border:theme(colors.line)] [--normal-text:theme(colors.ink)]',
            }}
          />
        )}
      </TooltipProvider>
    </MotionConfig>
  );
}
ReactDOM.createRoot(root!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  </React.StrictMode>,
);
