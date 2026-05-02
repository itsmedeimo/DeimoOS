// commands.js — defines every user-facing command and its return value.
//
// Each entry in the `commands` object is a zero-argument function called by
// processCommand() in script.js after a command name is matched.
//
// ── Return type conventions ──────────────────────────────────────────────────
//   string              Plain text, rendered with typewriter animation.
//                       Use \n for line breaks; wrap in `pre` style for monospace.
//
//   { html: string }    Raw HTML string rendered directly into the output div.
//                       Use for clickable links, coloured spans, etc.
//
//   { rss: url }        Tells script.js to fetch the URL as an RSS/Atom feed and
//                       render the post list as clickable links.
//
//   { quote, author }   Displays in two parts: quoted text, then attribution
//                       on a separate line in accent colour.
//
//   "__sentinel__"      A special string that triggers a hardcoded behaviour in
//                       script.js's COMMAND_REGISTRY (e.g. "__snake__" launches
//                       the Snake game, "__reboot__" starts the shutdown sequence).
//
// ── Adding a new command ─────────────────────────────────────────────────────
//   Simple output:  add an entry here returning a string, { html }, { rss }, or
//                   { quote, author } — no other file needs to change.
//
//   Special behaviour (animation, game, network call, etc.):
//     1. Add an entry here returning a new sentinel, e.g. "__foo__"
//     2. In script.js, add an async handler function handleFoo(out) { ... }
//     3. In script.js's COMMAND_REGISTRY, add   "__foo__": handleFoo
//        processCommand() itself never needs to change.
// ─────────────────────────────────────────────────────────────────────────────

import { quotes }   from "../data/quotes.js";
import { helpText } from "../data/help.js";

/* ── FORMATTER HELPERS ─────────────────────────────────────────────────────── */
// These are exported and called from script.js rather than being return values
// of commands, because they need arguments (command name, page content, etc.)
// that aren't available at command-call time.

// Formats a man page entry into the standard terminal manual style.
// Called by processCommand() with the command name and its description string.
export function manFormat(cmd, description) {
  return ` DeimoOS Manual\n\nCOMMAND\n    ${cmd}\n\nDESCRIPTION\n    ${description}`;
}

// Usage hint shown when `man` is called with no argument.
export function manUsage() {
  return "Usage: man <command>\nExample: man snake";
}

// Error shown when `man <cmd>` has no matching page.
export function manNotFound(cmd) {
  return `No manual entry for '${cmd}'.`;
}

// Formats the leaderboard into a ranked table string.
// Called by showLeaderboard() in script.js with the loaded board array.
export function leaderboardFormat(board) {
  const medals = ["1st", "2nd", "3rd", "4th", "5th"];
  let text = "SNAKE LEADERBOARD\n";
  board.forEach((e, i) => {
    text += `  ${medals[i]}  ${e.username.padEnd(16)}${e.score} pts\n`;
  });
  return text;
}

