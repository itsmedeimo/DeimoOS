// script.js — main terminal engine for DeimoOS
//
// Responsibilities (in rough execution order):
//   1. Login validation and visit-counter management
//   2. Boot sequence (ASCII art, boot messages, RSS prefetch)
//   3. Keyboard handling — input buffer, history, Tab autocomplete, Ctrl+C
//   4. Command dispatch via processCommand()
//   5. Structured output rendering (typewriter, HTML, RSS, quotes)
//   6. Sentinel command handlers collected in COMMAND_REGISTRY
//   7. Idle screensaver (matrix rain canvas via matrixRain.js)
//   8. Snake game loop and leaderboard persistence
//
// Adding a new command (the two-step process):
//   1. In commands.js — add an entry that returns a sentinel string, e.g. "__foo__"
//   2. In this file — add an async handler function, then register it in COMMAND_REGISTRY.
//      processCommand() itself never needs to change.

import { createMatrixRain } from "./effects/matrixRain.js";
import { commands, manFormat, manUsage, manNotFound, leaderboardFormat } from "./commands.js";
import { FS_COMMANDS, handleFsCommand, getPathCompletions, getDisplayCwd, clearSession, hasSessionFiles, fsManPages } from "./filesystem/index.js";
import { bannedUsernames, bannedPatterns } from "../data/banned.js";
import { manPages } from "../data/man.js";
import { THEMES, applyTheme, getCurrentTheme, getThemeColors } from "./themes.js";

/* ════════════════════════════════════════════════════════
   DOM ELEMENTS
   All grabbed once at module load; they never change.
   ════════════════════════════════════════════════════════ */
const terminal         = document.getElementById("terminal");
const output           = document.getElementById("output");
const inputDisplay     = document.getElementById("inputDisplay");
const loginScreen      = document.getElementById("login-screen");
const usernameInput    = document.getElementById("usernameInput");
const promptEl         = document.getElementById("prompt");
const loginBtn         = document.getElementById("loginBtn");
const desktopInputLine = document.getElementById("desktopInputLine"); // the prompt + fake-cursor row
const mobileBar        = document.getElementById("mobileBar");
const mobileField      = document.getElementById("mobileField");
const mobileSubmit     = document.getElementById("mobileSubmit");
const mobilePrompt     = document.getElementById("mobilePrompt");

/* ════════════════════════════════════════════════════════
   STATE
   Module-level variables shared across functions.
   ════════════════════════════════════════════════════════ */

let username     = "user";    // set after login; used in prompts and command output
const host       = "deimo.me"; // hostname shown in the shell prompt

// Command history — filled each time Enter is pressed; navigated with ↑/↓
let history      = [];
let historyIndex = -1;

// Current input buffer and cursor for the desktop fake-input line
let currentInput = "";
let cursorPos    = 0;

// Lifecycle locks — multiple can be true simultaneously:
//   isBooting       → blocks all keyboard input during boot/reboot/logout
//   isAwaitingInput → a command is reading inline input (e.g. sudo password)
//   isGameActive    → snake game is running; keyboard routes to the game handler
//   isProcessing    → a command is mid-execution; new commands are queued
let isBooting       = false;
let isAwaitingInput = false;
let isGameActive    = false;
let isProcessing    = false;

// cancelCommand is set to true by Ctrl+C while isProcessing is true.
// typeTextInto / typeHTMLInto check this flag each character to abort early.
// fetchAbortController, when non-null, is aborted by the same Ctrl+C handler
// to cancel in-flight network requests (e.g. blog RSS fetch).
let cancelCommand        = false;
let fetchAbortController = null;

// blogCache stores the already-parsed RSS output so the `blog` command is instant.
// Populated by startPrefetch() during boot; null until then.
let blogCache = null;

// Screensaver state — matrix rain that kicks in after 2 min of inactivity.
// screensaverHandle is the { stop, canvas } object returned by createMatrixRain().
let screensaverActive = false;
let screensaverTimer  = null;
let screensaverHandle = null;

/* ════════════════════════════════════════════════════════
   MOBILE DETECTION
   ════════════════════════════════════════════════════════ */
// Two checks because width alone misses landscape phones / tablets:
//   max-width:600px     → small screens
//   hover:none + coarse → touch-only devices regardless of viewport size
const isMobile = () =>
  window.matchMedia("(max-width: 600px)").matches ||
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/* ════════════════════════════════════════════════════════
   DATA PATH HELPER
   ════════════════════════════════════════════════════════ */
// Resolves the path to /data/ files regardless of how the page is served.
// Live Server (localhost:5500) serves from the project root, so script.js
// is at /js/script.js and ../data/ correctly points to /data/.
// Opening index.html directly via file:// breaks relative paths in the
// same way, so we fall back to ./data/ in that case.
const dataPath = (file) => {
  if (window.location.protocol === "file:") return `./data/${file}`;
  return `../data/${file}`;
};

/* ════════════════════════════════════════════════════════
   AUDIO UNLOCK
   ════════════════════════════════════════════════════════ */
// Browsers block audio playback until the user has interacted with the page
// (the "autoplay policy"). We silently play-then-immediately-pause the boot
// sound on the very first gesture so that real plays (boot chime, command
// click) are allowed without a user-gesture check at that point.
let audioUnlocked = false;
const unlockAudio = () => {
  if (audioUnlocked) return;
  audioUnlocked = true;
  const primer = new Audio("../data/boot.mp3");
  primer.volume = 0;
  primer.play().then(() => { primer.pause(); primer.currentTime = 0; }).catch(() => {});
};
["click", "keydown", "touchstart", "pointerdown"].forEach(ev =>
  document.addEventListener(ev, unlockAudio, { passive: true })
);

/* ════════════════════════════════════════════════════════
   SCREENSAVER
   ════════════════════════════════════════════════════════ */
// Matrix rain canvas that fades in after 2 minutes of user inactivity.
// Implementation lives in effects/matrixRain.js; this module just manages
// the lifecycle (start, stop, idle timer reset).

function startScreensaver() {
  // Don't start during any interactive state — the user would be unable to dismiss it cleanly
  if (screensaverActive || isBooting || isGameActive || isAwaitingInput || isProcessing) return;
  // Don't start while the login screen is visible (it sits above the terminal anyway)
  if (loginScreen.style.display !== "none") return;

  screensaverActive = true;
  screensaverHandle = createMatrixRain({ zIndex: 9996 }); // above nano editor (9995), below login screen (9999)

  // Allow the canvas to receive click/touch so the user can dismiss the screensaver
  screensaverHandle.canvas.style.pointerEvents = "auto";
  screensaverHandle.canvas.style.cursor = "none";
  screensaverHandle.canvas.addEventListener("click",      () => stopScreensaver(), { once: true });
  screensaverHandle.canvas.addEventListener("touchstart", () => stopScreensaver(), { once: true, passive: true });
}

function stopScreensaver() {
  if (!screensaverActive) return;
  // Mark inactive immediately so guards elsewhere don't block re-entry
  screensaverActive = false;
  const h = screensaverHandle;
  screensaverHandle = null;
  h?.stop(); // triggers the 0.6s fade-out; canvas self-removes after transition
}

// Resets the 2-minute idle timer on any user activity.
// Also dismisses an active screensaver so the user returns to the terminal instantly.
function resetScreensaverTimer() {
  clearTimeout(screensaverTimer);
  if (screensaverActive) stopScreensaver();
  screensaverTimer = setTimeout(startScreensaver, 2 * 60 * 1000);
}
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(ev =>
  document.addEventListener(ev, resetScreensaverTimer, { passive: true })
);

/* ════════════════════════════════════════════════════════
   ANALYTICS
   ════════════════════════════════════════════════════════ */
// Sends a command name to Umami (privacy-friendly analytics).
// Silently skips if Umami's script hasn't loaded (e.g. ad blockers).
function trackCommand(cmd) {
  if (typeof umami === "undefined") return;
  umami.track("command", { command: cmd || "(empty)" });
}

/* ════════════════════════════════════════════════════════
   USERNAME VALIDATION
   ════════════════════════════════════════════════════════ */
// Returns true if the chosen username is on the block-list or matches a
// banned pattern (see data/banned.js for the full list and rationale).
function isUsernameBanned(name) {
  const lower = name.toLowerCase();
  if (bannedUsernames.includes(lower)) return true;
  if (bannedPatterns.some(pattern => pattern.test(lower))) return true;
  return false;
}

