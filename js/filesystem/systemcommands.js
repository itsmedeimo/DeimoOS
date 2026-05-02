// systemcommands.js — implements all filesystem commands (ls, cd, cat, mkdir, touch, rm, nano).
//
// The virtual filesystem has two layers:
//   1. TREE (tree.js)    — static files and dirs baked into the source; never modified
//   2. session (session.js) — files created by the user during a session (touch, mkdir, nano)
//                             stored in a plain JS object; wiped on reboot/logout
//
// Write access is intentionally limited to /home/deimo and /tmp.
// /root and /home/deimo/passwords/ are "restricted" — they ask for a sudo password
// and then deny access, for authenticity.

import { TREE } from "./tree.js";
import {
  HOME, getCwd, setCwd, getDisplayCwd,
  getSessionFiles, addSessionEntry, removeSessionEntry,
} from "./session.js";
import { getThemeColors } from "../themes.js";

/* ── PATH UTILS ── */

// Resolves ".." and "." segments in an absolute path string
// e.g. normalizePath("/home/deimo/../etc") → "/etc"
function normalizePath(path) {
  const parts = path.split("/").filter(Boolean);
  const out = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== ".") out.push(p);
  }
  return "/" + out.join("/");
}

// Converts any user-typed path to an absolute path using the current directory.
// Handles: empty (→ cwd), "~" (→ HOME), "~/foo", "/absolute", "relative"
function resolvePath(input) {
  if (!input) return getCwd();
  if (input === "~") return HOME;
  if (input.startsWith("~/")) return normalizePath(HOME + "/" + input.slice(2));
  if (input.startsWith("/")) return normalizePath(input);
  return normalizePath(getCwd() + "/" + input);
}

// Looks up a node (file or dir) by its absolute path.
// Checks session files first so user-created files shadow nothing in TREE.
function getNode(path) {
  return TREE[path] || getSessionFiles()[path] || null;
}

// Returns all immediate children of a directory as { name → node } pairs.
// Merges TREE and session files so both static and user-created entries appear.
function listChildren(dirPath) {
  const prefix = dirPath === "/" ? "/" : dirPath + "/";
  const children = {};
  const all = { ...TREE, ...getSessionFiles() };
  for (const [p, node] of Object.entries(all)) {
    if (p === dirPath) continue;
    if (!p.startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    if (!rest.includes("/")) children[rest] = node; // only direct children (no grandchildren)
  }
  return children;
}

// Access control helpers
const isRestricted = (path) => path === "/root" || path.startsWith("/root/");          // sudo prompt
const isDenied     = (path) => path.startsWith("/home/deimo/passwords/");              // sudo prompt
const isWritable   = (path) =>                                                         // only home + tmp
  path === HOME || path.startsWith(HOME + "/") ||
  path === "/tmp" || path.startsWith("/tmp/");

/* ── RESTRICTED PASSWORD PROMPT (always denied) ── */
// Simulates a sudo password prompt for flavor — no matter what the user types,
// it will always print "Permission denied". The invisible <input type="password">
// captures keystrokes so the terminal doesn't intercept them during the prompt.

async function askPasswordDeny(out, ctx) {
  await new Promise(resolve => {
    ctx.setIsAwaitingInput(true);
    const line = document.createElement("div");
    line.textContent = `[sudo] password for ${ctx.username}: `;
    out.appendChild(line);
    ctx.scrollToBottom();

    const input = document.createElement("input");
    input.type = "password";
    input.style.cssText =
      `background:transparent;border:none;outline:none;color:transparent;` +
      `caret-color:${getThemeColors().primary};font-family:inherit;font-size:inherit;width:1px;`;
    const stars = document.createElement("span");
    line.appendChild(input);
    line.appendChild(stars);

    input.addEventListener("input", () => {
      stars.textContent = "*".repeat(input.value.length);
    });
    setTimeout(() => input.focus(), 50);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      e.stopPropagation();
      input.remove();
      stars.remove();
      ctx.setIsAwaitingInput(false);
      resolve();
    });
  });
  await ctx.typeTextInto("Permission denied.", out);
}

/* ── COMMANDS ── */

async function cmdPwd(args, out, ctx) {
  await ctx.typeTextInto(getCwd(), out);
  return true;
}

