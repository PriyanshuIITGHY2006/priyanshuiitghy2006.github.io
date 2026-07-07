/// <reference types="vite/client" />

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          events?: {
            onReady?: (event: { target: unknown }) => void;
            onStateChange?: (event: { data: number; target: unknown }) => void;
          };
        }
      ) => unknown;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export {};