/* ════════════════════════════════════════════════════════
   PROMPT AND RENDER HELPERS
   ════════════════════════════════════════════════════════ */

// Rebuilds the shell prompt — called after login, cd, and theme changes.
// Format: username@host:path$
function updatePrompt() {
  const path = getDisplayCwd();
  const promptHTML =
    `<span class="prompt-user">${username}</span>` +
    `<span class="prompt-host">@${host}</span>` +
    `<span class="prompt-path">:${path}$</span>&nbsp;`;
  promptEl.innerHTML = promptHTML;
  if (mobilePrompt) mobilePrompt.innerHTML = `${username}@${host}:${path}$ `;
}

// Scrolls the terminal to the most recently added output.
function scrollToBottom() {
  terminal.scrollTop = terminal.scrollHeight;
}

// Re-renders the desktop fake-cursor input display.
// Splits currentInput at cursorPos, wraps the character under the cursor in
// a <span class="cursor"> so CSS can animate the blinking block.
function renderInput() {
  // On mobile, game mode, or during boot the input display is not used
  if (isMobile() || isGameActive || isBooting) {
    inputDisplay.innerHTML = "";
    return;
  }
  const before = currentInput.slice(0, cursorPos);
  const char   = currentInput[cursorPos] || " "; // show a space when the cursor is at the end
  const after  = currentInput.slice(cursorPos + 1);
  inputDisplay.innerHTML = before + `<span class="cursor">${char}</span>` + after;
}

// Creates a new output block in the terminal — one per submitted command.
// Structure: <div.block> → <div.command> (the command echo) + <div.output> (returned).
// Callers write their output into the returned <div.output> element.
function createBlock(cmd) {
  const block = document.createElement("div");
  block.classList.add("block");

  const cmdLine = document.createElement("div");
  cmdLine.classList.add("command");
  cmdLine.textContent = `${username}@${host}:${getDisplayCwd()}$ ${cmd}`;

  const outputEl = document.createElement("div");
  outputEl.classList.add("output");

  block.appendChild(cmdLine);
  block.appendChild(outputEl);
  output.appendChild(block);
  scrollToBottom();
  return outputEl; // callers write their output into this element
}

/* ════════════════════════════════════════════════════════
   TYPEWRITER ANIMATION
   ════════════════════════════════════════════════════════ */

// Animates plain text into `el` character-by-character (typewriter effect).
// Checks cancelCommand before each character so Ctrl+C stops the animation
// mid-output without leaving the terminal in a bad state.
function typeTextInto(text, el, speed = 3) {
  return new Promise((resolve) => {
    let i = 0;
    function type() {
      if (cancelCommand) { resolve(); return; } // Ctrl+C aborts
      if (i < text.length) {
        el.innerHTML += text[i++];
        scrollToBottom();
        setTimeout(type, speed);
      } else {
        resolve();
      }
    }
    type();
  });
}

// Like typeTextInto but the final content is HTML (links, colored spans, etc.).
// We animate the plain-text version first so we never break mid-HTML-tag,
// then swap in the real HTML once typing is complete.
function typeHTMLInto(html, el, speed = 3) {
  return new Promise((resolve) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const plainText = tmp.textContent; // strip tags for the animation phase

    el.style.whiteSpace = "pre-wrap";
    let i = 0;
    function type() {
      if (cancelCommand) { el.style.whiteSpace = ""; resolve(); return; }
      if (i < plainText.length) {
        el.textContent = plainText.slice(0, ++i);
        scrollToBottom();
        setTimeout(type, speed);
      } else {
        // Replace plain-text placeholder with the real HTML at the end
        el.style.whiteSpace = "";
        el.innerHTML = html;
        resolve();
      }
    }
    type();
  });
}

/* ════════════════════════════════════════════════════════
   RSS / ATOM PARSING
   ════════════════════════════════════════════════════════ */
// Blog posts are loaded via a CORS proxy because browsers cannot directly
// fetch cross-origin RSS feeds. We fire requests to three different free
// proxies in parallel and take whichever responds first (Promise.any).

// Extracts the post URL from an RSS <item> or Atom <entry>.
// Both formats differ in how they store the link, so we try several selectors.
function extractLink(item) {
  const linkTag = item.querySelector("link");
  if (linkTag) {
    const href = linkTag.getAttribute("href");
    if (href) return href;
    if (linkTag.textContent.trim()) return linkTag.textContent.trim();
  }
  // Some feeds use <guid> as the permalink
  const guid = item.querySelector("guid");
  if (guid && guid.textContent.trim().startsWith("http")) return guid.textContent.trim();
  // Atom feeds use <id> as the canonical URL
  const id = item.querySelector("id");
  if (id && id.textContent.trim().startsWith("http")) return id.textContent.trim();
  return "#";
}

// Parses a raw RSS/Atom XML string (or a JSON wrapper from allorigins.win) into
// an HTML string of clickable post links with dimmed publication dates.
function parseRSS(data) {
  try {
    let xmlString = data;

    // allorigins.win wraps the content in a JSON envelope — unwrap it
    if (typeof data === "string" && data.trim().startsWith("{")) {
      try {
        const json = JSON.parse(data);
        xmlString = json.contents;
      } catch (e) { console.error("JSON parse failed", e); }
    }

    // Some proxies return base64-encoded content
    if (xmlString.includes("base64,")) {
      xmlString = atob(xmlString.split("base64,")[1]);
    }

    const parser = new DOMParser();
    const xml    = parser.parseFromString(xmlString, "text/xml");

    // RSS uses <item>; Atom uses <entry>
    let items = [...xml.querySelectorAll("item")];
    if (items.length === 0) items = [...xml.querySelectorAll("entry")];
    if (items.length === 0) return "Error: No posts found in the feed.";

    return items.map(item => {
      const title  = item.querySelector("title")?.textContent.trim() || "(untitled)";
      const dateEl = item.querySelector("pubDate") || item.querySelector("published") || item.querySelector("updated");
      const date   = dateEl ? new Date(dateEl.textContent).toLocaleDateString("en-GB") : "";
      const link   = extractLink(item);
      return `- <a href="${link}" target="_blank" class="terminal-link">${title}</a> <span style="color:${getThemeColors().dim}">(${date})</span>`;
    }).join("\n");
  } catch (err) {
    console.error("Parsing error:", err);
    return "Error parsing blog feed.";
  }
}

// Fetches a raw RSS/Atom feed via three CORS proxies in parallel.
// Returns the first successful response body (string), or null if all fail.
//
// signal — optional AbortSignal from an AbortController.
//          When the user presses Ctrl+C, the signal is aborted, which causes
//          all three fetch() calls to reject immediately with AbortError.
//          Promise.any then rejects with AggregateError and we return null.
async function fetchRSS(rssUrl, signal) {
  const fetchFromProxy = async (url) => {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Proxy ${url} returned ${r.status}`);
    return await r.text();
  };

  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(rssUrl)}`,
  ];

  try {
    return await Promise.any(proxies.map(p => fetchFromProxy(p)));
  } catch (e) {
    // AggregateError: all three proxies failed (or the signal was aborted)
    if (!signal?.aborted) console.error("All proxies failed.", e);
    return null;
  }
}

// Kicks off a background RSS fetch during boot so the `blog` command is instant.
// If the fetch completes before `blog` is run, blogCache will hold the parsed HTML.
// If it hasn't finished yet, the `blog` handler fetches live (with a progress message).
async function startPrefetch() {
  const data = await fetchRSS("https://deimo.me/feed/");
  if (data) blogCache = parseRSS(data);
}

/* ════════════════════════════════════════════════════════
   LEADERBOARD
   ════════════════════════════════════════════════════════ */
// Snake scores are stored in localStorage. A seed JSON file (data/leaderboard.json)
// provides the initial entries; its "version" field and a hash of its entries let
// us detect changes and push resets to all visitors without touching localStorage
// keys manually.

// Fetches the seed file (with a cache-buster to avoid stale CDN responses).
async function fetchLeaderboardSeed() {
  try {
    const res = await fetch(dataPath("leaderboard.json") + "?v=" + Date.now());
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  } catch {
    return { version: 0, leaderboard: [] };
  }
}