async function cmdCd(args, out, ctx) {
  const arg = args[0];

  if (!arg || arg === "~") {
    setCwd(HOME);
    return true;
  }

  const target = resolvePath(arg);

  if (isRestricted(target)) {
    await askPasswordDeny(out, ctx);
    return true;
  }

  const node = getNode(target);
  if (!node) {
    await ctx.typeTextInto(`cd: ${arg}: No such file or directory`, out);
    return true;
  }
  if (node.type !== "dir") {
    await ctx.typeTextInto(`cd: ${arg}: Not a directory`, out);
    return true;
  }

  setCwd(target);
  return true;
}

async function cmdLs(args, out, ctx) {
  let showHidden = false;
  let longFormat = false;
  let targetArg  = null;

  for (const a of args) {
    if (a.startsWith("-")) {
      if (a.includes("a")) showHidden = true;
      if (a.includes("l")) longFormat = true;
    } else {
      targetArg = a;
    }
  }

  const target = resolvePath(targetArg || "");

  if (isRestricted(target)) {
    await ctx.typeTextInto(
      `ls: cannot open directory '${targetArg || getDisplayCwd()}': Permission denied`, out
    );
    return true;
  }

  const node = getNode(target);
  if (!node) {
    await ctx.typeTextInto(
      `ls: cannot access '${targetArg}': No such file or directory`, out
    );
    return true;
  }
  if (node.type !== "dir") {
    const name = targetArg.split("/").pop();
    await ctx.typeTextInto(name, out);
    return true;
  }

  const children = listChildren(target);
  const entries  = Object.entries(children)
    .filter(([name]) => showHidden || !name.startsWith("."))
    .sort(([a], [b]) => a.localeCompare(b));

  if (entries.length === 0) return true;

  const el = document.createElement("div");
  el.style.whiteSpace = "pre-wrap";

  if (longFormat) {
    const lines = entries.map(([name, n]) => {
      const isDir  = n.type === "dir";
      const perms  = isDir ? "drwxr-xr-x" : "-rw-r--r--";
      const size   = String(isDir ? 4096 : n.type === "image" ? 8192 : 512).padStart(8);
      const color  = colorFor(name, n);
      const label  = isDir ? name + "/" : name;
      return (
        `<span style="color:${getThemeColors().hidden}">${perms}  1 deimo deimo ${size} Apr 26 00:01 </span>` +
        `<span style="color:${color}">${label}</span>`
      );
    });
    el.innerHTML = lines.join("\n");
  } else {
    const parts = entries.map(([name, n]) => {
      const color = colorFor(name, n);
      const label = n.type === "dir" ? name + "/" : name;
      return `<span style="color:${color}">${label}</span>`;
    });
    el.innerHTML = parts.join("  ");
  }

  out.appendChild(el);
  ctx.scrollToBottom();
  return true;
}

// Maps a filesystem entry to a display color (mimics ls --color behavior)
function colorFor(name, node) {
  const c = getThemeColors();
  if (node.type === "dir")   return c.accent;   // directories in accent color
  if (node.type === "image") return c.warn;      // image files in warning color
  if (name.startsWith("."))  return c.hidden;    // dotfiles in dim gray
  return c.primary;                              // regular files in primary color
}

async function cmdCat(args, out, ctx) {
  if (!args[0]) {
    await ctx.typeTextInto("cat: missing operand", out);
    return true;
  }

  const target = resolvePath(args[0]);

  if (isDenied(target) || isRestricted(target)) {
    await askPasswordDeny(out, ctx);
    return true;
  }

  const node = getNode(target);
  if (!node) {
    await ctx.typeTextInto(`cat: ${args[0]}: No such file or directory`, out);
    return true;
  }
  if (node.type === "dir") {
    await ctx.typeTextInto(`cat: ${args[0]}: Is a directory`, out);
    return true;
  }
  if (node.type === "image") {
    const wrapper = document.createElement("div");
    wrapper.className = "crt-image";
    const img = document.createElement("img");
    img.src = node.src;
    img.alt = args[0].split("/").pop();
    img.addEventListener("load",  () => ctx.scrollToBottom(), { once: true });
    img.addEventListener("error", () => ctx.scrollToBottom(), { once: true });
    wrapper.appendChild(img);
    out.appendChild(wrapper);
    ctx.scrollToBottom();
    return true;
  }

  out.style.whiteSpace = "pre";
  await ctx.typeTextInto(node.content, out);
  out.style.whiteSpace = "";
  return true;
}

