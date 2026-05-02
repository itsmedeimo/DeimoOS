// session.js — tracks runtime filesystem state for a single terminal session.
//
// _cwd     : the user's current working directory (changes with `cd`)
// _session : files and directories created by the user (touch, mkdir, nano)
//            These are plain JS objects — no server, no localStorage.
//            Everything in _session is wiped when clearSession() is called
//            (reboot or logout).

export const HOME = "/home/deimo";

let _cwd = HOME;
const _session = {}; // { "/path/to/file": { type, content } }

export const getCwd  = () => _cwd;
export const setCwd  = (p) => { _cwd = p; };

// Returns "~" for HOME and "~/subdir" for paths inside HOME (shell convention)
export function getDisplayCwd() {
  if (_cwd === HOME) return "~";
  if (_cwd.startsWith(HOME + "/")) return "~" + _cwd.slice(HOME.length);
  return _cwd;
}

export const getSessionFiles    = () => _session;
export const addSessionEntry    = (path, node) => { _session[path] = node; };
export const removeSessionEntry = (path) => { delete _session[path]; };
export const hasSessionFiles    = () => Object.keys(_session).length > 0;

// Called on reboot/logout — removes all user-created files and resets cwd to HOME
export function clearSession() {
  for (const k of Object.keys(_session)) delete _session[k];
  _cwd = HOME;
}