// Produces a lightweight fingerprint of the seed entries.
// If the seed file is edited (name or score changed), the hash changes and
// localStorage is re-seeded even without bumping the version number.
function hashSeed(entries) {
  return entries.map(e => `${e.username}:${e.score}`).join("|");
}

// Loads the leaderboard from localStorage, re-seeding from the JSON file
// when: (a) nothing is stored yet, (b) the seed version was bumped, or
// (c) the seed content was edited.
async function loadLeaderboard() {
  try {
    const saved      = localStorage.getItem("snake_leaderboard");
    const versionKey = "snake_leaderboard_version";
    const hashKey    = "snake_leaderboard_hash";
    const storedVer  = localStorage.getItem(versionKey);
    const storedHash = localStorage.getItem(hashKey);
    const seed       = await fetchLeaderboardSeed();
    const seedHash   = hashSeed(seed.leaderboard);

    const needsReseed = !saved || storedVer !== String(seed.version) || storedHash !== seedHash;
    if (needsReseed) {
      const seeded = seed.leaderboard.slice().sort((a, b) => b.score - a.score).slice(0, 5);
      localStorage.setItem("snake_leaderboard", JSON.stringify(seeded));
      localStorage.setItem(versionKey, String(seed.version));
      localStorage.setItem(hashKey, seedHash);
      return seeded;
    }

    return JSON.parse(saved);
  } catch {
    return [];
  }
}

// Persists the leaderboard to localStorage and optionally to a backend API.
// The API write is a best-effort fire-and-forget; localStorage is always
// the source of truth in the browser.
function saveLeaderboard(board) {
  localStorage.setItem("snake_leaderboard", JSON.stringify(board));
  // Skip the server write on Live Server / static environments (no backend present)
  if (window.location.port === "5500" || window.location.protocol === "file:") return;
  fetch("/api/leaderboard", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ leaderboard: board }),
  }).catch(() => {}); // silent fail
}

// Inserts a new score, sorts descending, trims to top 5, and saves.
async function addLeaderboardEntry(user, score) {
  const board = await loadLeaderboard();
  board.push({ username: user, score });
  board.sort((a, b) => b.score - a.score);
  const top5 = board.slice(0, 5);
  saveLeaderboard(top5);
  return top5;
}

// Loads and renders the top-5 leaderboard into `out` with a typewriter effect.
async function showLeaderboard(out) {
  const board = await loadLeaderboard();
  await typeTextInto(leaderboardFormat(board), out);
}

/* ════════════════════════════════════════════════════════
   CRASH SEQUENCE
   ════════════════════════════════════════════════════════ */
// A dramatic fake kernel panic triggered by `rm -rf /` in the filesystem handler
// or by the `crash` sentinel. Sets isBooting=true to block input, flashes the
// terminal, then resets to the login screen.
async function runCrashSequence(out) {
  isBooting = true;
  await typeTextInto("WARNING: You are about to delete the root directory.", out);
  await new Promise(r => setTimeout(r, 800));
  await typeTextInto("\nExecuting...", out);
  await new Promise(r => setTimeout(r, 500));

  const errors = [
    "Deleting /bin...", "Deleting /etc...", "Deleting /home...",
    "CRITICAL: Kernel integrity lost", "FATAL: /sbin/init not found",
    "PANIC: Attempted to kill init!", "Memory dump at 0x004F3A2...",
    "SYSTEM_FAILURE_000x042", "Connection reset by peer",
  ];

  for (let i = 0; i < 30; i++) {
    const div = document.createElement("div");
    div.style.color = i % 5 === 0 ? getThemeColors().error : getThemeColors().primary;
    div.textContent = `[${(Math.random() * 100).toFixed(4)}] ${errors[i % errors.length]}`;
    output.appendChild(div);
    scrollToBottom();
    await new Promise(r => setTimeout(r, 30));
    if (i === 15) terminal.style.filter = "invert(1) contrast(2)";
  }

  terminal.style.animation = "flicker 0.1s infinite alternate";
  await new Promise(r => setTimeout(r, 1000));
  terminal.style.filter = "";
  terminal.style.animation = "";
  output.innerHTML = "";
  document.body.style.background = "white";
  await new Promise(r => setTimeout(r, 100));
  document.body.style.background = "black";

  // Reset to login screen
  usernameInput.value = "";
  loginScreen.style.display = "flex";
  usernameInput.focus();
  isBooting = false;
  isProcessing = false;
}

/* ════════════════════════════════════════════════════════
   RESTORE PROMPT
   ════════════════════════════════════════════════════════ */
// Called by every command handler when it finishes to re-enable input.
// Module-level (not inside processCommand) so COMMAND_REGISTRY handlers
// can call it directly without needing it passed as a parameter.
function restorePrompt() {
  isProcessing = false;
  cancelCommand = false;
  if (desktopInputLine && !isMobile()) desktopInputLine.style.display = "flex";
  if (isMobile()) mobileBar.classList.add("visible");
  updatePrompt();
  renderInput();
  scrollToBottom();
}

/* ════════════════════════════════════════════════════════
   COMMAND HANDLERS
   One async function per sentinel string returned by commands.js.
   Each handler receives (out, args):
     out  — the <div.output> element to write into
     args — array of arguments after the base command (rarely used by sentinels)
   Each handler is responsible for calling restorePrompt() when it finishes,
   EXCEPT for handlers that reset the UI entirely (__logout__, __reboot__, __crash__).
   ════════════════════════════════════════════════════════ */

// Shows the snake leaderboard with a typewriter effect.
async function handleSnakeLeaderboard(out) {
  await showLeaderboard(out);
  restorePrompt();
}

// Fetches changelog.txt from /data/ and displays it in preformatted style.
// Collapses multiple blank lines to a single blank line for clean output.
async function handleChangelog(out) {
  try {
    const r = await fetch(dataPath("changelog.txt") + "?v=" + Date.now());
    if (!r.ok) throw new Error("fetch failed");
    const text = (await r.text())
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n") // collapse excess blank lines
      .trim();
    out.style.whiteSpace = "pre";
    if (isMobile()) out.classList.add("output-scroll");
    await typeTextInto(text, out);
    out.style.whiteSpace = "";
  } catch {
    await typeTextInto("Error: Could not load changelog.", out);
  }
  restorePrompt();
}

// Sweeps a glowing line down the terminal then wipes all output.
// The wipe animation is pure CSS (see .clear-wipe in style.css).
async function handleClear(out) {
  const wipe = document.createElement("div");
  wipe.classList.add("clear-wipe");
  document.body.appendChild(wipe);
  wipe.addEventListener("animationend", () => wipe.remove()); // self-cleaning
  await new Promise(r => setTimeout(r, 150)); // brief delay so the sweep is visible
  output.innerHTML = "";
  restorePrompt();
}

// Delegates to runCrashSequence which manages isBooting/isProcessing itself.
// No restorePrompt() call — the crash handler resets the whole UI to login.
async function handleCrash(out) {
  await runCrashSequence(out);
}

// Fake hacking animation: scrolling hex log lines, a progress bar, then "ACCESS DENIED".
// Respects cancelCommand so Ctrl+C stops it mid-animation.
async function handleHack(out) {
  await typeTextInto("Initializing Matrix Bypass...", out);
  const hackLines = [
    "Security Alert: Breach detected",
    "SQL Injection: Success",
    "RSA Layer: Decrypted",
    "Overriding Mainframe...",
  ];

  // Phase 1: scrolling "log" lines
  for (let i = 0; i < 20; i++) {
    if (cancelCommand) break;
    const div = document.createElement("div");
    div.style.color = getThemeColors().primary;
    div.textContent = `[${Math.random().toString(16).substring(2, 8).toUpperCase()}] ${hackLines[i % 4]}`;
    output.appendChild(div);
    scrollToBottom();
    await new Promise(r => setTimeout(r, 40));
  }

  // Phase 2: ASCII progress bar
  if (!cancelCommand) {
    const prog = document.createElement("div");
    output.appendChild(prog);
    for (let i = 0; i <= 100; i += 10) {
      if (cancelCommand) break;
      prog.textContent = `DECRYPTING: [${"#".repeat(i / 10)}${".".repeat(10 - i / 10)}] ${i}%`;
      scrollToBottom();
      await new Promise(r => setTimeout(r, 80));
    }
  }

  // Phase 3: final result
  if (!cancelCommand) {
    const denied = document.createElement("div");
    denied.innerHTML = `<br><span style="color:${getThemeColors().error}; font-size:22px; font-weight:bold;">[ ACCESS DENIED. FIREWALL ACTIVATED ]</span><br>`;
    output.appendChild(denied);
    scrollToBottom();
  }
  restorePrompt();
}

