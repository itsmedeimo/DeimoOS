// ── DeimoOS Manual Pages ───────────────────────────────────────────────────
// Add or edit entries here. The key is the exact command name (lowercase).
// Each value is the description shown under DESCRIPTION in the man output.
//
// To add a new entry:
//   newcommand: "Description of what newcommand does.",
//
// To remove an entry, delete or comment out the line.
// ──────────────────────────────────────────────────────────────────────────

export const manPages = {

  // ── Personal ──────────────────────────────────────────────────────────
  aboutme:
    "Show information about Deimo — who he is, what he builds, and what he's into.",

  contact:
    "Show contact details including email and a link to the Discord server.",

  projects:
    "List Deimo's current projects with clickable links.",

  blog:
    "Fetch and display the latest posts from deimo.me.",

  links:
    "List links to all social accounts and platforms.",

  // ── Fun ───────────────────────────────────────────────────────────────
  joke:
    "Fetch a random programming joke from the joke API.",

  quote:
    "Display a random programming or tech quote.",

  matrix:
    "Trigger a Matrix rain animation overlay. Runs for 8 seconds or until Ctrl+C.",

  snake:
    "Play Snake in the terminal. WASD or arrow keys to move. Q to quit. Score is saved to the leaderboard on game over.",

  "snake-leaderboard":
    "Display the top 5 Snake scores across all sessions. Scores are stored in localStorage.",

  weather:
    "Fetch current weather for your location. Requires geolocation permission.",

  // ── System ────────────────────────────────────────────────────────────
  help:
    "Display all available commands grouped by category.",

  man:
    "Show the manual page for a command. Usage: man <command>",

  clear:
    "Clear all terminal output with a wipe animation.",

  changelog:
    "Display the full system changelog loaded from data/changelog.txt. Shows all versions, dates, and changes.",

  now:
    "Display the current date, time, and timezone.",

  whoami:
    "Show your session info: username, host, shell, session start time, and browser.",

  version:
    "Display DeimoOS terminal version, build date, engine, and author info.",

  systeminfo:
    "Display a neofetch-style system overview with ASCII logo and session details.",

  sudo:
    "Attempt to gain root access.",

  reboot:
    "Run a full systemd-style shutdown sequence and return to the login screen.",

  logout:
    "Run a logoff sequence showing session duration, then return to the login screen.",

  exit:
    "Alias for logout.",

  // ── Hidden / Easter Eggs ──────────────────────────────────────────────
  hack:
    "Attempt to hack the mainframe. Runs a fake decryption sequence. (Secret command.)",

};