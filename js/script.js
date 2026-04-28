import { commands, manFormat, manUsage, manNotFound, leaderboardFormat } from "./commands.js";
import { bannedUsernames, bannedPatterns } from "../data/banned.js";
import { manPages } from "../data/man.js";

const terminal      = document.getElementById("terminal");
const output        = document.getElementById("output");
const inputDisplay  = document.getElementById("inputDisplay");
const loginScreen   = document.getElementById("login-screen");
const usernameInput = document.getElementById("usernameInput");
const promptEl      = document.getElementById("prompt");
const loginBtn      = document.getElementById("loginBtn");

/* ── MOBILE UI ELEMENTS ── */
const mobileBar     = document.getElementById("mobileBar");
const mobileField   = document.getElementById("mobileField");
const mobileSubmit  = document.getElementById("mobileSubmit");
const mobilePrompt  = document.getElementById("mobilePrompt");

/* ── STATE ── */
let username        = "user";
const host          = "deimo.me";
let history         = [];
let historyIndex    = -1;
let currentInput    = "";
let cursorPos       = 0;
let isBooting           = false;
let isAwaitingInput     = false;
let isGameActive        = false;
let isProcessing        = false;
let blogCache           = null;
let screensaverActive   = false;
let screensaverTimer    = null;
let screensaverCanvas   = null;
let screensaverInterval = null;

/* ── MOBILE DETECTION ── */
const isMobile = () =>
  window.matchMedia("(max-width: 600px)").matches || 
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/* ── DATA PATH HELPER ── */
// Resolves the correct path to /data/ files regardless of environment.
// Live Server serves from root so script.js is at /js/script.js → ../data/ works.
// If the file is opened directly (file://) we fall back to ./data/.
const dataPath = (file) => {
  if (window.location.protocol === "file:") return `./data/${file}`;
  return `../data/${file}`;
};

/* ── AUDIO UNLOCK ── */
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

/* ── SCREENSAVER ── */
function startScreensaver() {
  if (screensaverActive || isBooting || isGameActive || isAwaitingInput || isProcessing) return;
  if (loginScreen.style.display !== "none") return;
  screensaverActive = true;
  screensaverCanvas = document.createElement("canvas");
  screensaverCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9996;opacity:0;transition:opacity 1.5s ease;cursor:none;";
  document.body.appendChild(screensaverCanvas);
  const ctx = screensaverCanvas.getContext("2d");
  screensaverCanvas.width  = window.innerWidth;
  screensaverCanvas.height = window.innerHeight;
  const fontSize = 16;
  const cols  = Math.floor(screensaverCanvas.width / fontSize);
  const drops = Array(cols).fill(1);
  const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
  screensaverInterval = setInterval(() => {
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, 0, screensaverCanvas.width, screensaverCanvas.height);
    ctx.fillStyle = "#00ff9f";
    ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;
    for (let i = 0; i < drops.length; i++) {
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > screensaverCanvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }, 40);
  screensaverCanvas.addEventListener("click",      stopScreensaver, { once: true });
  screensaverCanvas.addEventListener("touchstart", stopScreensaver, { once: true, passive: true });
  requestAnimationFrame(() => requestAnimationFrame(() => { screensaverCanvas.style.opacity = "1"; }));
}

function stopScreensaver() {
  if (!screensaverActive) return;
  screensaverActive = false;
  clearInterval(screensaverInterval);
  screensaverInterval = null;
  if (screensaverCanvas) {
    screensaverCanvas.style.transition = "opacity 0.6s ease";
    screensaverCanvas.style.opacity = "0";
    screensaverCanvas.addEventListener("transitionend", () => {
      screensaverCanvas && screensaverCanvas.remove();
      screensaverCanvas = null;
    }, { once: true });
  }
}

function resetScreensaverTimer() {
  clearTimeout(screensaverTimer);
  if (screensaverActive) stopScreensaver();
  screensaverTimer = setTimeout(startScreensaver, 2 * 60 * 1000);
}
["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(ev =>
  document.addEventListener(ev, resetScreensaverTimer, { passive: true })
);

/* ── ANALYTICS ── */
function trackCommand(cmd) {
  if (typeof umami === "undefined") return;
  umami.track("command", { command: cmd || "(empty)" });
}

/* ── USERNAME VALIDATION ── */
function isUsernameBanned(name) {
  const lower = name.toLowerCase();
  if (bannedUsernames.includes(lower)) return true;
  if (bannedPatterns.some(pattern => pattern.test(lower))) return true;
  return false;
}

/* ── PROMPT ── */
function updatePrompt() {
  const promptHTML = 
    `<span class="prompt-user">${username}</span>` +
    `<span class="prompt-host">@${host}</span>` +
    `<span class="prompt-path">:~$</span>&nbsp;`;
  
  promptEl.innerHTML = promptHTML;
  if (mobilePrompt) mobilePrompt.innerHTML = `${username}@${host}:~$ `;
}

function scrollToBottom() {
  terminal.scrollTo({ top: terminal.scrollHeight, behavior: "smooth" });
}