// Fullscreen matrix rain for ~8 seconds (or until Ctrl+C).
// Delegates canvas creation to createMatrixRain() from matrixRain.js.
// The canvas self-removes after its fade-out transition completes.
async function handleMatrix(out) {
  const rain = createMatrixRain({ zIndex: 9997 }); // above screensaver (9996), below login (9999)

  // Wait up to 8 seconds (80 × 100 ms), breaking early on Ctrl+C
  for (let i = 0; i < 80; i++) {
    if (cancelCommand) break;
    await new Promise(r => setTimeout(r, 100));
  }

  rain.stop(); // triggers fade-out; canvas removes itself after 0.6s
  restorePrompt();
}

// Fake sudo prompt — three identical password attempts, all denied.
// Uses isAwaitingInput to suppress the normal keyboard handler while
// the inline <input type="password"> is active.
async function handleSudo(out) {
  // Creates a single inline password prompt and resolves when the user presses Enter.
  const askPassword = () => new Promise((resolve) => {
    isAwaitingInput = true;

    // Visible label + hidden password input side by side
    const line = document.createElement("div");
    line.textContent = "[sudo] password for root: ";
    out.appendChild(line);
    scrollToBottom();

    const input = document.createElement("input");
    input.type = "password";
    // The input is effectively invisible — only its caret shows.
    // A <span> next to it mirrors the value as asterisks.
    input.style.cssText = [
      "background:transparent",
      "border:none",
      "outline:none",
      "color:transparent",
      `caret-color:${getThemeColors().primary}`,
      "font-family:inherit",
      "font-size:inherit",
      "width:1px",
    ].join(";");
    line.appendChild(input);

    const asterisks = document.createElement("span");
    line.appendChild(asterisks);
    input.addEventListener("input", () => {
      asterisks.textContent = "*".repeat(input.value.length);
    });

    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        input.remove();
        asterisks.remove();
        isAwaitingInput = false;
        resolve();
      }
    });
  });

  await askPassword();
  await typeTextInto("Sorry, try again.", out);
  await askPassword();
  await typeTextInto("Sorry, try again.", out);
  await askPassword();
  await typeTextInto("Sorry, try again.\nsudo: 3 incorrect password attempts", out);
  restorePrompt();
}

// Displays a summary of the current session: user, host, shell, uptime, browser.
async function handleWhoami(out) {
  const sessionStart = window._sessionStart
    ? new Date(window._sessionStart).toLocaleTimeString("en-GB")
    : "unknown";
  await typeTextInto(
    `User     : ${username}\n` +
    `Host     : ${host}\n` +
    `Shell    : deimosh\n` +
    `Session  : started at ${sessionStart}\n` +
    `Browser  : ${navigator.userAgent.split(")")[0].split("(")[1] || "unknown"}`,
    out
  );
  restorePrompt();
}

// Neofetch-style system info: ASCII logo on the left, stats on the right.
// On mobile, skips the logo and just lists the stats vertically.
async function handleNeofetch(out) {
  // Partial "D" ASCII logo — one line per row, padded to 16 chars
  const ascii = [
    "", "██████████  ", "░░███░░░░███ ", " ░███   ░░███",
    " ░███    ░███", " ░███    ░███", " ░███    ███ ",
    " ██████████  ", "░░░░░░░░░░   ",
  ];
  const uptime = Math.floor((Date.now() - (window._sessionStart || Date.now())) / 1000);
  const info = [
    `${username}@${host}`,
    "─".repeat(24),
    `OS       : DeimoOS 0.6.1`,
    `Shell    : deimo.sh`,
    `Engine   : Vanilla JS`,
    `Host     : ${host}`,
    `Uptime   : ${uptime}s`,
    `Theme    : ${THEMES[getCurrentTheme()].label}`,
    `Font     : Share Tech Mono`,
  ];

  const el = document.createElement("div");
  el.style.whiteSpace = "pre";
  out.appendChild(el);

  if (isMobile()) {
    // Mobile: skip block art; just stream the info cleanly
    el.classList.add("output-scroll");
    for (let i = 0; i < info.length; i++) {
      el.innerHTML += `<span style="color:${getThemeColors().accent}">${info[i]}</span>\n`;
      scrollToBottom();
      await new Promise(r => setTimeout(r, 60));
    }
  } else {
    // Desktop: ASCII on left, info on right, rendered line by line
    const totalRows = Math.max(ascii.length, info.length);
    for (let i = 0; i < totalRows; i++) {
      el.innerHTML +=
        `<span style="color:#ffffff">${(ascii[i] || "").padEnd(16)}</span>  ` +
        `<span style="color:${getThemeColors().accent}">${info[i] || ""}</span>\n`;
      scrollToBottom();
      await new Promise(r => setTimeout(r, 60));
    }
  }
  restorePrompt();
}

