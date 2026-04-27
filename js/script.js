import { commands } from "./commands.js";

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
let isBooting       = false;
let isAwaitingInput = false;
let isGameActive    = false; 
let blogCache       = null;

/* ── MOBILE DETECTION ── */
const isMobile = () =>
  window.matchMedia("(max-width: 600px)").matches || 
  window.matchMedia("(hover: none) and (pointer: coarse)").matches;

/* ── ANALYTICS ── */
function trackCommand(cmd) {
  if (typeof umami === "undefined") return;
  umami.track("command", { command: cmd || "(empty)" });
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

function typeTextInto(text, el, speed = 6) {
  return new Promise((resolve) => {
    let i = 0;
    function type() {
      if (i < text.length) {
        el.innerHTML += text[i++];
        scrollToBottom();
        setTimeout(type, speed);
      } else resolve();
    }
    type();
  });
}

function typeHTMLInto(html, el, speed = 6) {
  return new Promise((resolve) => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const plainText = tmp.textContent;
    el.style.whiteSpace = "pre-wrap";
    let i = 0;
    function type() {
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

/* ── PROCESS COMMAND ── */
async function processCommand(cmd) {
  if (isBooting) return;
  trackCommand(cmd);
  if (!cmd) {
    const out = createBlock("");
    await typeTextInto("Use the help command to see all of the available commands.", out);
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
  
  if (!commands[baseCmd]) {
    await typeTextInto("Command not found. Use the help command to see all of the available commands.", out);
    return;
  }

  const res = commands[baseCmd]();
  const desktopInputLine = document.getElementById("desktopInputLine");

  if (res === "__clear__") {
    const wipe = document.createElement("div");
    wipe.classList.add("clear-wipe");
    document.body.appendChild(wipe);
    wipe.addEventListener("animationend", () => wipe.remove());
    await new Promise(r => setTimeout(r, 150));
    output.innerHTML = "";
    return;
  }

  /* ── CRASH COMMAND (rm -rf /) ── */
  if (res === "__crash__") {
    if (fullArgs !== "-rf /") {
      await typeTextInto("rm: missing operand", out);
      return;
    }

    isBooting = true; // Lock terminal
    if (desktopInputLine) desktopInputLine.style.display = "none";
    if (mobileBar) mobileBar.classList.remove("visible");

    await typeTextInto("WARNING: You are about to delete the root directory.", out);
    await new Promise(r => setTimeout(r, 800));
    await typeTextInto("\nExecuting...", out);
    await new Promise(r => setTimeout(r, 500));

    // Panic Logs
    const errors = [
      "Deleting /bin...", "Deleting /etc...", "Deleting /home...", 
      "CRITICAL: Kernel integrity lost", "FATAL: /sbin/init not found",
      "PANIC: Attempted to kill init!", "Memory dump at 0x004F3A2...",
      "SYSTEM_FAILURE_000x042", "Connection reset by peer"
    ];

    for (let i = 0; i < 30; i++) {
        const div = document.createElement("div");
        div.style.color = i % 5 === 0 ? "#ff4437" : "#00ff9f";
        div.textContent = `[${(Math.random() * 100).toFixed(4)}] ${errors[i % errors.length]}`;
        output.appendChild(div);
        scrollToBottom();
        await new Promise(r => setTimeout(r, 30));
        if (i === 15) terminal.style.filter = "invert(1) contrast(2)";
    }

    // Shake effect
    terminal.style.animation = "flicker 0.1s infinite alternate";
    await new Promise(r => setTimeout(r, 1000));
    
    // Total Blackout
    terminal.style.filter = "";
    terminal.style.animation = "";
    output.innerHTML = "";
    document.body.style.background = "white";
    await new Promise(r => setTimeout(r, 100));
    document.body.style.background = "black";
    
    // Forced Reboot to Login
    usernameInput.value = "";
    loginScreen.style.display = "flex";
    usernameInput.focus();
    isBooting = false;
    return;
  }

  if (res === "__hack__") {
    await typeTextInto("Initializing Matrix Bypass...", out);
    const hackLines = ["Security Alert: Breach detected", "SQL Injection: Success", "RSA Layer: Decrypted", "Overriding Mainframe..."];
    for (let i = 0; i < 20; i++) {
        const div = document.createElement("div");
        div.style.color = "#00ff9f";
        div.textContent = `[${Math.random().toString(16).substring(2, 8).toUpperCase()}] ${hackLines[i % 4]}`;
        output.appendChild(div);
        scrollToBottom();
        await new Promise(r => setTimeout(r, 40));
    }
    const prog = document.createElement("div");
    output.appendChild(prog);
    for (let i = 0; i <= 100; i += 10) {
        prog.textContent = `DECRYPTING: [${"#".repeat(i/10)}${".".repeat(10-i/10)}] ${i}%`;
        scrollToBottom();
        await new Promise(r => setTimeout(r, 80));
    }
    const granted = document.createElement("div");
    granted.innerHTML = `<br><span style="color:#ff4437; font-size: 22px; font-weight: bold;">[ ACCESS DENIED. FIREWALL ACTIVATED ]</span><br>`;
    output.appendChild(granted);
    scrollToBottom();
    return;
  }

  if (res === "__matrix__") {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9997; pointer-events: none; opacity: 1; transition: opacity 1s ease;`;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const fontSize = 16;
    const cols = Math.floor(canvas.width / fontSize);
    const drops = Array(cols).fill(1);
    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
    const interval = setInterval(() => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00ff9f";
      ctx.font = `${fontSize}px 'Share Tech Mono', monospace`;
      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }, 40);
    await new Promise(r => setTimeout(r, 8000));
    clearInterval(interval);
    canvas.style.opacity = "0";
    await new Promise(r => setTimeout(r, 1000));
    canvas.remove();
    return;
  }

  if (res === "__sudo__") {
    if (desktopInputLine) desktopInputLine.style.display = "none";
    if (mobileBar) mobileBar.classList.remove("visible");

    const askPassword = () => new Promise((resolve) => {
      isAwaitingInput = true;
      const line = document.createElement("div");
      line.textContent = "[sudo] password for root: ";
      out.appendChild(line);
      scrollToBottom();
      const input = document.createElement("input");
      input.type = "password";
      input.style.cssText = `background: transparent; border: none; outline: none; color: transparent; caret-color: #00ff9f; font-family: inherit; font-size: inherit; width: 1px;`;
      line.appendChild(input);
      const asterisks = document.createElement("span");
      line.appendChild(asterisks);
      input.addEventListener("input", () => { asterisks.textContent = "*".repeat(input.value.length); });
      setTimeout(() => input.focus(), 50);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault(); e.stopPropagation();
          input.remove(); asterisks.remove();
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

    if (desktopInputLine && !isMobile()) desktopInputLine.style.display = "flex";
    if (isMobile()) mobileBar.classList.add("visible");
    return;
  }

  if (res === "__whoami__") {
    const sessionStart = window._sessionStart ? new Date(window._sessionStart).toLocaleTimeString("en-GB") : "unknown";
    await typeTextInto(`User     : ${username}\nHost     : ${host}\nShell    : deimosh\nSession  : started at ${sessionStart}\nBrowser  : ${navigator.userAgent.split(")")[0].split("(")[1] || "unknown"}`, out);
    return;
  }

  if (res === "__neofetch__") {
    const ascii = ["", "$$$$$$$\\  $$$$$$$$\\ $$$$$$\\ $$\\      $$\\  $$$$$$\\ ", "$$  __$$\\ $$  _____|\\_$$  _|$$$\\    $$$ |$$  __$$\\", "$$ |  $$ |$$ |        $$ |  $$$$\\  $$$$ |$$ /  $$ |", "$$ |  $$ |$$$$$\\      $$ |  $$\\$$\\$$ $$ |$$ |  $$ |", "$$ |  $$ |$$  __|     $$ |  $$ \\$$$  $$ |$$ |  $$ |", "$$ |  $$ |$$ |        $$ |  $$ |\\$  /$$ |$$ |  $$ |", "$$$$$$$  |$$$$$$$$\\ $$$$$$\\ $$ | \\_/ $$ | $$$$$$  |", "\\_______/ \\________|\\______|\\__|     \\__| \\______/ "];
    const info = [`${username}@${host}`, "─".repeat(24), `OS       : DeimoOS 0.5.1`, `Shell    : deimo.sh`, `Engine   : Vanilla JS`, `Host     : ${host}`, `Uptime   : ${Math.floor((Date.now() - (window._sessionStart || Date.now())) / 1000)}s`, `Theme    : Matrix Green`, `Font     : Share Tech Mono` ];
    const el = document.createElement("div");
    el.style.whiteSpace = "pre";
    out.appendChild(el);
    const totalRows = Math.max(ascii.length, info.length);
    for (let i = 0; i < totalRows; i++) {
      el.innerHTML += `<span style="color:#ffffff">${(ascii[i] || "").padEnd(52)}</span>  <span style="color:#00d4ff">${info[i] || ""}</span>\n`;
      scrollToBottom();
      await new Promise(r => setTimeout(r, 60));
    }
    return;
  }

  if (res === "__snake__") {
    isGameActive = true; 
    if (desktopInputLine) desktopInputLine.style.display = "none";
    if (inputDisplay) inputDisplay.innerHTML = ""; 
    if (mobileBar) mobileBar.classList.remove("visible");

    const size = 20; const cols = 25; const rows = 20;
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "display:inline-block; border: 1px solid #00ff9f; margin-top: 6px;";
    const canvas = document.createElement("canvas");
    canvas.width = cols * size; canvas.height = rows * size;
    wrapper.appendChild(canvas);
    out.appendChild(wrapper);
    const ctx = canvas.getContext("2d");
    let snake = [{x: 12, y: 10}, {x: 11, y: 10}, {x: 10, y: 10}];
    let dir = {x: 1, y: 0}; let nextDir = {x: 1, y: 0};
    let food = {x: 5, y: 5}; let score = 0; let running = true;
    const scoreEl = document.createElement("div");
    scoreEl.style.marginTop = "4px";
    scoreEl.textContent = "Score: 0  |  WASD or Arrow Keys to move  |  Q to quit";
    out.appendChild(scoreEl);
    scrollToBottom();
    const placeFood = () => { food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) }; };
    const draw = () => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00ff9f"; for (const s of snake) ctx.fillRect(s.x * size, s.y * size, size - 2, size - 2);
      ctx.fillStyle = "#ff4437"; ctx.fillRect(food.x * size, food.y * size, size - 2, size - 2);
    };
    const keyHandler = (e) => {
      const map = { ArrowUp: {x:0,y:-1}, w: {x:0,y:-1}, ArrowDown: {x:0,y:1}, s: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, a: {x:-1,y:0}, ArrowRight: {x:1,y:0}, d: {x:1,y:0} };
      if (e.key === "Enter") { e.preventDefault(); return; }
      if (e.key === "q" || e.key === "Q") { running = false; return; }
      const newDir = map[e.key];
      if (newDir && !(newDir.x === -dir.x && newDir.y === -dir.y)) nextDir = newDir;
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) e.preventDefault();
    };
    document.addEventListener("keydown", keyHandler);
    const loop = setInterval(() => {
      if (!running) {
        clearInterval(loop);
        document.removeEventListener("keydown", keyHandler);
        scoreEl.textContent = `Game Over! Final score: ${score}`;
        isGameActive = false; 
        if (desktopInputLine && !isMobile()) {
            desktopInputLine.style.display = "flex";
            renderInput(); 
        }
        if (isMobile()) mobileBar.classList.add("visible");
        scrollToBottom();
        return;
      }
      dir = nextDir;
      const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
      if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows || snake.some(s => s.x === head.x && s.y === head.y)) { running = false; return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score++; scoreEl.textContent = `Score: ${score}  |  WASD or Arrow Keys to move  |  Q to quit`; placeFood(); }
      else { snake.pop(); }
      draw();
    }, 120);
    draw();
    return;
  }

  if (res === "__reboot__") {
    isBooting = true;
    if (desktopInputLine) desktopInputLine.style.display = "none";
    if (mobileBar) mobileBar.classList.remove("visible");
    currentInput = "";
    cursorPos = 0;
    
    await typeTextInto("Rebooting system...", out);
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
    return;
  }

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
      const codes = { 0:"Clear sky", 1:"Mainly clear", 2:"Partly cloudy", 3:"Overcast", 45:"Foggy", 48:"Icy fog", 51:"Light drizzle", 53:"Drizzle", 55:"Heavy drizzle", 61:"Light rain", 63:"Rain", 65:"Heavy rain", 71:"Light snow", 73:"Snow", 75:"Heavy snow", 80:"Rain showers", 81:"Showers", 82:"Heavy showers", 95:"Thunderstorm", 96:"Thunderstorm w/ hail", 99:"Heavy thunderstorm" };
      out.innerHTML = "";
      await typeTextInto(`Location    : ${city}, ${revData.address.country || ""}\nCondition   : ${codes[c.weathercode] || "Unknown"}\nTemperature : ${c.temperature_2m}°C\nHumidity    : ${c.relativehumidity_2m}%\nWind Speed  : ${c.windspeed_10m} km/h`, out);
    } catch (err) {
      out.innerHTML = "";
      await typeTextInto(err.code === 1 ? "Error: Location access denied." : "Error: Could not fetch weather data.", out);
    }
    return;
  }

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
    return;
  }

  if (res && res.quote) {
    await typeTextInto(`"${res.quote}"`, out);
    const attr = document.createElement("div"); attr.style.color = "#00d4ff"; attr.style.marginTop = "4px"; out.appendChild(attr);
    await typeTextInto(`— ${res.author}`, attr);
    return;
  }

  if (res && res.rss) {
    if (blogCache && !blogCache.startsWith("Error")) { await typeHTMLInto(blogCache, out); }
    else {
        await typeTextInto("Fetching posts...", out);
        const data = await fetchRSS(res.rss); 
        if (data) { const formattedPosts = parseRSS(data); out.innerHTML = ""; await typeHTMLInto(formattedPosts, out); }
        else { out.innerHTML = ""; await typeTextInto("Error: Feed unreachable.", out); }
    }
    return;
  }

  if (res && res.html) { await typeHTMLInto(res.html, out); return; }
  if (res) { await typeTextInto(res, out); }
}