function renderInput() {
  if (isMobile() || isGameActive || isBooting) {
    inputDisplay.innerHTML = "";
    return;
  }
  
  const before = currentInput.slice(0, cursorPos);
  const char   = currentInput[cursorPos] || " ";
  const after  = currentInput.slice(cursorPos + 1);
  inputDisplay.innerHTML = before + `<span class="cursor">${char}</span>` + after;
}

function createBlock(cmd) {
  const block = document.createElement("div");
  block.classList.add("block");
  const c = document.createElement("div");
  c.classList.add("command");
  c.textContent = `${username}@${host}:~$ ${cmd}`;
  const o = document.createElement("div");
  o.classList.add("output");
  block.appendChild(c);
  block.appendChild(o);
  output.appendChild(block);
  scrollToBottom();
  return o;
}

function typeTextInto(text, el, speed = 3) {
  return new Promise((resolve) => {
    let i = 0;
    function type() {
      if (cancelCommand) { resolve(); return; }
      if (i < text.length) {
        el.innerHTML += text[i++];
        scrollToBottom();
        setTimeout(type, speed);
      } else resolve();
    }
    type();
  });
}

function typeHTMLInto(html, el, speed = 3) {
  return new Promise((resolve) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const plainText = tmp.textContent;
    el.style.whiteSpace = "pre-wrap";
    let i = 0;
    function type() {
      if (cancelCommand) { el.style.whiteSpace = ""; resolve(); return; }
      if (i < plainText.length) {
        el.textContent = plainText.slice(0, ++i);
        scrollToBottom();
        setTimeout(type, speed);
      } else {
        el.style.whiteSpace = "";
        el.innerHTML = html;
        resolve();
      }
    }
    type();
  });
}

/* ── RSS/ATOM PARSING ── */
function extractLink(item) {
  const linkTag = item.querySelector("link");
  if (linkTag) {
    const href = linkTag.getAttribute("href");
    if (href) return href;
    if (linkTag.textContent.trim()) return linkTag.textContent.trim();
  }
  const guid = item.querySelector("guid");
  if (guid && guid.textContent.trim().startsWith("http")) return guid.textContent.trim();
  const id = item.querySelector("id");
  if (id && id.textContent.trim().startsWith("http")) return id.textContent.trim();
  return "#";
}

function parseRSS(data) {
  try {
    let xmlString = data;
    if (typeof data === "string" && data.trim().startsWith("{")) {
        try {
            const json = JSON.parse(data);
            xmlString = json.contents;
        } catch (e) { console.error("JSON parse failed", e); }
    }
    if (xmlString.includes("base64,")) {
        xmlString = atob(xmlString.split("base64,")[1]);
    }
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, "text/xml");
    let items = [...xml.querySelectorAll("item")];
    if (items.length === 0) items = [...xml.querySelectorAll("entry")];
    if (items.length === 0) return "Error: No posts found in the feed.";
    return items.map(item => {
      const title = item.querySelector("title")?.textContent.trim() || "(untitled)";
      const dateEl = item.querySelector("pubDate") || item.querySelector("published") || item.querySelector("updated");
      const date = dateEl ? new Date(dateEl.textContent).toLocaleDateString("en-GB") : "";
      const link = extractLink(item);
      return `- <a href="${link}" target="_blank" class="terminal-link">${title}</a> <span style="color:#009966">(${date})</span>`;
    }).join("\n");
  } catch (err) {
    console.error("Parsing error:", err);
    return "Error parsing blog feed.";
  }
}

async function fetchRSS(rssUrl) {
  const fetchFromProxy = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Proxy ${url} returned ${r.status}`);
    return await r.text();
  };
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(rssUrl)}`,
    `https://corsproxy.io/?${encodeURIComponent(rssUrl)}`,
    `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(rssUrl)}`
  ];
  try {
    return await Promise.any(proxies.map(p => fetchFromProxy(p)));
  } catch (e) {
    console.error("All proxies failed.", e);
    return null;
  }
}

async function startPrefetch() {
    const data = await fetchRSS("https://deimo.me/feed/");
    if (data) blogCache = parseRSS(data);
}


/* ── LEADERBOARD ── */
// leaderboard.json is fetched at runtime so you can edit it as plain text.
// Bump "version" in the JSON to push a reset to all visitors on next load.

async function fetchLeaderboardSeed() {
  try {
    const res = await fetch(dataPath("leaderboard.json") + "?v=" + Date.now());
    if (!res.ok) throw new Error("fetch failed");
    return await res.json();
  } catch {
    return { version: 0, leaderboard: [] };
  }
}

// Simple hash of the seed entries so any score/name edit is detected
// without needing a manual version bump.
function hashSeed(entries) {
  return entries.map(e => `${e.username}:${e.score}`).join("|");
}

async function loadLeaderboard() {
  try {
    const saved      = localStorage.getItem("snake_leaderboard");
    const versionKey = "snake_leaderboard_version";
    const hashKey    = "snake_leaderboard_hash";
    const storedVer  = localStorage.getItem(versionKey);
    const storedHash = localStorage.getItem(hashKey);
    const seed       = await fetchLeaderboardSeed();
    const seedHash   = hashSeed(seed.leaderboard);

    // Re-seed if: nothing saved, version bumped, OR seed content changed
    if (!saved || storedVer !== String(seed.version) || storedHash !== seedHash) {
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

function saveLeaderboard(board) {
  localStorage.setItem("snake_leaderboard", JSON.stringify(board));
  // Skip server write on Live Server / static environments (no backend)
  if (window.location.port === "5500" || window.location.protocol === "file:") return;
  fetch("/api/leaderboard", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ leaderboard: board })
  }).catch(() => {}); // silent fail — localStorage is always the source of truth
}