// In-browser Snake game rendered on a <canvas>.
// Sets isGameActive=true to route keyboard input to the game's own handler.
// When the game ends (collision or Q), shows the leaderboard and restores input.
async function handleSnake(out) {
  isGameActive = true;
  if (inputDisplay) inputDisplay.innerHTML = ""; // hide the fake cursor while game runs

  // Responsive grid sizing: smaller cells and board on mobile
  const mobile   = isMobile();
  const maxWidth = mobile ? Math.floor((window.innerWidth - 32) / 1) : 500;
  const cols     = mobile ? 20 : 25;
  const rows     = mobile ? 18 : 20;
  const size     = mobile ? Math.floor(maxWidth / cols) : 20; // px per cell
  const speed    = mobile ? 140 : 120; // ms per game tick

  // ── DOM structure: container → wrapper (border) → canvas + score + [d-pad] ──
  const container = document.createElement("div");
  container.style.cssText = "display:inline-flex; flex-direction:column; align-items:center; gap:8px; margin-top:6px;";

  const wrapper = document.createElement("div");
  wrapper.style.cssText = `border:1px solid ${getThemeColors().primary}; display:inline-block;`;

  const canvas = document.createElement("canvas");
  canvas.width  = cols * size;
  canvas.height = rows * size;
  canvas.style.display = "block";
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);
  out.appendChild(container);

  const ctx = canvas.getContext("2d");

  // ── Game state ──
  let snake   = [
    { x: Math.floor(cols / 2),     y: Math.floor(rows / 2) },
    { x: Math.floor(cols / 2) - 1, y: Math.floor(rows / 2) },
    { x: Math.floor(cols / 2) - 2, y: Math.floor(rows / 2) },
  ];
  let dir     = { x: 1, y: 0 };
  let nextDir = { x: 1, y: 0 };
  let food    = { x: 5, y: 5 };
  let score   = 0;
  let running = true;

  // ── Score display ──
  const scoreEl = document.createElement("div");
  scoreEl.style.cssText = `margin-top:4px; font-size:${mobile ? "12px" : "inherit"}`;
  scoreEl.textContent = mobile
    ? "Score: 0  |  Q to quit"
    : "Score: 0  |  WASD or Arrow Keys  |  Q to quit";
  container.appendChild(scoreEl);

  // ── Mobile D-pad (touch controls) ──
  if (mobile) {
    const dpad = document.createElement("div");
    dpad.style.cssText = "display:grid; grid-template-columns:repeat(3,44px); grid-template-rows:repeat(3,44px); gap:4px; margin-top:4px; user-select:none;";

    // Helper to create a directional button at a grid position
    const btn = (label, col, row, dx, dy) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = [
        `grid-column:${col}`, `grid-row:${row}`,
        "background:transparent",
        `border:1px solid ${getThemeColors().primary}`,
        `color:${getThemeColors().primary}`,
        "font-family:inherit", "font-size:18px", "cursor:pointer",
        "border-radius:3px", "display:flex", "align-items:center",
        "justify-content:center", "-webkit-tap-highlight-color:transparent",
      ].join(";");
      const move = (e) => {
        e.preventDefault();
        const nd = { x: dx, y: dy };
        // Prevent reversing directly into the snake's own body
        if (!(nd.x === -dir.x && nd.y === -dir.y)) nextDir = nd;
      };
      b.addEventListener("touchstart", move, { passive: false });
      b.addEventListener("mousedown", move);
      return b;
    };

    dpad.appendChild(btn("▲", 2, 1,  0, -1));
    dpad.appendChild(btn("◀", 1, 2, -1,  0));
    dpad.appendChild(btn("▶", 3, 2,  1,  0));
    dpad.appendChild(btn("▼", 2, 3,  0,  1));

    // Dedicated quit button for mobile (no keyboard)
    const qBtn = document.createElement("button");
    qBtn.textContent = "■ Quit";
    qBtn.style.cssText = [
      "background:transparent",
      `border:1px solid ${getThemeColors().error}`,
      `color:${getThemeColors().error}`,
      "font-family:inherit", "font-size:13px", "cursor:pointer",
      "border-radius:3px", "padding:6px", "margin-top:2px", "width:140px",
    ].join(";");
    qBtn.addEventListener("touchstart", (e) => { e.preventDefault(); running = false; }, { passive: false });
    qBtn.addEventListener("mousedown", () => { running = false; });

    const dpadWrap = document.createElement("div");
    dpadWrap.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:4px;";
    dpadWrap.appendChild(dpad);
    dpadWrap.appendChild(qBtn);
    container.appendChild(dpadWrap);
  }

  scrollToBottom();

  // Randomly places the food pellet anywhere on the grid
  const placeFood = () => {
    food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
  };

  // Redraws the entire canvas each tick: black background, green snake, red food
  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = getThemeColors().primary;
    for (const s of snake) ctx.fillRect(s.x * size, s.y * size, size - 2, size - 2);
    ctx.fillStyle = getThemeColors().error;
    ctx.fillRect(food.x * size, food.y * size, size - 2, size - 2);
  };

  // Desktop keyboard handler (active only while the game is running)
  const keyHandler = (e) => {
    const map = {
      ArrowUp: { x: 0, y: -1 }, w: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 }, d: { x: 1, y: 0 },
    };
    if (e.key === "Enter") { e.preventDefault(); return; }
    if (e.key === "q" || e.key === "Q") { running = false; return; }
    const newDir = map[e.key];
    if (newDir && !(newDir.x === -dir.x && newDir.y === -dir.y)) nextDir = newDir;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
  };
  document.addEventListener("keydown", keyHandler);

  // ── Game tick loop ──
  const loop = setInterval(async () => {
    if (!running) {
      clearInterval(loop);
      document.removeEventListener("keydown", keyHandler);
      scoreEl.textContent = `Game Over! Final score: ${score}`;

      // Save score and show leaderboard below the game canvas
      await addLeaderboardEntry(username, score);
      await new Promise(r => setTimeout(r, 600));
      const lbOut = document.createElement("div");
      lbOut.classList.add("output");
      out.appendChild(lbOut);
      await showLeaderboard(lbOut);

      isGameActive = false;
      restorePrompt();
      scrollToBottom();
      return;
    }

    dir = nextDir;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision or self-collision → game over
    const hitWall = head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows;
    const hitSelf = snake.some(s => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) { running = false; return; }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      // Ate the food: grow and place new food
      score++;
      scoreEl.textContent = mobile
        ? `Score: ${score}  |  Q to quit`
        : `Score: ${score}  |  WASD or Arrow Keys  |  Q to quit`;
      placeFood();
    } else {
      // Normal move: remove tail so the snake stays the same length
      snake.pop();
    }
    draw();
  }, speed);

  // Draw the initial frame immediately so the canvas isn't blank at start
  draw();
  // Note: no restorePrompt() here — the game loop calls it when running becomes false
}

// Logs out the current user: shows a systemd-style shutdown log, wipes the
// terminal, then returns to the login screen.
// Does NOT call restorePrompt() — the UI is being fully reset to login state.
async function handleLogout(out) {
  localStorage.removeItem("username");
  isBooting = true;
  clearTimeout(screensaverTimer);
  stopScreensaver();

  const sessionSecs = Math.floor((Date.now() - (window._sessionStart || Date.now())) / 1000);
  const sessionTime = sessionSecs < 60
    ? `${sessionSecs}s`
    : `${Math.floor(sessionSecs / 60)}m ${sessionSecs % 60}s`;

  // Helper: appends a styled line after a delay
  const addLine = async (text, color = getThemeColors().primary, delay = 320) => {
    await new Promise(r => setTimeout(r, delay));
    const d = document.createElement("div");
    d.textContent = text;
    d.style.color = color;
    out.appendChild(d);
    scrollToBottom();
  };

  await addLine(`Logging out ${username}...`, getThemeColors().primary, 0);
  await addLine(`Session duration : ${sessionTime}`, getThemeColors().dim);
  await addLine("Saving session state...", getThemeColors().dim);
  await addLine("  [  OK  ] Session state saved", getThemeColors().dim);
  await addLine("  [  OK  ] Terminal buffer flushed", getThemeColors().dim);
  await addLine("  [  OK  ] Command history written", getThemeColors().dim);
  await addLine("  [  OK  ] User environment unloaded", getThemeColors().dim);
  await addLine("  [  OK  ] Auth tokens cleared", getThemeColors().dim);
  await addLine("Wiping temporary files...", getThemeColors().dim);
  if (hasSessionFiles()) {
    await addLine("  [  OK  ] Session filesystem entries removed", getThemeColors().dim);
  }
  await addLine("  [  OK  ] /tmp cleared", getThemeColors().dim);
  await addLine("  [  OK  ] Runtime cache purged", getThemeColors().dim);
  clearSession(); // wipes user-created files from the virtual filesystem

  await addLine(`Goodbye, ${username}.`, getThemeColors().accent, 400);
  await new Promise(r => setTimeout(r, 700));

  // Sweep animation then reset to login
  const wipe = document.createElement("div");
  wipe.classList.add("clear-wipe");
  document.body.appendChild(wipe);
  wipe.addEventListener("animationend", () => wipe.remove());
  await new Promise(r => setTimeout(r, 500));
  output.innerHTML = "";
  usernameInput.value = "";
  loginScreen.style.display = "flex";
  usernameInput.focus();
  isBooting = false;
  isProcessing = false;
}

