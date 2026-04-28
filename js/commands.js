import { quotes }   from "../data/quotes.js";
import { helpText } from "../data/help.js";

// Formats a man page entry — called by script.js with the command name and description
export function manFormat(cmd, description) {
  return ` DeimoOS Manual\n\nCOMMAND\n    ${cmd}\n\nDESCRIPTION\n    ${description}`;
}

export function manUsage() {
  return "Usage: man <command>\nExample: man snake";
}

export function manNotFound(cmd) {
  return `No manual entry for '${cmd}'.`;
}

// Formats the leaderboard header and rows — called by script.js with the board array
export function leaderboardFormat(board) {
  const medals = ["1st", "2nd", "3rd", "4th", "5th"];
  let text = "SNAKE LEADERBOARD\n";
  board.forEach((e, i) => {
    text += `  ${medals[i]}  ${e.username.padEnd(16)}${e.score} pts\n`;
  });
  return text;
}

export const commands = {
  help: () => helpText,

  aboutme: () => 
`Hi, it's me Deimo, a tech tinkerer, builder, and perpetual learner.

I spend most of my time digging into how things work by actually breaking them (on purpose… usually), then figuring out how to put them back together in better shape.

Outside of general software and hardware work, I'm big into homelabbing and network administration. I run and maintain my own small lab environment where I test services, mess with different setups, and simulate real-world infrastructure just to understand it properly.

I'm always exploring new tools, experimenting with systems, and trying to build things that are both functional and fun to understand.
`,

  projects: () => ({
    html: 
    `- <a href="https://github.com/itsmedeimo/DeimoOS" target="_blank" class="terminal-link">DeimoOS</a>  Terminal Style Website (This project)
- <a href="https://deimo.me" target="_blank" class="terminal-link">Deimo.me</a> My Blog`
  }),

  contact: () => ({
    html: `You can send me an email at <a href="mailto:deimo@deimo.me" class="terminal-link">deimo@deimo.me</a>.
or you can join my <a href="https://deimo.me/discord" target="_blank" class="terminal-link">Discord Server</a> and we can chat there.`
  }),

  blog: () => ({ rss: "https://deimo.me/feed/" }),

  links: () => ({
    html: 
    `- <a href="https://deimo.me" target="_blank" class="terminal-link">Website / Blog</a>
- <a href="https://www.instagram.com/itsmedeimo" target="_blank" class="terminal-link">Instagram</a>
- <a href="https://x.com/itsmedeimo" target="_blank" class="terminal-link">X aka Twitter</a>
- <a href="https://www.youtube.com/@theycallmeductape" target="_blank" class="terminal-link">Youtube</a>
- <a href="https://www.twitch.tv/itsmedeimo" target="_blank" class="terminal-link">Twitch</a>
- <a href="https://kick.com/theycallmeductape" target="_blank" class="terminal-link">Kick</a>
- <a href="https://deimo.me/discord" target="_blank" class="terminal-link">Discord Server</a>
`
  }),

  hack: () => "__hack__",
  matrix: () => "__matrix__",
  changelog: () => "__changelog__",
  "snake-leaderboard": () => "__snake-leaderboard__",
  reboot: () => "__reboot__",
  logout: () => "__logout__",
  exit:   () => "__logout__",
  snake: () => "__snake__",
  clear: () => "__clear__",
  joke: () => "__joke__",
  sudo: () => "__sudo__",
  systeminfo: () => "__neofetch__",
  now: () => {
    const now = new Date();
    return `Date : ${now.toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}\nTime : ${now.toLocaleTimeString("en-GB")}\nZone : ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  },
  whoami: () => "__whoami__",
  version: () => ({
    html:
`DeimoOS

Version      : v0.6.0
Build        : 2025-04-26
Engine       : Vanilla JS
Renderer     : HTML5 / CSS3
Author       : Deimo &lt;<a href="mailto:deimo@deimo.me" class="terminal-link">deimo@deimo.me</a>&gt;
Source Code  : <a href="https://github.com/itsmedeimo/DeimoOS" target="_blank" class="terminal-link">GitHub</a>`
  }),

  weather: () => "__weather__",
  rm: () => "__crash__",
  quote: () => {
    const pick = quotes[Math.floor(Math.random() * quotes.length)];
    return { quote: pick.text, author: pick.author };
  },
};