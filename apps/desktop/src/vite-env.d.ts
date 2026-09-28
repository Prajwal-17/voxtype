/// <reference types="vite/client" />

import type { QueryClient } from '@tanstack/react-query';

declare global {
  interface ImportMetaEnv {
    readonly VITE_VOXTYPE_ENV?: 'development' | 'production';
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    __VOXTYPE_QUERY_CLIENT__?: QueryClient;
  }
}

export {};
