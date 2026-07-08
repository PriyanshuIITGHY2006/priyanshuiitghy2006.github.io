// Site-wide floating "ask about Priyanshu" chat widget. Mounted once outside
// the router-controlled #app container (same convention as terminal.ts and
// bg-audio.ts) so it's available — and keeps its conversation — on every
// page. A round toggle button opens a small chat panel; verification
// (Turnstile) only has to happen once per session, same pattern as the
// runnable-code panels.

import {
  askAssistant,
  getAssistantSession,
  setAssistantSession,
  clearAssistantSession,
  VerificationRequiredError,
  type ChatTurn,
} from "./assistant";
import { renderTurnstileWidget, getTurnstileToken } from "./turnstile";

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.textContent = `
    .assistant-fab {
      position: fixed;
      right: 1.4rem;
      bottom: 1.4rem;
      z-index: 95;
      width: 3.2rem;
      height: 3.2rem;
      border-radius: 50%;
      border: 0.6px solid var(--border-strong);
      background: var(--bg-card);
      color: var(--ink);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 6px 18px var(--shadow);
      transition: border-color 0.14s ease, background 0.14s ease, transform 0.14s ease;
    }
    .assistant-fab:hover { background: var(--bg-hover); border-color: var(--ink); }
    .assistant-fab svg { width: 1.35rem; height: 1.35rem; }
    .assistant-fab.assistant-open { transform: scale(0.94); }

    .assistant-panel {
      position: fixed;
      right: 1.4rem;
      bottom: 5.2rem;
      z-index: 95;
      width: min(370px, calc(100vw - 2rem));
      height: min(min(70vh, 34rem), calc(100vh - 7rem));
      background: var(--bg-card);
      border: 0.6px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 16px 44px var(--shadow);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: var(--cm);
      animation: assistant-pop-in 0.16s ease;
    }
    @keyframes assistant-pop-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }

    .assistant-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.7rem 0.9rem;
      border-bottom: 0.6px solid var(--border);
      background: var(--bg-inset);
    }
    .assistant-head-title { font-weight: 700; font-size: 0.92em; color: var(--ink); }
    .assistant-head-sub { font-size: 0.72em; color: var(--muted-2); margin-top: 0.1rem; }
    .assistant-close {
      border: none;
      background: transparent;
      color: var(--muted);
      font-size: 1.15em;
      line-height: 1;
      cursor: pointer;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
    }
    .assistant-close:hover { color: var(--ink); background: var(--bg-hover); }

    .assistant-messages {
      flex: 1;
      overflow-y: auto;
      padding: 0.8rem 0.8rem;
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }
    .assistant-msg { max-width: 86%; font-size: 0.86em; line-height: 1.5; padding: 0.5em 0.75em; border-radius: 10px; white-space: pre-wrap; word-break: break-word; }
    .assistant-msg-user { align-self: flex-end; background: var(--ink); color: var(--bg); border-bottom-right-radius: 3px; }
    .assistant-msg-bot { align-self: flex-start; background: var(--bg-inset); color: var(--ink); border: 0.6px solid var(--border); border-bottom-left-radius: 3px; }
    .assistant-msg-error { align-self: center; color: var(--danger-ink); background: var(--danger-bg); border: 0.6px solid var(--danger-border); font-size: 0.8em; }

    .assistant-typing { align-self: flex-start; display: flex; gap: 0.25em; padding: 0.6em 0.8em; }
    .assistant-typing span {
      width: 0.4em; height: 0.4em; border-radius: 50%; background: var(--muted-2);
      animation: assistant-bounce 1.1s infinite ease-in-out;
    }
    .assistant-typing span:nth-child(2) { animation-delay: 0.15s; }
    .assistant-typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes assistant-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.5; } 30% { transform: translateY(-3px); opacity: 1; } }

    .assistant-verify { padding: 0.6rem 0.8rem; border-top: 0.6px solid var(--border); }
    .assistant-verify-note { font-size: 0.76em; color: var(--muted-2); margin: 0 0 0.4rem; }

    .assistant-inputrow { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.65rem 0.7rem; border-top: 0.6px solid var(--border); }
    .assistant-input {
      flex: 1;
      resize: none;
      max-height: 5.5rem;
      font-family: inherit;
      font-size: 0.86em;
      padding: 0.45em 0.7em;
      border: 0.6px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--ink);
    }
    .assistant-input:focus { outline: none; border-color: var(--border-strong); }
    .assistant-send {
      flex-shrink: 0;
      width: 2.2rem;
      height: 2.2rem;
      border-radius: 50%;
      border: none;
      background: var(--ink);
      color: var(--bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .assistant-send:disabled { opacity: 0.4; cursor: default; }
    .assistant-send svg { width: 1rem; height: 1rem; }

    .assistant-foot { padding: 0.35rem 0.8rem 0.6rem; font-size: 0.68em; color: var(--muted-2); text-align: center; }

    @media (max-width: 480px) {
      .assistant-panel { right: 0.6rem; left: 0.6rem; width: auto; bottom: 4.8rem; height: min(72vh, 30rem); }
      .assistant-fab { right: 1rem; bottom: 1rem; }
    }
  `;
  document.head.appendChild(style);
}

const CHAT_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;
const CLOSE_ICON = "&times;";
const SEND_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;