/* ── COMMAND DEFINITIONS ───────────────────────────────────────────────────── */
export const commands = {

  // ── PLAIN STRING COMMANDS ──
  // These return preformatted text that processCommand() types out with a
  // typewriter animation. \n produces a new line; no HTML allowed here.

  // Lists all available commands with brief descriptions (content lives in data/help.js)
  help: () => helpText,

  // Personal bio paragraph
  aboutme: () =>
`Hi, it's me Deimo, a tech tinkerer, builder, and perpetual learner.

I spend most of my time digging into how things work by actually breaking them (on purpose… usually), then figuring out how to put them back together in better shape.

Outside of general software and hardware work, I'm big into homelabbing and network administration. I run and maintain my own small lab environment where I test services, mess with different setups, and simulate real-world infrastructure just to understand it properly.

I'm always exploring new tools, experimenting with systems, and trying to build things that are both functional and fun to understand.
`,

  // Current date, time, and timezone — evaluated at call time, not at import time
  now: () => {
    const now = new Date();
    return (
      `Date : ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\n` +
      `Time : ${now.toLocaleTimeString("en-GB")}\n` +
      `Zone : ${Intl.DateTimeFormat().resolvedOptions().timeZone}`
    );
  },

  // ── HTML COMMANDS ──
  // Return { html: string } so processCommand() renders clickable links, etc.

  // Portfolio and side-project links
  projects: () => ({
    html:
      `- <a href="https://github.com/itsmedeimo/DeimoOS" target="_blank" class="terminal-link">DeimoOS</a>  Terminal Style Website (This project)\n` +
      `- <a href="https://deimo.me" target="_blank" class="terminal-link">Deimo.me</a> My Blog`,
  }),

  // Contact info with a mailto link and Discord invite
  contact: () => ({
    html:
      `You can send me an email at <a href="mailto:deimo@deimo.me" class="terminal-link">deimo@deimo.me</a>.\n` +
      `or you can join my <a href="https://deimo.me/discord" target="_blank" class="terminal-link">Discord Server</a> and we can chat there.`,
  }),

  // All social / streaming platform links
  links: () => ({
    html:
      `- <a href="https://deimo.me" target="_blank" class="terminal-link">Website / Blog</a>\n` +
      `- <a href="https://www.instagram.com/itsmedeimo" target="_blank" class="terminal-link">Instagram</a>\n` +
      `- <a href="https://x.com/itsmedeimo" target="_blank" class="terminal-link">X aka Twitter</a>\n` +
      `- <a href="https://www.youtube.com/@theycallmeductape" target="_blank" class="terminal-link">Youtube</a>\n` +
      `- <a href="https://www.twitch.tv/itsmedeimo" target="_blank" class="terminal-link">Twitch</a>\n` +
      `- <a href="https://kick.com/theycallmeductape" target="_blank" class="terminal-link">Kick</a>\n` +
      `- <a href="https://deimo.me/discord" target="_blank" class="terminal-link">Discord Server</a>\n`,
  }),

  // Version info with source code link
  version: () => ({
    html:
`DeimoOS

Version      : v0.6.2
Build        : 2025-04-26
Engine       : Vanilla JS
Renderer     : HTML5 / CSS3
Author       : Deimo &lt;<a href="mailto:deimo@deimo.me" class="terminal-link">deimo@deimo.me</a>&gt;
Source Code  : <a href="https://github.com/itsmedeimo/DeimoOS" target="_blank" class="terminal-link">GitHub</a>`,
  }),

  // ── RSS COMMAND ──
  // Returns { rss: url }; script.js fetches and parses the feed via CORS proxies.
  // A background prefetch (startPrefetch) runs at boot so this is usually instant.
  // Supports Ctrl+C cancellation via an AbortController in the handleRSS handler.
  blog: () => ({ rss: "https://deimo.me/feed/" }),

  // ── QUOTE COMMAND ──
  // Returns { quote, author } displayed in two parts with a typewriter animation.
  // Picks a random entry from data/quotes.js on each call.
  quote: () => {
    const pick = quotes[Math.floor(Math.random() * quotes.length)];
    return { quote: pick.text, author: pick.author };
  },

  // ── SENTINEL COMMANDS ──
  // Return special strings that COMMAND_REGISTRY in script.js maps to handlers.
  // The handler function does the actual work (animation, game, network call, etc.).
  // To add a new sentinel: add the entry here, write the handler, register it.

  hack:              () => "__hack__",              // scrolling hex log + fake progress bar
  matrix:            () => "__matrix__",            // fullscreen matrix rain (8 seconds)
  changelog:         () => "__changelog__",         // fetches and displays data/changelog.txt
  "snake-leaderboard": () => "__snake-leaderboard__", // shows the top-5 snake high scores
  reboot:            () => "__reboot__",            // animated systemd-style shutdown + login reset
  logout:            () => "__logout__",            // clears username cookie, returns to login
  exit:              () => "__logout__",            // alias for logout
  snake:             () => "__snake__",             // launches the in-terminal snake game
  clear:             () => "__clear__",             // wipes terminal with a glowing sweep animation
  joke:              () => "__joke__",              // fetches a programming joke from an external API
  sudo:              () => "__sudo__",              // fake sudo prompt (always denied after 3 attempts)
  systeminfo:        () => "__neofetch__",          // neofetch-style system info with ASCII logo
  whoami:            () => "__whoami__",            // session info: user, host, uptime, browser
  weather:           () => "__weather__",           // geolocation + Open-Meteo weather lookup
};