async function addLeaderboardEntry(user, score) {
  const board = await loadLeaderboard();
  board.push({ username: user, score });
  board.sort((a, b) => b.score - a.score);
  const top5 = board.slice(0, 5);
  saveLeaderboard(top5);
  return top5;
}

async function showLeaderboard(out) {
  const board = await loadLeaderboard();
  await typeTextInto(leaderboardFormat(board), out);
}



/* ── PROCESS COMMAND ── */
let cancelCommand = false;

async function processCommand(cmd) {
  if (isBooting) return;
  isProcessing = true;
  cancelCommand = false;
  trackCommand(cmd);

  if (!cmd) {
    const out = createBlock("");
    await typeTextInto("Use the help command to see all of the available commands.", out);
    const dil = document.getElementById("desktopInputLine");
    if (dil && !isMobile()) dil.style.display = "flex";
    if (isMobile()) mobileBar.classList.add("visible");
    isProcessing = false;
    renderInput();
    return;
  }

  const commandSound = new Audio("../data/command.mp3");
  commandSound.volume = 0.5;
  commandSound.play().catch(() => {});

  const out = createBlock(cmd);
  if (cmd !== history[history.length - 1]) history.push(cmd);
  historyIndex = history.length;

  const [baseCmd, ...args] = cmd.trim().split(/\s+/);
  const fullArgs = args.join(" ");

  const desktopInputLine = document.getElementById("desktopInputLine");

  const restorePrompt = () => {
    isProcessing = false;
    cancelCommand = false;
    if (desktopInputLine && !isMobile()) desktopInputLine.style.display = "flex";
    if (isMobile()) mobileBar.classList.add("visible");
    renderInput();
  };
  if (desktopInputLine) desktopInputLine.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  /* ── MAN ── */
  if (baseCmd === "man") {
    if (!fullArgs) {
      await typeTextInto(manUsage(), out);
      restorePrompt(); return;
    }
    const page = manPages[fullArgs.toLowerCase()];
    if (page) {
      await typeTextInto(manFormat(fullArgs, page), out);
    } else {
      await typeTextInto(manNotFound(fullArgs), out);
    }
    restorePrompt(); return;
  }

  if (!commands[baseCmd]) {
    await typeTextInto("Command not found. Use the help command to see all of the available commands.", out);
    restorePrompt(); return;
  }

  const res = commands[baseCmd]();

  /* ── SNAKE LEADERBOARD ── */
  if (res === "__snake-leaderboard__") {
    await showLeaderboard(out);
    restorePrompt(); return;
  }



  /* ── CHANGELOG ── */
  if (res === "__changelog__") {
    try {
      const r = await fetch(dataPath("changelog.txt") + "?v=" + Date.now());
      if (!r.ok) throw new Error("fetch failed");
      // Collapse 2+ consecutive blank lines down to 1, trim edges
      const text = (await r.text())
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      out.style.whiteSpace = "pre";
      if (isMobile()) out.classList.add("output-scroll");
      await typeTextInto(text, out);
      out.style.whiteSpace = "";
    } catch {
      await typeTextInto("Error: Could not load changelog.", out);
    }
    restorePrompt(); return;
  }

  if (res === "__clear__") {
    const wipe = document.createElement("div");
    wipe.classList.add("clear-wipe");
    document.body.appendChild(wipe);
    wipe.addEventListener("animationend", () => wipe.remove());
    await new Promise(r => setTimeout(r, 150));
    output.innerHTML = "";
    restorePrompt(); return;
  }

  /* ── CRASH ── */
  if (res === "__crash__") {
    if (fullArgs !== "-rf /") {
      await typeTextInto("rm: missing operand", out);
      restorePrompt(); return;
    }
    isBooting = true;
    await typeTextInto("WARNING: You are about to delete the root directory.", out);
    await new Promise(r => setTimeout(r, 800));
    await typeTextInto("\nExecuting...", out);
    await new Promise(r => setTimeout(r, 500));
    const errors = ["Deleting /bin...", "Deleting /etc...", "Deleting /home...", "CRITICAL: Kernel integrity lost", "FATAL: /sbin/init not found", "PANIC: Attempted to kill init!", "Memory dump at 0x004F3A2...", "SYSTEM_FAILURE_000x042", "Connection reset by peer"];
    for (let i = 0; i < 30; i++) {
      const div = document.createElement("div");
      div.style.color = i % 5 === 0 ? "#ff4437" : "#00ff9f";
      div.textContent = `[${(Math.random() * 100).toFixed(4)}] ${errors[i % errors.length]}`;
      output.appendChild(div); scrollToBottom();
      await new Promise(r => setTimeout(r, 30));
      if (i === 15) terminal.style.filter = "invert(1) contrast(2)";
    }
    terminal.style.animation = "flicker 0.1s infinite alternate";
    await new Promise(r => setTimeout(r, 1000));
    terminal.style.filter = ""; terminal.style.animation = "";
    output.innerHTML = "";
    document.body.style.background = "white";
    await new Promise(r => setTimeout(r, 100));
    document.body.style.background = "black";
    usernameInput.value = "";
    loginScreen.style.display = "flex"; usernameInput.focus();
    isBooting = false; isProcessing = false;
    return;
  }

  /* ── HACK ── */
  if (res === "__hack__") {
    await typeTextInto("Initializing Matrix Bypass...", out);
    const hackLines = ["Security Alert: Breach detected", "SQL Injection: Success", "RSA Layer: Decrypted", "Overriding Mainframe..."];
    for (let i = 0; i < 20; i++) {
      if (cancelCommand) break;
      const div = document.createElement("div"); div.style.color = "#00ff9f";
      div.textContent = `[${Math.random().toString(16).substring(2, 8).toUpperCase()}] ${hackLines[i % 4]}`;
      output.appendChild(div); scrollToBottom();
      await new Promise(r => setTimeout(r, 40));
    }
    if (!cancelCommand) {
      const prog = document.createElement("div"); output.appendChild(prog);
      for (let i = 0; i <= 100; i += 10) {
        if (cancelCommand) break;
        prog.textContent = `DECRYPTING: [${"#".repeat(i/10)}${".".repeat(10-i/10)}] ${i}%`;
        scrollToBottom(); await new Promise(r => setTimeout(r, 80));
      }
    }
    if (!cancelCommand) {
      const granted = document.createElement("div");
      granted.innerHTML = `<br><span style="color:#ff4437; font-size: 22px; font-weight: bold;">[ ACCESS DENIED. FIREWALL ACTIVATED ]</span><br>`;
      output.appendChild(granted); scrollToBottom();
    }
    restorePrompt(); return;
  }

  /* ── MATRIX ── */
  if (res === "__matrix__") {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9997; pointer-events: none; opacity: 1; transition: opacity 1s ease;";
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const fontSize = 16; const cols = Math.floor(canvas.width / fontSize);
    const drops = Array(cols).fill(1);
    const chars = "\u30A2\u30A4\u30A6\u30A8\u30AA\u30AB\u30AD\u30AF\u30B1\u30B30123456789ABCDEF";
    const interval = setInterval(() => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00ff9f"; ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;
      for (let i = 0; i < drops.length; i++) {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }, 40);
    for (let i = 0; i < 80; i++) {
      if (cancelCommand) break;
      await new Promise(r => setTimeout(r, 100));
    }
    clearInterval(interval);
    canvas.style.opacity = "0";
    await new Promise(r => setTimeout(r, 1000));
    canvas.remove();
    restorePrompt(); return;
  }

  /* ── SUDO ── */
  if (res === "__sudo__") {
    const askPassword = () => new Promise((resolve) => {
      isAwaitingInput = true;
      const line = document.createElement("div");
      line.textContent = "[sudo] password for root: ";
      out.appendChild(line); scrollToBottom();
      const input = document.createElement("input"); input.type = "password";
      input.style.cssText = "background: transparent; border: none; outline: none; color: transparent; caret-color: #00ff9f; font-family: inherit; font-size: inherit; width: 1px;";
      line.appendChild(input);
      const asterisks = document.createElement("span"); line.appendChild(asterisks);
      input.addEventListener("input", () => { asterisks.textContent = "*".repeat(input.value.length); });
      setTimeout(() => input.focus(), 50);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); input.remove(); asterisks.remove(); isAwaitingInput = false; resolve(); }
      });
    });
    await askPassword();
    await typeTextInto("Sorry, try again.", out);
    await askPassword();
    await typeTextInto("Sorry, try again.", out);
    await askPassword();
    await typeTextInto("Sorry, try again.\nsudo: 3 incorrect password attempts", out);
    restorePrompt(); return;
  }

  /* ── WHOAMI ── */
  if (res === "__whoami__") {
    const sessionStart = window._sessionStart ? new Date(window._sessionStart).toLocaleTimeString("en-GB") : "unknown";
    await typeTextInto(`User     : ${username}\nHost     : ${host}\nShell    : deimosh\nSession  : started at ${sessionStart}\nBrowser  : ${navigator.userAgent.split(")")[0].split("(")[1] || "unknown"}`, out);
    restorePrompt(); return;
  }

  /* ── NEOFETCH ── */
  if (res === "__neofetch__") {
    const ascii = ["", "██████████  ", "░░███░░░░███ ", " ░███   ░░███", " ░███    ░███", " ░███    ░███", " ░███    ███ ", " ██████████  ", "░░░░░░░░░░   "];
    const info  = [`${username}@${host}`, "─".repeat(24), `OS       : DeimoOS 0.5.1`, `Shell    : deimo.sh`, `Engine   : Vanilla JS`, `Host     : ${host}`, `Uptime   : ${Math.floor((Date.now() - (window._sessionStart || Date.now())) / 1000)}s`, `Theme    : Matrix Green`, `Font     : Share Tech Mono`];
    const el = document.createElement("div");
    el.style.whiteSpace = "pre";
    out.appendChild(el);

    if (isMobile()) {
      // Mobile: skip block art — just show info cleanly
      el.classList.add("output-scroll");
      for (let i = 0; i < info.length; i++) {
        el.innerHTML += `<span style="color:#00d4ff">${info[i]}</span>\n`;
        scrollToBottom(); await new Promise(r => setTimeout(r, 60));
      }
    } else {
      // Desktop: full ascii + info side by side
      const totalRows = Math.max(ascii.length, info.length);
      for (let i = 0; i < totalRows; i++) {
        el.innerHTML += `<span style="color:#ffffff">${(ascii[i] || "").padEnd(16)}</span>  <span style="color:#00d4ff">${info[i] || ""}</span>\n`;
        scrollToBottom(); await new Promise(r => setTimeout(r, 60));
      }
    }
    restorePrompt(); return;
  }

  /* ── SNAKE ── */
  if (res === "__snake__") {
    isGameActive = true;
    if (inputDisplay) inputDisplay.innerHTML = "";

    // Responsive sizing — fit within available screen width on mobile
    const mobile    = isMobile();
    const maxWidth  = mobile ? Math.floor((window.innerWidth - 32) / 1) : 500;
    const cols      = mobile ? 20 : 25;
    const rows      = mobile ? 18 : 20;
    const size      = mobile ? Math.floor(maxWidth / cols) : 20;
    const speed     = mobile ? 140 : 120;

    // Container holds canvas + score + optional d-pad
    const container = document.createElement("div");
    container.style.cssText = "display:inline-flex; flex-direction:column; align-items:center; gap:8px; margin-top:6px;";

    const wrapper = document.createElement("div");
    wrapper.style.cssText = "border:1px solid #00ff9f; display:inline-block;";
    const canvas = document.createElement("canvas");
    canvas.width  = cols * size;
    canvas.height = rows * size;
    canvas.style.display = "block";
    wrapper.appendChild(canvas);
    container.appendChild(wrapper);
    out.appendChild(container);

    const ctx = canvas.getContext("2d");
    let snake   = [{x:Math.floor(cols/2),y:Math.floor(rows/2)},{x:Math.floor(cols/2)-1,y:Math.floor(rows/2)},{x:Math.floor(cols/2)-2,y:Math.floor(rows/2)}];
    let dir     = {x:1,y:0};
    let nextDir = {x:1,y:0};
    let food    = {x:5,y:5};
    let score   = 0;
    let running = true;

    const scoreEl = document.createElement("div");
    scoreEl.style.cssText = "margin-top:4px; font-size:" + (mobile ? "12px" : "inherit");
    scoreEl.textContent = mobile ? "Score: 0  |  Q to quit" : "Score: 0  |  WASD or Arrow Keys  |  Q to quit";
    container.appendChild(scoreEl);

    // Mobile D-pad
    if (mobile) {
      const dpad = document.createElement("div");
      dpad.style.cssText = "display:grid; grid-template-columns:repeat(3,44px); grid-template-rows:repeat(3,44px); gap:4px; margin-top:4px; user-select:none;";
      const btn = (label, col, row, dx, dy) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = `grid-column:${col}; grid-row:${row}; background:transparent; border:1px solid #00ff9f; color:#00ff9f; font-family:inherit; font-size:18px; cursor:pointer; border-radius:3px; display:flex; align-items:center; justify-content:center; -webkit-tap-highlight-color:transparent;`;
        const move = (e) => { e.preventDefault(); const nd={x:dx,y:dy}; if(!(nd.x===-dir.x&&nd.y===-dir.y)) nextDir=nd; };
        b.addEventListener("touchstart", move, {passive:false});
        b.addEventListener("mousedown",  move);
        return b;
      };
      dpad.appendChild(btn("▲", 2, 1,  0, -1));
      dpad.appendChild(btn("◀", 1, 2, -1,  0));
      dpad.appendChild(btn("▶", 3, 2,  1,  0));
      dpad.appendChild(btn("▼", 2, 3,  0,  1));
      const qBtn = document.createElement("button");
      qBtn.textContent = "■ Quit";
      qBtn.style.cssText = "background:transparent; border:1px solid #ff4437; color:#ff4437; font-family:inherit; font-size:13px; cursor:pointer; border-radius:3px; padding:6px; margin-top:2px; width:140px;";
      qBtn.addEventListener("touchstart", (e) => { e.preventDefault(); running = false; }, {passive:false});
      qBtn.addEventListener("mousedown", () => { running = false; });
      const dpadWrap = document.createElement("div");
      dpadWrap.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:4px;";
      dpadWrap.appendChild(dpad);
      dpadWrap.appendChild(qBtn);
      container.appendChild(dpadWrap);
    }

    scrollToBottom();

    const placeFood = () => { food = {x:Math.floor(Math.random()*cols), y:Math.floor(Math.random()*rows)}; };
    const draw = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = "#00ff9f"; for (const s of snake) ctx.fillRect(s.x*size,s.y*size,size-2,size-2);
      ctx.fillStyle = "#ff4437"; ctx.fillRect(food.x*size,food.y*size,size-2,size-2);
    };
    const keyHandler = (e) => {
      const map = {ArrowUp:{x:0,y:-1},w:{x:0,y:-1},ArrowDown:{x:0,y:1},s:{x:0,y:1},ArrowLeft:{x:-1,y:0},a:{x:-1,y:0},ArrowRight:{x:1,y:0},d:{x:1,y:0}};
      if (e.key === "Enter") { e.preventDefault(); return; }
      if (e.key === "q" || e.key === "Q") { running = false; return; }
      const newDir = map[e.key];
      if (newDir && !(newDir.x===-dir.x&&newDir.y===-dir.y)) nextDir = newDir;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
    };
    document.addEventListener("keydown", keyHandler);

    const loop = setInterval(async () => {
      if (!running) {
        clearInterval(loop);
        document.removeEventListener("keydown", keyHandler);
        scoreEl.textContent = `Game Over! Final score: ${score}`;
        await addLeaderboardEntry(username, score);
        await new Promise(r => setTimeout(r, 600));
        const lbOut = document.createElement("div"); lbOut.classList.add("output"); out.appendChild(lbOut);
        await showLeaderboard(lbOut);
        isGameActive = false;
        restorePrompt(); scrollToBottom();
        return;
      }
      dir = nextDir;
      const head = {x:snake[0].x+dir.x, y:snake[0].y+dir.y};
      if (head.x<0||head.x>=cols||head.y<0||head.y>=rows||snake.some(s=>s.x===head.x&&s.y===head.y)) { running=false; return; }
      snake.unshift(head);
      if (head.x===food.x&&head.y===food.y) {
        score++;
        scoreEl.textContent = mobile ? `Score: ${score}  |  Q to quit` : `Score: ${score}  |  WASD or Arrow Keys  |  Q to quit`;
        placeFood();
      } else { snake.pop(); }
      draw();
    }, speed);

    draw();
    return;
  }


  /* ── LOGOUT ── */
  if (res === "__logout__") {
    localStorage.removeItem("username");
    isBooting = true; clearTimeout(screensaverTimer); stopScreensaver();
    const sessionSecs = Math.floor((Date.now() - (window._sessionStart || Date.now())) / 1000);
    const sessionTime = sessionSecs < 60 ? `${sessionSecs}s` : `${Math.floor(sessionSecs / 60)}m ${sessionSecs % 60}s`;
    const addLine = async (text, color = "#00ff9f", delay = 320) => {
      await new Promise(r => setTimeout(r, delay));
      const d = document.createElement("div"); d.textContent = text; d.style.color = color;
      out.appendChild(d); scrollToBottom();
    };
    await addLine(`Logging out ${username}...`, "#00ff9f", 0);
    await addLine(`Session duration : ${sessionTime}`, "#009966");
    await addLine("Saving session state...", "#009966");
    await addLine("  [  OK  ] Session state saved", "#009966");
    await addLine("  [  OK  ] Terminal buffer flushed", "#009966");
    await addLine("  [  OK  ] Command history written", "#009966");
    await addLine("  [  OK  ] User environment unloaded", "#009966");
    await addLine("  [  OK  ] Auth tokens cleared", "#009966");
    await addLine(`Goodbye, ${username}.`, "#00d4ff", 400);
    await new Promise(r => setTimeout(r, 700));
    const wipe = document.createElement("div"); wipe.classList.add("clear-wipe");
    document.body.appendChild(wipe); wipe.addEventListener("animationend", () => wipe.remove());
    await new Promise(r => setTimeout(r, 500));
    output.innerHTML = ""; usernameInput.value = "";
    loginScreen.style.display = "flex"; usernameInput.focus();
    isBooting = false; isProcessing = false;
    return;
  }

  /* ── REBOOT ── */
  if (res === "__reboot__") {
    isBooting = true; clearTimeout(screensaverTimer); stopScreensaver();
    currentInput = ""; cursorPos = 0;
    const svc = async (status, label, delay = 230) => {
      await new Promise(r => setTimeout(r, delay));
      const d = document.createElement("div");
      const col = { OK: "#009966", WAIT: "#ffaa00", FAIL: "#ff4437" };
      const tag = { OK: "  [  OK  ]", WAIT: "  [ WAIT ]", FAIL: "  [ FAIL ]" };
      d.innerHTML = `<span style="color:${col[status]}">${tag[status]}</span> ${label}`;
      out.appendChild(d); scrollToBottom();
    };
    const hdr = async (text, color = "#00ff9f", delay = 120) => {
      await new Promise(r => setTimeout(r, delay));
      const d = document.createElement("div"); d.style.color = color; d.textContent = text;
      out.appendChild(d); scrollToBottom();
    };
    await hdr(`Broadcast message from root@${host}:`, "#00ff9f", 0);
    await hdr("The system is going down for reboot NOW!", "#ff4437", 150);
    await new Promise(r => setTimeout(r, 500));
    await hdr("Stopping services...", "#00ff9f", 0);
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
    await hdr("Unmounting filesystems...", "#00ff9f", 0);
    await svc("OK", "Unmounted /home/user");
    await svc("OK", "Unmounted /var/log");
    await svc("OK", "Unmounted /etc");
    await svc("OK", "Unmounted /");
    await new Promise(r => setTimeout(r, 180));
    await hdr("Syncing hardware clock...", "#00ff9f", 0);
    await new Promise(r => setTimeout(r, 480));
    await hdr("Reached target System Power Off. Rebooting...", "#ffaa00", 0);
    await new Promise(r => setTimeout(r, 900));
    let flickers = 0;
    const fi = setInterval(() => {
      terminal.style.opacity = terminal.style.opacity === "0" ? "1" : "0";
      if (++flickers >= 6) { clearInterval(fi); terminal.style.opacity = "1"; }
    }, 100);
    await new Promise(r => setTimeout(r, 800));
    const wipe = document.createElement("div"); wipe.classList.add("clear-wipe");
    document.body.appendChild(wipe); wipe.addEventListener("animationend", () => wipe.remove());
    await new Promise(r => setTimeout(r, 500));
    output.innerHTML = ""; usernameInput.value = "";
    loginScreen.style.display = "flex"; usernameInput.focus();
    isProcessing = false;
    return;
  }

  /* ── WEATHER ── */
  if (res === "__weather__") {
    await typeTextInto("Detecting location...", out);
    try {
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 }));
      const { latitude, longitude } = position.coords;
      const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
      const revData = await revRes.json();
      const city = revData.address.city || revData.address.town || revData.address.village || "Unknown";
      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m&temperature_unit=celsius`);
      const weatherData = await weatherRes.json();
      const c = weatherData.current;
      const codes = { 0:"Clear sky",1:"Mainly clear",2:"Partly cloudy",3:"Overcast",45:"Foggy",48:"Icy fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Showers",82:"Heavy showers",95:"Thunderstorm",96:"Thunderstorm w/ hail",99:"Heavy thunderstorm" };
      out.innerHTML = "";
      await typeTextInto(`Location    : ${city}, ${revData.address.country || ""}\nCondition   : ${codes[c.weathercode] || "Unknown"}\nTemperature : ${c.temperature_2m}\u00b0C\nHumidity    : ${c.relativehumidity_2m}%\nWind Speed  : ${c.windspeed_10m} km/h`, out);
    } catch (err) {
      out.innerHTML = "";
      await typeTextInto(err.code === 1 ? "Error: Location access denied." : "Error: Could not fetch weather data.", out);
    }
    restorePrompt(); return;
  }

  /* ── JOKE ── */
  if (res === "__joke__") {
    try {
      const response = await fetch("https://official-joke-api.appspot.com/jokes/programming/random");
      const data = await response.json();
      if (data && data.length > 0) {
        const { setup, punchline } = data[0];
        await typeTextInto(setup, out);
        const pause = document.createElement("div"); pause.textContent = "..."; out.appendChild(pause);
        await new Promise(r => setTimeout(r, 1500));
        const punch = document.createElement("div"); punch.style.color = "#00d4ff"; out.appendChild(punch);
        await typeTextInto(punchline, punch);
      }
    } catch (err) { await typeTextInto("Error: Failed to connect to the Joke-Server.", out); }
    restorePrompt(); return;
  }

  if (res && res.quote) {
    await typeTextInto(`"${res.quote}"`, out);
    const attr = document.createElement("div"); attr.style.color = "#00d4ff"; attr.style.marginTop = "4px"; out.appendChild(attr);
    await typeTextInto(`\u2014 ${res.author}`, attr);
    restorePrompt(); return;
  }

  if (res && res.rss) {
    if (blogCache && !blogCache.startsWith("Error")) { await typeHTMLInto(blogCache, out); }
    else {
      await typeTextInto("Fetching posts...", out);
      const data = await fetchRSS(res.rss);
      if (data) { const fp = parseRSS(data); out.innerHTML = ""; await typeHTMLInto(fp, out); }
      else { out.innerHTML = ""; await typeTextInto("Error: Feed unreachable.", out); }
    }
    restorePrompt(); return;
  }

  if (res && res.html) { await typeHTMLInto(res.html, out); restorePrompt(); return; }
  if (res) {
    out.style.whiteSpace = "pre";
    if (isMobile()) out.classList.add("output-scroll");
    await typeTextInto(res, out);
    out.style.whiteSpace = "";
    restorePrompt();
  }
}

/* ── BOOT ── */
async function boot() {
  isBooting = true;
  const desktopInputLine = document.getElementById("desktopInputLine");
  if (desktopInputLine) desktopInputLine.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  startPrefetch();
  const bootSound = new Audio("../data/boot.mp3"); bootSound.volume = 0.5; bootSound.play().catch(() => {});
  const ascii = `\n ██████████             ███                              ███████     █████████ \n░░███░░░░███           ░░░                             ███░░░░░███  ███░░░░░███\n ░███   ░░███  ██████  ████  █████████████    ██████  ███     ░░███░███    ░░░ \n ░███    ░███ ███░░███░░███ ░░███░░███░░███  ███░░███░███      ░███░░█████████ \n ░███    ░███░███████  ░███  ░███ ░███ ░███ ░███ ░███░███      ░███ ░░░░░░░░███\n ░███    ███ ░███░░░   ░███  ░███ ░███ ░███ ░███ ░███░░███     ███  ███    ░███\n ██████████  ░░██████  █████ █████░███ █████░░██████  ░░░███████░  ░░█████████ \n░░░░░░░░░░    ░░░░░░  ░░░░░ ░░░░░ ░░░ ░░░░░  ░░░░░░     ░░░░░░░     ░░░░░░░░░\n`;
  const visits = window._visitCount || 1;
  const visitSuffix = visits === 1 ? "1st" : visits === 2 ? "2nd" : visits === 3 ? "3rd" : `${visits}th`;
  const welcomeMsg = visits === 1
    ? `Welcome, ${username}!`
    : `Welcome back, ${username}! This is your ${visitSuffix} visit.`;

  const lines = ["Booting DeimoOS...", "Loading kernel...", "Mounting filesystem...", "", "ASCII", "", welcomeMsg, "Use the help command to see all of the available commands."];
  
  for (const line of lines) {
    if (line === "ASCII") {
      if (isMobile()) {
        // Skip ASCII art on mobile entirely
      } else {
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
    scrollToBottom(); await new Promise(r => setTimeout(r, 300));
  }
  
  isBooting = false;
  updatePrompt();
  resetScreensaverTimer();
  
  if (isMobile()) setupMobileInput();
  else {
    if (desktopInputLine) desktopInputLine.style.display = "flex";
    renderInput();
  }
}

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

  // Visit counter
  const visitKey = `visits_${username}`;
  const visits = parseInt(localStorage.getItem(visitKey) || "0") + 1;
  localStorage.setItem(visitKey, visits);
  localStorage.setItem("username", username);
  window._visitCount = visits;

  loginScreen.style.display = "none";
  boot();
}

window.addEventListener("load", () => {
  const savedUsername = localStorage.getItem("username");
  if (savedUsername && !isUsernameBanned(savedUsername)) {
    username = savedUsername;
    window._termUsername = username;
    window._sessionStart = Date.now();
    const visitKey = `visits_${username}`;
    const visits = parseInt(localStorage.getItem(visitKey) || "0") + 1;
    localStorage.setItem(visitKey, visits);
    window._visitCount = visits;
    loginScreen.style.display = "none";
    boot();
  } else {
    usernameInput.focus();
  }
});
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(e); });
usernameInput.addEventListener("input", () => {
  const errEl = document.getElementById("loginError");
  if (errEl) errEl.style.display = "none";
});
loginBtn.addEventListener("click", submitLogin);

document.addEventListener("keydown", async (e) => {
  if (isMobile() || loginScreen.style.display !== "none" || isBooting || isAwaitingInput || isGameActive) return;

  // Ctrl+C — cancel running command
  if (e.ctrlKey && e.key === "c") {
    e.preventDefault();
    if (isProcessing) {
      cancelCommand = true;
      const d = document.createElement("div");
      d.style.color = "#ff4437";
      d.textContent = "^C";
      output.appendChild(d);
      scrollToBottom();
    }
    return;
  }

  if (isProcessing) return;

  // Tab autocomplete
  if (e.key === "Tab") {
    e.preventDefault();
    const allCmds = [...Object.keys(commands), "man"];
    const input   = currentInput.toLowerCase();
    const parts   = input.trimStart().split(/\s+/);

    // "man <partial>" — autocomplete the argument against manPages keys
    if (parts[0] === "man" && parts.length >= 2) {
      const partial = parts[1] || "";
      const matches = Object.keys(manPages).filter(k => k.startsWith(partial));
      if (matches.length === 1) {
        currentInput = "man " + matches[0];
        cursorPos = currentInput.length;
        renderInput();
      } else if (matches.length > 1) {
        const d = document.createElement("div");
        d.style.color = "#009966";
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
      d.style.color = "#009966";
      d.textContent = matches.join("   ");
      output.appendChild(d);
      scrollToBottom();
    }
    return;
  }

  if (["ArrowLeft", "ArrowRight", "Backspace", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  switch (e.key) {
    case "Enter":
      const cmd = currentInput.trim().toLowerCase(); currentInput = ""; cursorPos = 0; renderInput(); await processCommand(cmd); break;
    case "Backspace": if (cursorPos > 0) { currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos); cursorPos--; } renderInput(); break;
    case "ArrowUp": if (historyIndex > 0) { historyIndex--; currentInput = history[historyIndex]; cursorPos = currentInput.length; renderInput(); } break;
    case "ArrowDown": if (historyIndex < history.length - 1) { historyIndex++; currentInput = history[historyIndex]; cursorPos = currentInput.length; renderInput(); } else { historyIndex = history.length; currentInput = ""; cursorPos = 0; renderInput(); } break;
    case "ArrowLeft": if (cursorPos > 0) cursorPos--; renderInput(); break;
    case "ArrowRight": if (cursorPos < currentInput.length) cursorPos++; renderInput(); break;
    default: if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) { currentInput = currentInput.slice(0, cursorPos) + e.key + currentInput.slice(cursorPos); cursorPos++; renderInput(); }
  }
});