async function cmdMkdir(args, out, ctx) {
  if (!args[0]) {
    await ctx.typeTextInto("mkdir: missing operand", out);
    return true;
  }

  const target = resolvePath(args[0]);

  if (!isWritable(target)) {
    await ctx.typeTextInto(`mkdir: cannot create directory '${args[0]}': Permission denied`, out);
    return true;
  }
  if (getNode(target)) {
    await ctx.typeTextInto(`mkdir: cannot create directory '${args[0]}': File exists`, out);
    return true;
  }

  const parent = target.slice(0, target.lastIndexOf("/")) || "/";
  if (!getNode(parent)) {
    await ctx.typeTextInto(`mkdir: cannot create directory '${args[0]}': No such file or directory`, out);
    return true;
  }

  addSessionEntry(target, { type: "dir", session: true });
  return true;
}

async function cmdTouch(args, out, ctx) {
  if (!args[0]) {
    await ctx.typeTextInto("touch: missing file operand", out);
    return true;
  }

  const target = resolvePath(args[0]);

  if (!isWritable(target)) {
    await ctx.typeTextInto(`touch: cannot touch '${args[0]}': Permission denied`, out);
    return true;
  }

  if (!getNode(target)) {
    const parent = target.slice(0, target.lastIndexOf("/")) || "/";
    if (!getNode(parent)) {
      await ctx.typeTextInto(`touch: cannot touch '${args[0]}': No such file or directory`, out);
      return true;
    }
    addSessionEntry(target, { type: "file", content: "", session: true });
  }
  return true;
}

async function cmdRm(args, out, ctx) {
  if (!args[0]) {
    await ctx.typeTextInto("rm: missing operand", out);
    return true;
  }

  if (args.join(" ") === "-rf /") return "__crash__";

  let recursive = false;
  const targets = [];

  for (const a of args) {
    if (a.startsWith("-")) {
      if (a.includes("r") || a.includes("R") || a.includes("f")) recursive = true;
    } else {
      targets.push(a);
    }
  }

  if (targets.length === 0) {
    await ctx.typeTextInto("rm: missing operand", out);
    return true;
  }

  for (const t of targets) {
    const target  = resolvePath(t);
    const session = getSessionFiles();

    if (isDenied(target) || isRestricted(target)) {
      await askPasswordDeny(out, ctx);
      continue;
    }
    if (TREE[target]) {
      await ctx.typeTextInto(`rm: cannot remove '${t}': Permission denied`, out);
      continue;
    }
    if (!session[target]) {
      await ctx.typeTextInto(`rm: cannot remove '${t}': No such file or directory`, out);
      continue;
    }

    const node = session[target];
    if (node.type === "dir" && !recursive) {
      await ctx.typeTextInto(`rm: cannot remove '${t}': Is a directory`, out);
      continue;
    }
    if (node.type === "dir") {
      const prefix = target + "/";
      for (const p of Object.keys(session)) {
        if (p === target || p.startsWith(prefix)) removeSessionEntry(p);
      }
    } else {
      removeSessionEntry(target);
    }
  }
  return true;
}

/* ── NANO ── */
// A minimal in-browser text editor that mimics GNU nano.
// It creates a fullscreen overlay with a header bar, textarea, and footer bar.
// Ctrl+S saves to session files; Ctrl+X exits (with unsaved-change warning).
// The editor is only allowed in writable paths (/home/deimo, /tmp).

