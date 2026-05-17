/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ESCROW_ADDRESS?: string;
  readonly VITE_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      removeListener: (event: string, listener: (...args: unknown[]) => void) => void;
    };
  }
}

export {};