// Full reboot sequence: systemd-style "Stopping services..." log, flicker,
// sweep, then returns to login without clearing the saved username.
// Does NOT call restorePrompt() — UI is reset to login state.
async function handleReboot(out) {
  isBooting = true;
  clearTimeout(screensaverTimer);
  stopScreensaver();
  currentInput = "";
  cursorPos = 0;

  // Helper: appends an [OK] / [WAIT] / [FAIL] service line with a delay
  const svc = async (status, label, delay = 230) => {
    await new Promise(r => setTimeout(r, delay));
    const d = document.createElement("div");
    const col = { OK: getThemeColors().dim, WAIT: getThemeColors().warn, FAIL: getThemeColors().error };
    const tag = { OK: "  [  OK  ]", WAIT: "  [ WAIT ]", FAIL: "  [ FAIL ]" };
    d.innerHTML = `<span style="color:${col[status]}">${tag[status]}</span> ${label}`;
    out.appendChild(d);
    scrollToBottom();
  };

  // Helper: appends a plain header line with a delay
  const hdr = async (text, color = getThemeColors().primary, delay = 120) => {
    await new Promise(r => setTimeout(r, delay));
    const d = document.createElement("div");
    d.style.color = color;
    d.textContent = text;
    out.appendChild(d);
    scrollToBottom();
  };

  await hdr(`Broadcast message from root@${host}:`, getThemeColors().primary, 0);
  await hdr("The system is going down for reboot NOW!", getThemeColors().error, 150);
  await new Promise(r => setTimeout(r, 500));

  await hdr("Stopping services...", getThemeColors().primary, 0);
  await svc("OK",   "Stopped target Multi-User System");
  await svc("OK",   "Stopped target Login Prompts");
  await svc("OK",   "Stopped RSS prefetch daemon (deimo-rss.service)");
  await svc("OK",   "Stopped Matrix renderer (matrix-rain.service)");
  await svc("OK",   "Stopped Weather telemetry (geo-weather.service)");
  await svc("WAIT", "Stopping Blog cache manager (blog-cache.service)...", 300);
  await svc("OK",   "Stopped Blog cache manager (blog-cache.service)", 180);
  await svc("OK",   "Stopped Command history logger (cmd-history.service)");
  await svc("OK",   "Stopped Snake game engine (snek.service)");
  await svc("OK",   "Stopped Session tracker (session.service)");
  await svc("WAIT", "Stopping Analytics daemon (umami-client.service)...", 350);
  await svc("OK",   "Stopped Analytics daemon (umami-client.service)", 200);
  await svc("OK",   "Stopped Terminal input handler (deimosh.service)");
  await svc("OK",   "Stopped target Sound System");
  await new Promise(r => setTimeout(r, 180));

  await hdr("Wiping temporary files...", getThemeColors().primary, 0);
  if (hasSessionFiles()) {
    await svc("OK", "Removed session filesystem entries (fs-session.service)");
  }
  await svc("OK", "Cleared /tmp (tmpfs)");
  await svc("OK", "Purged /var/cache/deimosh");
  await svc("OK", "Removed runtime session data");
  clearSession();

  await hdr("Unmounting filesystems...", getThemeColors().primary, 0);
  await svc("OK", "Unmounted /home/deimo");
  await svc("OK", "Unmounted /var/log");
  await svc("OK", "Unmounted /etc");
  await svc("OK", "Unmounted /");
  await new Promise(r => setTimeout(r, 180));

  await hdr("Syncing hardware clock...", getThemeColors().primary, 0);
  await new Promise(r => setTimeout(r, 480));
  await hdr("Reached target System Power Off. Rebooting...", getThemeColors().warn, 0);
  await new Promise(r => setTimeout(r, 900));

  // Terminal flicker effect before the screen wipe
  let flickers = 0;
  const fi = setInterval(() => {
    terminal.style.opacity = terminal.style.opacity === "0" ? "1" : "0";
    if (++flickers >= 6) { clearInterval(fi); terminal.style.opacity = "1"; }
  }, 100);
  await new Promise(r => setTimeout(r, 800));

  const wipe = document.createElement("div");
  wipe.classList.add("clear-wipe");
  document.body.appendChild(wipe);
  wipe.addEventListener("animationend", () => wipe.remove());
  await new Promise(r => setTimeout(r, 500));
  output.innerHTML = "";
  usernameInput.value = "";
  loginScreen.style.display = "flex";
  usernameInput.focus();
  isProcessing = false;
  // Note: isBooting intentionally left true until the login form is submitted again
}

