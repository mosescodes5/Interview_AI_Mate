/// <reference types="vite/client" />


declare global {
  interface Window {
    electronAPI?: {
      setContentProtection: (enabled: boolean) => Promise<boolean>;
      getContentProtection: () => Promise<boolean>;
    };
  }
}

export {};