/* ── BOOT ── */
async function boot() {
  isBooting = true;
  const desktopInputLine = document.getElementById("desktopInputLine");
  if (desktopInputLine) desktopInputLine.style.display = "none";
  if (mobileBar) mobileBar.classList.remove("visible");

  startPrefetch();
  const bootSound = new Audio("../data/boot.mp3"); bootSound.volume = 0.5; bootSound.play().catch(() => {});
  const ascii = `\n$$$$$$$\\  $$$$$$$$\\ $$$$$$\\ $$\\      $$\\  $$$$$$\\ \n$$  __$$\\ $$  _____|\\_$$  _|$$$\\    $$$ |$$  __$$\\\n$$ |  $$ |$$ |        $$ |  $$$$\\  $$$$ |$$ /  $$ |\n$$ |  $$ |$$$$$\\      $$ |  $$\\$$\\$$ $$ |$$ |  $$ |\n$$ |  $$ |$$  __|     $$ |  $$ \\$$$  $$ |$$ |  $$ |\n$$ |  $$ |$$ |        $$ |  $$ |\\$  /$$ |$$ |  $$ |\n$$$$$$$  |$$$$$$$$\\ $$$$$$\\ $$ | \\_/ $$ | $$$$$$  |\n\\_______/ \\________|\\______|\\__|     \\__| \\______/ \n`;
  const lines = ["Booting DeimoOS...", "Loading kernel...", "Mounting filesystem...", "", "ASCII", "", "Welcome " + username, "You can use the help command to see all of the available commands."];
  
  for (const line of lines) {
    if (line === "ASCII") { const pre = document.createElement("pre"); pre.innerText = ascii; output.appendChild(pre); output.appendChild(document.createElement("div")).innerHTML = "&nbsp;"; }
    else { const el = document.createElement("div"); el.textContent = line; output.appendChild(el); }
    scrollToBottom(); await new Promise(r => setTimeout(r, 300));
  }
  
  isBooting = false;
  updatePrompt();
  
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
  username = usernameInput.value.trim() || "user";
  window._termUsername = username;
  window._sessionStart = Date.now();
  loginScreen.style.display = "none";
  boot();
}

