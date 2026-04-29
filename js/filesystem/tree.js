const _d = new Date();
const _mo = _d.toLocaleDateString("en-US", { month: "short" });
const _dy = String(_d.getDate()).padStart(2, " ");

function _ts(h, m, s) {
  return `${_mo} ${_dy} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")} deimo.me`;
}

const SYSLOG = [
  `${_ts(0,0,1)} kernel: Booting DeimoOS v0.6.0`,
  `${_ts(0,0,1)} kernel: Command line: BOOT_IMAGE=/boot/deimosh root=UUID=d31m0-root-42`,
  `${_ts(0,0,2)} systemd[1]: Started DeimoOS boot sequence.`,
  `${_ts(0,0,2)} systemd[1]: Mounting /proc...`,
  `${_ts(0,0,2)} systemd[1]: Mounting /etc...`,
  `${_ts(0,0,3)} systemd[1]: Starting session tracker (session.service)...`,
  `${_ts(0,0,3)} systemd[1]: Started session tracker (session.service).`,
  `${_ts(0,0,3)} systemd[1]: Starting terminal input handler (deimosh.service)...`,
  `${_ts(0,0,4)} deimosh[42]: Shell initialized. PID 42.`,
  `${_ts(0,0,4)} systemd[1]: Started terminal input handler (deimosh.service).`,
  `${_ts(0,0,5)} systemd[1]: Starting Snake game engine (snek.service)...`,
  `${_ts(0,0,5)} snek[99]: Engine ready. High score loaded.`,
  `${_ts(0,0,5)} systemd[1]: Reached target Multi-User System.`,
  `${_ts(0,0,6)} deimosh[42]: Login: user authenticated.`,
].join("\n");

const RANDOM_HEX = (() => {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.random().toString(16).slice(2, 10);
  return s;
})();

export const TREE = {
  "/":                           { type: "dir" },
  "/home":                       { type: "dir" },
  "/home/deimo":                 { type: "dir" },
  "/home/deimo/aboutme.txt":     { type: "file", content:
`Hi, it's me Deimo, a tech tinkerer, builder, and perpetual learner.

I spend most of my time digging into how things work by actually breaking them
(on purpose... usually), then figuring out how to put them back together in better shape.

Outside of general software and hardware work, I'm big into homelabbing and
network administration. I run and maintain my own small lab environment where
I test services, mess with different setups, and simulate real-world infrastructure
just to understand it properly.

I'm always exploring new tools, experimenting with systems, and trying to build
things that are both functional and fun to understand.`
  },
  "/home/deimo/projects.txt":    { type: "file", content:
`DeimoOS    https://github.com/itsmedeimo/DeimoOS
Deimo.me   https://deimo.me`
  },
  "/home/deimo/links.txt":       { type: "file", content:
`Website    https://deimo.me
Instagram  https://instagram.com/itsmedeimo
X          https://x.com/itsmedeimo
YouTube    https://youtube.com/@theycallmeductape
Twitch     https://twitch.tv/itsmedeimo
Kick       https://kick.com/theycallmeductape
Discord    https://deimo.me/discord`
  },
  "/home/deimo/contact.txt":     { type: "file", content:
`Email    deimo@deimo.me
Discord  https://deimo.me/discord`
  },
  "/home/deimo/.bashrc":         { type: "file", content:
`# ~/.bashrc -- deimosh configuration
alias ll='ls -la'
alias cls='clear'
export PATH="/bin:/usr/bin"
export SHELL=deimosh
export TERM=deimo-256color`
  },
  "/home/deimo/.profile":        { type: "file", content:
`# ~/.profile
[ -f ~/.bashrc ] && . ~/.bashrc`
  },
  "/home/deimo/passwords":                  { type: "dir" },
  "/home/deimo/passwords/passwords.txt":    { type: "file", content: "" },
  "/home/deimo/photos":                     { type: "dir" },
  "/home/deimo/photos/chucknorris.jpg":   { type: "image", src: "js/filesystem/chucknorris.jpg" },
  "/home/deimo/photos/me.jpg":            { type: "image", src: "js/filesystem/me.jpg" },
  "/etc":                        { type: "dir" },
  "/etc/os-release":             { type: "file", content:
`NAME=DeimoOS
VERSION=v0.6.0
BUILD=2025-04-26
ENGINE=Vanilla JS
RENDERER=HTML5 / CSS3
AUTHOR=Deimo (deimo@deimo.me)`
  },
  "/etc/hostname":               { type: "file", content: `deimo.me` },
  "/etc/motd":                   { type: "file", content:
`Welcome to DeimoOS v0.6.0
Type 'help' to see available commands.

Last login: ${_d.toUTCString()}`
  },
  "/etc/passwd":                 { type: "file", content:
`root:x:0:0:root:/root:/bin/bash
deimo:x:1000:1000:Deimo,,,:/home/deimo:/bin/deimosh
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin`
  },
  "/var":                        { type: "dir" },
  "/var/log":                    { type: "dir" },
  "/var/log/syslog":             { type: "file", content: SYSLOG },
  "/proc":                       { type: "dir" },
  "/proc/cpuinfo":               { type: "file", content:
`processor   : 0
vendor_id   : DeimoTech
model name  : deimosh @ 1337 MHz
cache size  : 512 KB
bogomips    : 9999.99
flags       : immersive realtime fun easter_egg`
  },
  "/proc/version":               { type: "file", content:
`DeimoOS version 0.6.0 (deimosh@deimo.me) (vanilla-gcc 13.0) #42 SMP ${_d.toUTCString()}`
  },
  "/root":                       { type: "dir", restricted: true },
  "/tmp":                        { type: "dir" },
  "/bin":                        { type: "dir" },
  "/dev":                        { type: "dir" },
  "/dev/null":                   { type: "file", content: `` },
  "/dev/random":                 { type: "file", content: RANDOM_HEX },
};
