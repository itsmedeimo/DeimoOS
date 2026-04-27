import { quotes } from "../data/quotes.js";

export const commands = {
  help: () => 
  `Personal Commands:
  aboutme     (Displays information about me)
  contact     (Learn how to contact me)
  projects    (Information and links about my other projects/websites)
  blog        (Latest posts from my blog)
  links       (Links to some of my social account and more)

Fun Commands:
  joke        (Fetch a random programming joke)
  quote       (Fetch a random techy/programming quote)
  snake       (Play snake in the terminal)
  weather     (Fetch local weather via geolocation)
  matrix      (Trigger the Matrix rain)

System Commands:
  help        (Displays the available commands)
  now         (Display current date and time)
  whoami      (Display info about your session)
  version     (Display terminal version info)
  systeminfo  (Display system info)
  sudo        (Gain root access)
  clear       (Clears the screen)
  reboot      (Reboot the terminal)

`,

  aboutme: () => 
`Hi, it's me Deimo, a tech tinkerer, builder, and perpetual learner.

I spend most of my time digging into how things work by actually breaking them (on purpose… usually), then figuring out how to put them back together in better shape.

Outside of general software and hardware work, I’m big into homelabbing and network administration. I run and maintain my own small lab environment where I test services, mess with different setups, and simulate real-world infrastructure just to understand it properly.

I’m always exploring new tools, experimenting with systems, and trying to build things that are both functional and fun to understand.
`,

  projects: () => ({
    html: 
    `- Terminal Website (GitHub repo coming soon)
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
  reboot: () => "__reboot__",
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
`DeimoOS Terminal
----------------
Version  : v0.5.1
Build    : 2025-04-26
Engine   : Vanilla JS
Renderer : HTML5 / CSS3
Author   : Deimo &lt;<a href="mailto:deimo@deimo.me" class="terminal-link">deimo@deimo.me</a>&gt;`
  }),

  weather: () => "__weather__",
  rm: () => "__crash__",
  quote: () => {
    const pick = quotes[Math.floor(Math.random() * quotes.length)];
    return { quote: pick.text, author: pick.author };
  },
};