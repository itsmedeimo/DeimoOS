export const HOME = "/home/deimo";

let _cwd = HOME;
const _session = {};

export const getCwd  = () => _cwd;
export const setCwd  = (p) => { _cwd = p; };

export function getDisplayCwd() {
  if (_cwd === HOME) return "~";
  if (_cwd.startsWith(HOME + "/")) return "~" + _cwd.slice(HOME.length);
  return _cwd;
}

export const getSessionFiles   = () => _session;
export const addSessionEntry   = (path, node) => { _session[path] = node; };
export const removeSessionEntry = (path) => { delete _session[path]; };
export const hasSessionFiles   = () => Object.keys(_session).length > 0;

export function clearSession() {
  for (const k of Object.keys(_session)) delete _session[k];
  _cwd = HOME;
}