window.addEventListener("load", () => usernameInput.focus());
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitLogin(e); });
loginBtn.addEventListener("click", submitLogin);

document.addEventListener("keydown", async (e) => {
  if (isMobile() || loginScreen.style.display !== "none" || isBooting || isAwaitingInput || isGameActive) return;
  
  if (["ArrowLeft", "ArrowRight", "Backspace", "ArrowUp", "ArrowDown"].includes(e.key)) e.preventDefault();
  switch (e.key) {
    case "Enter":
      const cmd = currentInput.trim().toLowerCase(); currentInput = ""; cursorPos = 0; renderInput(); await processCommand(cmd); break;
    case "Backspace": if (cursorPos > 0) { currentInput = currentInput.slice(0, cursorPos - 1) + currentInput.slice(cursorPos); cursorPos--; } renderInput(); break;
    case "ArrowUp": if (historyIndex > 0) { historyIndex--; currentInput = history[historyIndex]; cursorPos = currentInput.length; renderInput(); } break;
    case "ArrowDown": if (historyIndex < history.length - 1) { historyIndex++; currentInput = history[historyIndex]; cursorPos = currentInput.length; renderInput(); } else { historyIndex = history.length; currentInput = ""; cursorPos = 0; renderInput(); } break;
    case "ArrowLeft": if (cursorPos > 0) cursorPos--; renderInput(); break;
    case "ArrowRight": if (cursorPos < currentInput.length) cursorPos++; renderInput(); break;
    default: if (e.key.length === 1) { currentInput = currentInput.slice(0, cursorPos) + e.key + currentInput.slice(cursorPos); cursorPos++; renderInput(); }
  }
});