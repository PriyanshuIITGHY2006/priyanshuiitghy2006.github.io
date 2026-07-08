// Site-wide background-audio player for Radiohead's "Let Down" — the song
// the blog is named after. Plays the official remastered upload (OK Computer
// OKNOTOK reissue, "provided to YouTube by Beggars Group / XL Recordings")
// through YouTube's own IFrame Player API, embedded in a visually hidden
// iframe so only the audio is heard, no video shown. Mounted once, outside
// the router-controlled #app container, so playback survives in-app
// navigation until paused.

const VIDEO_ID = "ZVgHPSyEIqk"; // Radiohead — Let Down (Remastered), official audio

let apiPromise: Promise<typeof window.YT> | null = null;
function loadApi(): Promise<typeof window.YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return apiPromise;
}

let player: InstanceType<typeof window.YT.Player> | null = null;
let playing = false;
let listeners: Array<(playing: boolean) => void> = [];

function setPlaying(next: boolean): void {
  playing = next;
  listeners.forEach((cb) => cb(playing));
}

export function isBgAudioPlaying(): boolean {
  return playing;
}

export function onBgAudioChange(cb: (playing: boolean) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export async function toggleBgAudio(): Promise<void> {
  if (player) {
    if (playing) player.pauseVideo();
    else player.playVideo();
    return;
  }

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
  document.body.appendChild(host);

  const YT = await loadApi();
  player = new YT.Player(host, {
    videoId: VIDEO_ID,
    playerVars: { autoplay: 1, controls: 0, playsinline: 1 },
    events: {
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) setPlaying(true);
        else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) setPlaying(false);
      },
    },
  });
}