// Geolocates the user via the browser's Geolocation API, reverse-geocodes the
// coordinates with Nominatim (OpenStreetMap), then fetches current conditions
// from the Open-Meteo forecast API.
async function handleWeather(out) {
  await typeTextInto("Detecting location...", out);
  try {
    const position = await new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
    );
    const { latitude, longitude } = position.coords;

    // Reverse geocoding: coordinates → city name
    const revRes  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
    const revData = await revRes.json();
    const city    = revData.address.city || revData.address.town || revData.address.village || "Unknown";

    // Current weather conditions from Open-Meteo (no API key required)
    const weatherRes  = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=celsius`);
    const weatherData = await weatherRes.json();
    const c = weatherData.current;

    // WMO weather condition codes → human-readable descriptions
    const codes = {
      0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",
      45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",
      61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",
      80:"Rain showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm",
      96:"Thunderstorm w/ hail",99:"Heavy thunderstorm",
    };

    out.innerHTML = "";
    await typeTextInto(
      `Location    : ${city}, ${revData.address.country || ""}\n` +
      `Condition   : ${codes[c.weathercode] || "Unknown"}\n` +
      `Temperature : ${c.temperature_2m}°C\n` +
      `Humidity    : ${c.relativehumidity_2m}%\n` +
      `Wind Speed  : ${c.windspeed_10m} km/h`,
      out
    );
  } catch (err) {
    out.innerHTML = "";
    await typeTextInto(
      err.code === 1 ? "Error: Location access denied." : "Error: Could not fetch weather data.",
      out
    );
  }
  restorePrompt();
}

// Fetches a random programming joke from the official-joke-api and displays it
// in two parts (setup → pause → punchline) for comedic timing.
async function handleJoke(out) {
  try {
    const response = await fetch("https://official-joke-api.appspot.com/jokes/programming/random");
    const data     = await response.json();
    if (data && data.length > 0) {
      const { setup, punchline } = data[0];
      await typeTextInto(setup, out);
      const pause = document.createElement("div");
      pause.textContent = "...";
      out.appendChild(pause);
      await new Promise(r => setTimeout(r, 1500)); // comedic pause
      const punch = document.createElement("div");
      punch.style.color = getThemeColors().accent;
      out.appendChild(punch);
      await typeTextInto(punchline, punch);
    }
  } catch (err) {
    await typeTextInto("Error: Failed to connect to the Joke-Server.", out);
  }
  restorePrompt();
}

/* ════════════════════════════════════════════════════════
   COMMAND REGISTRY
   Maps each sentinel string returned by commands.js to its async handler.

   To add a new command:
     1. In commands.js: add   myCmd: () => "__mycmd__"
     2. Here: add             async function handleMyCmd(out) { ... }
     3. Here: register it     "__mycmd__": handleMyCmd
   processCommand() itself never needs to change.
   ════════════════════════════════════════════════════════ */
const COMMAND_REGISTRY = {
  "__snake-leaderboard__": handleSnakeLeaderboard,
  "__changelog__":         handleChangelog,
  "__clear__":             handleClear,
  "__crash__":             handleCrash,
  "__hack__":              handleHack,
  "__matrix__":            handleMatrix,
  "__sudo__":              handleSudo,
  "__whoami__":            handleWhoami,
  "__neofetch__":          handleNeofetch,
  "__snake__":             handleSnake,
  "__logout__":            handleLogout,
  "__reboot__":            handleReboot,
  "__weather__":           handleWeather,
  "__joke__":              handleJoke,
};

/* ════════════════════════════════════════════════════════
   STRUCTURED RETURN TYPE HANDLERS
   Commands can return typed objects instead of sentinel strings.
   These helpers handle those cases.
   ════════════════════════════════════════════════════════ */

// { quote, author } — typewriter for the quote text, then attribution below
async function handleQuote(res, out) {
  await typeTextInto(`"${res.quote}"`, out);
  const attr = document.createElement("div");
  attr.style.color = getThemeColors().accent;
  attr.style.marginTop = "4px";
  out.appendChild(attr);
  await typeTextInto(`— ${res.author}`, attr);
  restorePrompt();
}

// { rss: url } — uses the pre-fetched blogCache if ready, otherwise fetches live.
// An AbortController is created before the live fetch so Ctrl+C can cancel it
// mid-request rather than waiting for all three proxy timeouts.
async function handleRSS(res, out) {
  if (blogCache && !blogCache.startsWith("Error")) {
    // Fast path: background prefetch already completed
    await typeHTMLInto(blogCache, out);
  } else {
    // Slow path: fetch live (first visit or prefetch hasn't resolved yet)
    await typeTextInto("Fetching posts...", out);

    // Assign a controller so the Ctrl+C keydown handler can abort this fetch
    fetchAbortController = new AbortController();
    const data = await fetchRSS(res.rss, fetchAbortController.signal);
    fetchAbortController = null; // clear after the fetch settles (success or abort)

    // If Ctrl+C fired while we were waiting, stop without rendering partial output
    if (cancelCommand) { restorePrompt(); return; }

    if (data) {
      const fp = parseRSS(data);
      out.innerHTML = ""; // clear "Fetching posts..." before showing results
      await typeHTMLInto(fp, out);
    } else {
      out.innerHTML = "";
      await typeTextInto("Error: Feed unreachable.", out);
    }
  }
  restorePrompt();
}

/* ════════════════════════════════════════════════════════
   PROCESS COMMAND
   Central dispatcher. Thin by design — all per-command logic lives in
   COMMAND_REGISTRY or the structured-type handlers above.

   Flow:
     1. Guard: block during boot
     2. Play the command sound, echo the command, push to history
     3. Route filesystem commands to handleFsCommand()
     4. Handle built-ins: man, themes, theme
     5. Look up the command in commands.js
     6. Dispatch on return type: {quote}, {rss}, {html}, sentinel, plain string
   ════════════════════════════════════════════════════════ */
async function processCommand(cmd) {
  if (isBooting) return;
  isProcessing = true;
  cancelCommand = false;
  trackCommand(cmd);

  // Empty input — gentle reminder without echoing a blank command line
  if (!cmd) {
    const out = createBlock("");
    await typeTextInto("Use the help command to see all of the available commands.", out);
    restorePrompt();
    return;
  }

  // Command click sound
  const commandSound = new Audio("../data/command.mp3");
  commandSound.volume = 0.5;
  commandSound.play().catch(() => {});

  const out = createBlock(cmd);

  // Push to history (avoid consecutive duplicates)
  if (cmd !== history[history.length - 1]) history.push(cmd);
  historyIndex = history.length;

  const [baseCmd, ...args] = cmd.trim().split(/\s+/);
  const fullArgs = args.join(" ");

  // Hide the input line while output is streaming
  desktopInputLine.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  // ── FILESYSTEM COMMANDS (ls, cd, cat, mkdir, rm, touch, pwd, nano, dir) ──
  if (FS_COMMANDS.includes(baseCmd)) {
    const fsCtx = {
      typeTextInto,
      scrollToBottom,
      isMobile,
      username,
      setIsAwaitingInput: (v) => { isAwaitingInput = v; },
      clearOutput: () => { output.innerHTML = ""; },
    };
    const signal = await handleFsCommand(baseCmd, args, out, fsCtx);
    // The filesystem handler returns "__crash__" when the user runs rm -rf /
    if (signal === "__crash__") await runCrashSequence(out);
    else restorePrompt();
    return;
  }

  // ── MAN — manual pages ──
  if (baseCmd === "man") {
    if (!fullArgs) { await typeTextInto(manUsage(), out); restorePrompt(); return; }
    const key  = fullArgs.toLowerCase();
    const page = manPages[key] || fsManPages[key];
    if (page) {
      out.style.whiteSpace = "pre";
      await typeTextInto(manFormat(fullArgs, page), out);
      out.style.whiteSpace = "";
    } else {
      await typeTextInto(manNotFound(fullArgs), out);
    }
    restorePrompt(); return;
  }

  // ── THEMES — list available themes ──
  if (baseCmd === "themes") {
    const cur  = getCurrentTheme();
    const list = Object.keys(THEMES)
      .map(k => k === cur ? `  ${k} (active)` : `  ${k}`)
      .join("\n");
    await typeTextInto(`Current theme: ${THEMES[cur].label}\n\nAvailable themes:\n${list}`, out);
    restorePrompt(); return;
  }

  // ── THEME — apply a theme by name ──
  if (baseCmd === "theme") {
    if (!fullArgs) {
      await typeTextInto(`Usage: theme <name>\nAvailable: ${Object.keys(THEMES).join(", ")}`, out);
    } else {
      const key = fullArgs.toLowerCase();
      if (!(key in THEMES)) {
        await typeTextInto(`Unknown theme: "${key}"\nAvailable: ${Object.keys(THEMES).join(", ")}`, out);
      } else {
        applyTheme(key);
        await typeTextInto(`Theme set to ${THEMES[key].label}.`, out);
      }
    }
    restorePrompt(); return;
  }

  // ── COMMAND LOOKUP ──
  if (!commands[baseCmd]) {
    await typeTextInto("Command not found. Use the help command to see all of the available commands.", out);
    restorePrompt(); return;
  }

  // Execute the command function — returns a value immediately; no async work here
  const res = commands[baseCmd]();

  // ── STRUCTURED RETURN TYPES ──
  if (res?.quote) { await handleQuote(res, out); return; }
  if (res?.rss)   { await handleRSS(res, out);   return; }
  if (res?.html)  { await typeHTMLInto(res.html, out); restorePrompt(); return; }

  // ── SENTINEL DISPATCH ──
  // Sentinel strings like "__matrix__" are looked up in COMMAND_REGISTRY.
  // processCommand never changes — only COMMAND_REGISTRY and commands.js grow.
  if (typeof res === "string" && res in COMMAND_REGISTRY) {
    await COMMAND_REGISTRY[res](out, args);
    return; // each handler calls restorePrompt() (or manages its own cleanup)
  }

  // ── PLAIN STRING (fallback) ──
  if (res) {
    out.style.whiteSpace = "pre";
    if (isMobile()) out.classList.add("output-scroll");
    await typeTextInto(res, out);
    out.style.whiteSpace = "";
    restorePrompt();
  }
}

/* ════════════════════════════════════════════════════════
   BOOT SEQUENCE
   ════════════════════════════════════════════════════════ */
// Runs after a successful login (or auto-login on page load).
// Shows the ASCII logo and boot messages, then enables input.
async function boot() {
  isBooting = true;
  desktopInputLine.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  // Kick off the background RSS prefetch immediately so `blog` is fast later
  startPrefetch();

  const bootSound = new Audio("../data/boot.mp3");
  bootSound.volume = 0.5;
  bootSound.play().catch(() => {});

  // Full-width ASCII logo (same art shown in the login screen banner)
  const ascii = `
 ██████████             ███                              ███████     █████████
░░███░░░░███           ░░░                             ███░░░░░███  ███░░░░░███
 ░███   ░░███  ██████  ████  █████████████    ██████  ███     ░░███░███    ░░░
 ░███    ░███ ███░░███░░███ ░░███░░███░░███  ███░░███░███      ░███░░█████████
 ░███    ░███░███████  ░███  ░███ ░███ ░███ ░███ ░███░███      ░███ ░░░░░░░░███
 ░███    ███ ░███░░░   ░███  ░███ ░███ ░███ ░███ ░███░░███     ███  ███    ░███
 ██████████  ░░██████  █████ █████░███ █████░░██████  ░░░███████░  ░░█████████
░░░░░░░░░░    ░░░░░░  ░░░░░ ░░░░░ ░░░ ░░░░░  ░░░░░░     ░░░░░░░     ░░░░░░░░░
`;

  const visits = window._visitCount || 1;
  const visitSuffix = visits === 1 ? "1st" : visits === 2 ? "2nd" : visits === 3 ? "3rd" : `${visits}th`;
  const welcomeMsg  = visits === 1
    ? `Welcome, ${username}!`
    : `Welcome back, ${username}! This is your ${visitSuffix} visit.`;

  // Boot sequence lines — "ASCII" is a placeholder that triggers art insertion
  const lines = [
    "Booting DeimoOS...",
    "Loading kernel...",
    "Mounting filesystem...",
    "",
    "ASCII",
    "",
    welcomeMsg,
    "Use the help command to see all of the available commands.",
  ];

  for (const line of lines) {
    if (line === "ASCII") {
      if (!isMobile()) {
        // ASCII art is too wide to be legible on small screens; skip it on mobile
        const pre = document.createElement("pre");
        pre.innerText = ascii;
        output.appendChild(pre);
        output.appendChild(document.createElement("div")).innerHTML = "&nbsp;";
      }
    } else {
      const el = document.createElement("div");
      el.textContent = line;
      output.appendChild(el);
    }
    scrollToBottom();
    await new Promise(r => setTimeout(r, 300));
  }

  isBooting = false;
  updatePrompt();
  resetScreensaverTimer();

  if (isMobile()) setupMobileInput();
  else {
    desktopInputLine.style.display = "flex";
    renderInput();
  }
}

/* ════════════════════════════════════════════════════════
   MOBILE INPUT
   ════════════════════════════════════════════════════════ */
// On mobile, keyboard input goes through a native <input> in the fixed bar
// at the bottom of the screen rather than through the document keydown handler.
function setupMobileInput() {
  mobileBar.classList.add("visible");
  const handleSubmit = async () => {
    const cmd = mobileField.value.trim().toLowerCase();
    mobileField.value = "";
    await processCommand(cmd);
  };
  mobileSubmit.onclick = handleSubmit;
  mobileField.onkeydown = (e) => { if (e.key === "Enter") handleSubmit(); };
}

/* ════════════════════════════════════════════════════════
   LOGIN
   ════════════════════════════════════════════════════════ */
// Called when the user submits the login form (Enter key or button click).
// Validates the username, increments the per-user visit counter, then hides
// the login screen and starts the boot sequence.
function submitLogin(e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const raw = usernameInput.value.trim() || "user";

  if (isUsernameBanned(raw)) {
    const errEl = document.getElementById("loginError");
    if (errEl) {
      errEl.textContent = "> That username is reserved. Try another.";
      errEl.style.display = "block";
    }
    usernameInput.value = "";
    usernameInput.focus();
    return;
  }

  username = raw;
  window._termUsername = username;
  window._sessionStart = Date.now();

  // Per-username visit counter — persists across sessions so returning visitors
  // get a personalised welcome message ("This is your 5th visit.")
  const visitKey = `visits_${username}`;
  const visits   = parseInt(localStorage.getItem(visitKey) || "0") + 1;
  localStorage.setItem(visitKey, visits);
  localStorage.setItem("username", username); // save for auto-login next time
  window._visitCount = visits;

  loginScreen.style.display = "none";
  boot();
}

// On page load: apply the saved theme and, if a username is stored in localStorage,
// skip the login screen entirely (returning-visitor auto-login).
window.addEventListener("load", () => {
  applyTheme(getCurrentTheme());
  const savedUsername = localStorage.getItem("username");
  if (savedUsername && !isUsernameBanned(savedUsername)) {
    username = savedUsername;
    window._termUsername = username;
    window._sessionStart = Date.now();
    const visitKey = `visits_${username}`;
    const visits   = parseInt(localStorage.getItem(visitKey) || "0") + 1;
    localStorage.setItem(visitKey, visits);
    window._visitCount = visits;
    loginScreen.style.display = "none";
    boot();
  } else {
    usernameInput.focus();
  }
});

// Login form event wiring
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(e); });
usernameInput.addEventListener("input", () => {
  // Clear the error message as soon as the user starts typing a new username
  const errEl = document.getElementById("loginError");
  if (errEl) errEl.style.display = "none";
});
loginBtn.addEventListener("click", submitLogin);

/* ════════════════════════════════════════════════════════
   MAIN KEYBOARD HANDLER (desktop)
   ════════════════════════════════════════════════════════ */
// Handles all keyboard input after login on desktop.
// Guards at the top skip keystrokes during states where they'd be invalid or
// confusing (boot, game, awaiting inline input, login screen visible).
document.addEventListener("keydown", async (e) => {
  // Skip when: on mobile (has its own input bar), login screen is up,
  // system is booting, a command is awaiting inline input, or game is active
  if (isMobile() || loginScreen.style.display !== "none" || isBooting || isAwaitingInput || isGameActive) return;

  // ── Ctrl+C — cancel running command ──
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    if (isProcessing) {
      cancelCommand = true;
      // Also abort any in-flight fetch (RSS blog posts, etc.) so the network
      // request doesn't keep running silently in the background after Ctrl+C
      fetchAbortController?.abort();
      const d = document.createElement("div");
      d.style.color = getThemeColors().error;
      d.textContent = "^C";
      output.appendChild(d);
      scrollToBottom();
    }
    return;
  }

  // While a command is executing, only Ctrl+C is handled (above); all other keys ignored
  if (isProcessing) return;

  // Prevent these keys from triggering browser-default behaviour (page scroll, caret movement)
  if (["ArrowLeft", "ArrowRight", "Backspace", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();

  // ── Tab autocomplete ──
  if (e.key === "Tab") {
    e.preventDefault();
    const allCmds = [...Object.keys(commands), "man", "theme", "themes"];
    const input   = currentInput.toLowerCase();
    const parts   = input.trimStart().split(/\s+/);

    // Filesystem path autocomplete: "cat co" → "cat contact.txt"
    if (FS_COMMANDS.includes(parts[0]) && parts.length >= 2) {
      const partial   = parts[parts.length - 1];
      const prefix    = parts.slice(0, -1).join(" ") + " ";
      // Each FS command completes a different node type
      const filterMap = { cd: "dirs", mkdir: "dirs", cat: "files", touch: "files", nano: "files" };
      let typeFilter  = filterMap[parts[0]] || "all";
      // rm without -r completes files; rm -r completes directories
      if (parts[0] === "rm") {
        const recursive = parts.slice(1, -1).some(p => p.startsWith("-") && /r/i.test(p));
        typeFilter = recursive ? "dirs" : "files";
      }
      const matches = getPathCompletions(partial, typeFilter);
      if (matches.length === 1) {
        currentInput = prefix + matches[0];
        cursorPos = currentInput.length;
        renderInput();
      } else if (matches.length > 1) {
        // Show all candidates on a dim line; fill the longest common prefix
        const d = document.createElement("div");
        d.style.color = getThemeColors().dim;
        d.textContent = matches.join("   ");
        output.appendChild(d);
        scrollToBottom();
        const common = matches.reduce((a, b) => {
          let i = 0;
          while (i < a.length && i < b.length && a[i] === b[i]) i++;
          return a.slice(0, i);
        });
        if (common.length > partial.length) {
          currentInput = prefix + common;
          cursorPos = currentInput.length;
          renderInput();
        }
      }
      return;
    }

    // "man <partial>" — autocomplete against known man page keys
    if (parts[0] === "man" && parts.length >= 2) {
      const partial = parts[1] || "";
      const matches = Object.keys(manPages).filter(k => k.startsWith(partial));
      if (matches.length === 1) {
        currentInput = "man " + matches[0];
        cursorPos = currentInput.length;
        renderInput();
      } else if (matches.length > 1) {
        const d = document.createElement("div");
        d.style.color = getThemeColors().dim;
        d.textContent = matches.join("   ");
        output.appendChild(d);
        scrollToBottom();
      }
      return;
    }

    // "theme <partial>" — autocomplete theme name
    if (parts[0] === "theme" && parts.length >= 2) {
      const partial = (parts[1] || "").toLowerCase();
      const matches = Object.keys(THEMES).filter(k => k.startsWith(partial));
      if (matches.length === 1) {
        currentInput = "theme " + matches[0];
        cursorPos = currentInput.length;
        renderInput();
      } else if (matches.length > 1) {
        const d = document.createElement("div");
        d.style.color = getThemeColors().dim;
        d.textContent = matches.join("   ");
        output.appendChild(d);
        scrollToBottom();
      }
      return;
    }

    // Normal command autocomplete
    const partial = input.trim();
    if (!partial) return;
    const matches = allCmds.filter(c => c.startsWith(partial)).sort((a, b) => a.length - b.length);
    if (matches.length === 1) {
      currentInput = matches[0];
      cursorPos = currentInput.length;
      renderInput();
    } else if (matches.length > 1) {
      const d = document.createElement("div");
      d.style.color = getThemeColors().dim;
      d.textContent = matches.join("   ");
      output.appendChild(d);
      scrollToBottom();
    }
    return;
  }

  // ── Main key dispatch ──
  switch (e.key) {
    case "Enter":
      // Submit the input buffer, clear it, and execute the command
      const cmd = currentInput.trim().toLowerCase();
      currentInput = "";
      cursorPos = 0;
      renderInput();
      await processCommand(cmd);
      break;

    case "Backspace":
      // Delete the character immediately before the cursor (not after it)
      if (cursorPos > 0) {
        currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos);
        cursorPos--;
      }
      renderInput();
      break;

    case "ArrowUp":
      // Navigate backwards through command history
      if (historyIndex > 0) {
        historyIndex--;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        renderInput();
      }
      break;

    case "ArrowDown":
      // Navigate forwards; past the end of history → empty input
      if (historyIndex < history.length - 1) {
        historyIndex++;
        currentInput = history[historyIndex];
        cursorPos = currentInput.length;
        renderInput();
      } else {
        historyIndex = history.length;
        currentInput = "";
        cursorPos = 0;
        renderInput();
      }
      break;

    case "ArrowLeft":
      if (cursorPos > 0) cursorPos--;
      renderInput();
      break;

    case "ArrowRight":
      if (cursorPos < currentInput.length) cursorPos++;
      renderInput();
      break;

    default:
      // Any printable single character inserts at the cursor position
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        currentInput = currentInput.slice(0, cursorPos) + e.key + currentInput.slice(cursorPos);
        cursorPos++;
        renderInput();
      }
  }
});