async function cmdNano(args, out, ctx) {
  if (!args[0]) {
    await ctx.typeTextInto("Usage: nano <filename>", out);
    return true;
  }

  const target   = resolvePath(args[0]);
  const filename = target.split("/").pop();

  if (isDenied(target) || isRestricted(target)) {
    await askPasswordDeny(out, ctx);
    return true;
  }

  const existing = getNode(target);
  if (existing && existing.type === "dir") {
    await ctx.typeTextInto(`nano: ${args[0]}: Is a directory`, out);
    return true;
  }
  if (!isWritable(target)) {
    await ctx.typeTextInto(`nano: ${args[0]}: Permission denied`, out);
    return true;
  }

  const parent = target.slice(0, target.lastIndexOf("/")) || "/";
  if (!getNode(parent)) {
    await ctx.typeTextInto(`nano: ${args[0]}: No such file or directory`, out);
    return true;
  }

  return await new Promise(resolve => {
    ctx.setIsAwaitingInput(true);

    const overlay = document.createElement("div");
    overlay.className = "nano-overlay";

    const header = document.createElement("div");
    header.className = "nano-bar";
    header.textContent = ` GNU nano 7.2    ${filename}`;

    const textarea = document.createElement("textarea");
    textarea.className = "nano-body";
    textarea.value = existing ? existing.content : "";
    textarea.spellcheck = false;
    textarea.setAttribute("autocomplete",   "off");
    textarea.setAttribute("autocorrect",    "off");
    textarea.setAttribute("autocapitalize", "off");

    const footer = document.createElement("div");
    footer.className = "nano-bar";
    footer.textContent = "^S Save   ^X Exit";

    overlay.appendChild(header);
    overlay.appendChild(textarea);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);
    setTimeout(() => textarea.focus(), 50);

    let modified    = false;
    let warnPending = false;

    textarea.addEventListener("input", () => {
      modified    = true;
      warnPending = false;
      header.textContent = ` GNU nano 7.2    ${filename}    [Modified]`;
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const s = textarea.selectionStart;
        textarea.value = textarea.value.slice(0, s) + "  " + textarea.value.slice(textarea.selectionEnd);
        textarea.selectionStart = textarea.selectionEnd = s + 2;
        return;
      }
      if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        addSessionEntry(target, { type: "file", content: textarea.value, session: true });
        modified    = false;
        warnPending = false;
        header.textContent = ` GNU nano 7.2    ${filename}`;
        footer.textContent = `[ Wrote: ${filename} ]`;
        setTimeout(() => { footer.textContent = "^S Save   ^X Exit"; }, 1500);
        return;
      }
      if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
        e.preventDefault();
        if (modified && !warnPending) {
          warnPending = true;
          footer.textContent = "[ Unsaved changes — ^X again to discard, ^S to save ]";
          return;
        }
        overlay.remove();
        ctx.setIsAwaitingInput(false);
        ctx.clearOutput();
        resolve(true);
        return;
      }
      warnPending = false;
    });
  });
}

/* ── PATH COMPLETION ── */
// Used by the Tab key handler in script.js to suggest file/directory names.
// typeFilter lets the caller restrict completions by type:
//   "all"   — everything
//   "files" — only non-directory nodes
//   "dirs"  — only directory nodes

// typeFilter: "all" | "files" | "dirs"
export function getPathCompletions(partial, typeFilter = "all") {
  const lastSlash = partial.lastIndexOf("/");
  let searchDir, namePrefix, pathPrefix;

  if (lastSlash >= 0) {
    pathPrefix = partial.slice(0, lastSlash + 1);
    namePrefix = partial.slice(lastSlash + 1).toLowerCase();
    searchDir  = resolvePath(pathPrefix.slice(0, -1) || "/");
  } else {
    pathPrefix = "";
    namePrefix = partial.toLowerCase();
    searchDir  = getCwd();
  }

  const children = listChildren(searchDir);
  return Object.entries(children)
    .filter(([name, node]) => {
      if (!namePrefix && name.startsWith(".")) return false;
      if (!name.toLowerCase().startsWith(namePrefix)) return false;
      if (typeFilter === "dirs")  return node.type === "dir";
      if (typeFilter === "files") return node.type !== "dir";
      return true;
    })
    .map(([name, node]) => pathPrefix + (node.type === "dir" ? name + "/" : name))
    .sort();
}

/* ── DISPATCH ── */
// Maps command names to handler functions. script.js checks FS_COMMANDS first
// and routes matching commands here instead of through the commands.js lookup.

const HANDLERS = {
  ls: cmdLs, dir: cmdLs, // `dir` is an alias for `ls` (Windows familiarity)
  cd: cmdCd,
  cat: cmdCat,
  pwd: cmdPwd,
  mkdir: cmdMkdir,
  touch: cmdTouch,
  rm: cmdRm,
  nano: cmdNano,
};

// Exported so script.js can check `FS_COMMANDS.includes(baseCmd)` before dispatch
export const FS_COMMANDS = Object.keys(HANDLERS);

// Returns the handler's return value; "__crash__" from cmdRm triggers the crash sequence
export async function handleFsCommand(baseCmd, args, out, ctx) {
  const handler = HANDLERS[baseCmd];
  if (!handler) return null;
  return await handler(args, out, ctx);
}