let panelOpen = false;
let panelEl: HTMLElement | null = null;
let fabEl: HTMLButtonElement | null = null;
let history: ChatTurn[] = [];
let greeted = false;

function appendMessage(container: HTMLElement, role: "user" | "bot" | "error", text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `assistant-msg assistant-msg-${role}`;
  el.textContent = text;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

function buildPanel(): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "assistant-panel";
  panel.innerHTML = `
    <div class="assistant-head">
      <div>
        <div class="assistant-head-title">Ask about Priyanshu</div>
        <div class="assistant-head-sub">résumé, projects, and blog — grounded in this site</div>
      </div>
      <button type="button" class="assistant-close" aria-label="Close">${CLOSE_ICON}</button>
    </div>
    <div class="assistant-messages" id="assistant-messages"></div>
    <div class="assistant-verify" id="assistant-verify" hidden>
      <p class="assistant-verify-note">Quick check that you're human before we continue:</p>
      <div class="cf-turnstile" data-sitekey="${import.meta.env.VITE_TURNSTILE_SITE_KEY}"></div>
    </div>
    <div class="assistant-inputrow">
      <textarea class="assistant-input" id="assistant-input" rows="1" placeholder="Ask a question…" maxlength="500"></textarea>
      <button type="button" class="assistant-send" id="assistant-send" aria-label="Send">${SEND_ICON}</button>
    </div>
    <p class="assistant-foot">Answers are grounded in this site's content. Nothing you type is stored.</p>
  `;
  return panel;
}

function closePanel(): void {
  panelEl?.remove();
  panelEl = null;
  panelOpen = false;
  fabEl?.classList.remove("assistant-open");
}

function openPanel(): void {
  if (panelOpen) return;
  injectStyles();
  panelOpen = true;
  fabEl?.classList.add("assistant-open");

  const panel = buildPanel();
  panelEl = panel;
  document.body.appendChild(panel);

  const messagesEl = panel.querySelector<HTMLElement>("#assistant-messages")!;
  const verifyEl = panel.querySelector<HTMLElement>("#assistant-verify")!;
  const inputEl = panel.querySelector<HTMLTextAreaElement>("#assistant-input")!;
  const sendBtn = panel.querySelector<HTMLButtonElement>("#assistant-send")!;
  const closeBtn = panel.querySelector<HTMLButtonElement>(".assistant-close")!;

  closeBtn.addEventListener("click", closePanel);

  if (!greeted) {
    greeted = true;
    appendMessage(
      messagesEl,
      "bot",
      "Hi! Ask me anything about Priyanshu — his projects, background, skills, or blog posts.",
    );
  } else {
    // Re-render prior turns from in-memory history when reopening.
    history.forEach((turn) => appendMessage(messagesEl, turn.role === "user" ? "user" : "bot", turn.content));
  }

  let sending = false;
  let awaitingVerification = false;

  const showVerify = (message?: string) => {
    awaitingVerification = true;
    sendBtn.disabled = true;
    verifyEl.hidden = false;
    if (message) appendMessage(messagesEl, "error", message);
    renderTurnstileWidget(verifyEl, () => {
      awaitingVerification = false;
      sendBtn.disabled = false;
      inputEl.focus();
    });
  };

  const send = async () => {
    const text = inputEl.value.trim();
    if (!text || sending || awaitingVerification) return;

    sending = true;
    sendBtn.disabled = true;
    inputEl.value = "";
    appendMessage(messagesEl, "user", text);

    const typing = document.createElement("div");
    typing.className = "assistant-typing";
    typing.innerHTML = "<span></span><span></span><span></span>";
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    const session = getAssistantSession();
    try {
      const result = await askAssistant(text, history, {
        session: session?.token,
        turnstileToken: session ? undefined : getTurnstileToken(verifyEl),
      });
      typing.remove();
      appendMessage(messagesEl, "bot", result.reply);
      const newTurns: ChatTurn[] = [
        { role: "user", content: text },
        { role: "assistant", content: result.reply },
      ];
      history = [...history, ...newTurns].slice(-12);
      if (result.session && result.sessionExpiresAt) {
        setAssistantSession(result.session, result.sessionExpiresAt);
      }
      verifyEl.hidden = true;
    } catch (err) {
      typing.remove();
      if (err instanceof VerificationRequiredError) {
        clearAssistantSession();
        inputEl.value = text;
        showVerify("Please verify you're human to keep chatting.");
      } else {
        appendMessage(messagesEl, "error", err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      sending = false;
      sendBtn.disabled = awaitingVerification;
      inputEl.focus();
    }
  };

  sendBtn.addEventListener("click", send);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 88)}px`;
  });

  if (!getAssistantSession()) {
    showVerify();
  }

  inputEl.focus();
}

function togglePanel(): void {
  if (panelOpen) closePanel();
  else openPanel();
}

export function initSiteAssistantWidget(): void {
  injectStyles();
  fabEl = document.createElement("button");
  fabEl.type = "button";
  fabEl.className = "assistant-fab";
  fabEl.setAttribute("aria-label", "Ask about Priyanshu");
  fabEl.innerHTML = CHAT_ICON;
  fabEl.addEventListener("click", togglePanel);
  document.body.appendChild(fabEl);
}
