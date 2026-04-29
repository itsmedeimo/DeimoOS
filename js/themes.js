export const THEMES = {
  default: {
    label:      "Default",
    primary:    "#00ff9f",
    accent:     "#00d4ff",
    dim:        "#009966",
    error:      "#ff4437",
    warn:       "#ffaa00",
    bg:         "#000000",
    bgAlt:      "#0a0a0a",
    hidden:     "#555555",
    ph:         "#007a4f",
    phDim:      "#004d33",
    link:       "#ff4437",
    imgFilter:  "brightness(0.65) saturate(1.3) sepia(0.2) contrast(1.1)",
    imgTint:    "rgba(0,255,150,0.08)",
    crtFlicker: "rgba(0,255,150,0.02)",
  },
  c64: {
    label:      "Commodore 64",
    primary:    "#c8c4ff",
    accent:     "#b0acff",
    dim:        "#8880d0",
    error:      "#ff8080",
    warn:       "#ffd700",
    bg:         "#3522b4",
    bgAlt:      "#2a1a9a",
    hidden:     "#5848a8",
    ph:         "#8880d0",
    phDim:      "#6058b8",
    link:       "#f0c870",
    imgFilter:  "brightness(0.6) saturate(0.8) contrast(1.1)",
    imgTint:    "rgba(200,196,255,0.03)",
    crtFlicker: "rgba(200,196,255,0.03)",
  },
  ibm: {
    label:      "IBM 3270",
    primary:    "#33ff33",
    accent:     "#00cc00",
    dim:        "#007700",
    error:      "#ff3333",
    warn:       "#cccc00",
    bg:         "#000000",
    bgAlt:      "#050505",
    hidden:     "#444444",
    ph:         "#006600",
    phDim:      "#003300",
    link:       "#00ffff",
    imgFilter:  "brightness(0.55) saturate(0.4) contrast(1.2)",
    imgTint:    "rgba(51,255,51,0.03)",
    crtFlicker: "rgba(51,255,51,0.02)",
  },
  dracula: {
    label:      "Dracula",
    primary:    "#f8f8f2",
    accent:     "#bd93f9",
    dim:        "#6272a4",
    error:      "#ff5555",
    warn:       "#f1fa8c",
    bg:         "#282a36",
    bgAlt:      "#1e1f29",
    hidden:     "#44475a",
    ph:         "#6272a4",
    phDim:      "#44475a",
    link:       "#ff79c6",
    imgFilter:  "brightness(0.7) saturate(0.9) contrast(1.05)",
    imgTint:    "rgba(189,147,249,0.03)",
    crtFlicker: "rgba(189,147,249,0.02)",
  },
  nord: {
    label:      "Nord",
    primary:    "#d8dee9",
    accent:     "#88c0d0",
    dim:        "#5e81ac",
    error:      "#bf616a",
    warn:       "#ebcb8b",
    bg:         "#2e3440",
    bgAlt:      "#242831",
    hidden:     "#4c566a",
    ph:         "#4c566a",
    phDim:      "#3b4252",
    link:       "#a3be8c",
    imgFilter:  "brightness(0.75) saturate(0.85) contrast(1.0)",
    imgTint:    "rgba(136,192,208,0.03)",
    crtFlicker: "rgba(136,192,208,0.02)",
  },
};

const DEFAULT = "default";

export function applyTheme(name) {
  const t = THEMES[name] || THEMES[DEFAULT];
  const r = document.documentElement.style;
  r.setProperty("--c-primary",     t.primary);
  r.setProperty("--c-accent",      t.accent);
  r.setProperty("--c-dim",         t.dim);
  r.setProperty("--c-error",       t.error);
  r.setProperty("--c-warn",        t.warn);
  r.setProperty("--c-bg",          t.bg);
  r.setProperty("--c-bg-alt",      t.bgAlt);
  r.setProperty("--c-hidden",      t.hidden);
  r.setProperty("--c-ph",          t.ph);
  r.setProperty("--c-ph-dim",      t.phDim);
  r.setProperty("--c-link",        t.link);
  r.setProperty("--c-img-filter",  t.imgFilter);
  r.setProperty("--c-img-tint",    t.imgTint);
  r.setProperty("--c-crt-flicker", t.crtFlicker);
  localStorage.setItem("theme", name in THEMES ? name : DEFAULT);
}

export function getCurrentTheme() {
  const s = localStorage.getItem("theme");
  return s && s in THEMES ? s : DEFAULT;
}

export function getThemeColors() {
  return THEMES[getCurrentTheme()];
}
