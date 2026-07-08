// Site-wide floating Spotify mini-player for Radiohead's "Let Down" — the
// song the blog is named after. Mounted once, outside the router-controlled
// #app container (same convention as terminal.ts), so once switched on from
// the blog page it keeps floating through in-app navigation until closed.
// The iframe itself is only created on first toggle-on, not at page load.

const TRACK_ID = "4aOAzvRdOsZSwZIgwcdeL0"; // Radiohead — Let Down (OK Computer)

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .spotify-float {
      position: fixed;
      left: 1.2rem;
      bottom: 1.2rem;
      z-index: 90;
      width: min(320px, calc(100vw - 2.4rem));
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.35);
      background: #121212;
      animation: spotify-float-in 0.2s ease;
    }
    .spotify-float iframe { display: block; width: 100%; height: 152px; border: 0; }
    .spotify-float-close {
      position: absolute;
      top: 0.35rem;
      right: 0.35rem;
      z-index: 1;
      width: 1.5rem;
      height: 1.5rem;
      border: none;
      border-radius: 50%;
      background: rgba(0,0,0,0.7);
      color: #fff;
      font-size: 0.9rem;
      line-height: 1;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .spotify-float-close:hover { background: rgba(0,0,0,0.9); }
    @keyframes spotify-float-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    @media (max-width: 480px) {
      .spotify-float { left: 0.7rem; bottom: 0.7rem; }
    }
  `;
  document.head.appendChild(style);
}

let widget: HTMLElement | null = null;

function open(): void {
  if (widget) return;
  injectStyles();
  widget = document.createElement("div");
  widget.className = "spotify-float";
  widget.innerHTML = `
    <button type="button" class="spotify-float-close" aria-label="Close player">&times;</button>
    <iframe
      src="https://open.spotify.com/embed/track/${TRACK_ID}?utm_source=generator&theme=0"
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      loading="lazy"
      title="Radiohead — Let Down, on Spotify"
    ></iframe>`;
  widget.querySelector(".spotify-float-close")?.addEventListener("click", close);
  document.body.appendChild(widget);
}

function close(): void {
  widget?.remove();
  widget = null;
}

export function isSpotifyPlayerOpen(): boolean {
  return widget !== null;
}

export function toggleSpotifyPlayer(): boolean {
  if (widget) {
    close();
    return false;
  }
  open();
  return true;
}
