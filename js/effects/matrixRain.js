// effects/matrixRain.js — shared matrix-rain canvas animation.
//
// Both the `matrix` command and the screensaver use the same visual effect:
// columns of falling Japanese katakana + hex digits rendered on a <canvas>.
// This module centralises that logic so neither caller duplicates it.
//
// Usage:
//   import { createMatrixRain } from "./effects/matrixRain.js";
//   const rain = createMatrixRain({ zIndex: 9997 });
//   // later:
//   rain.stop();           // fades out and removes the canvas
//   rain.canvas            // the raw <canvas> element (for adding event listeners)

import { getThemeColors } from "../themes.js";

// Character pool drawn from katakana + hex digits.
// Katakana provides the classic Matrix look; hex keeps it technical.
const CHARS = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
const FONT_SIZE = 16; // px; also determines column width (one char per column)
const FRAME_MS  = 40; // ~25 fps — fast enough to look fluid, low enough on CPU

// createMatrixRain({ zIndex }) → { stop, canvas }
//
//   zIndex — CSS z-index for the overlay canvas (default 9997).
//            The screensaver uses 9996 (below the nano editor at 9995).
//
//   Returns an object with:
//     stop()  — clears the animation interval and fades the canvas out.
//               The canvas removes itself from the DOM after the 0.6s transition.
//     canvas  — the raw <canvas> element so callers can add click/touch listeners,
//               change pointer-events, etc.
export function createMatrixRain({ zIndex = 9997 } = {}) {
  // ── CANVAS SETUP ──
  // Starts fully transparent; fades in via CSS transition (see double-rAF below).
  // pointer-events:none so the canvas doesn't block clicks on the terminal.
  // Callers that want the canvas to be clickable (screensaver) can override this.
  const canvas = document.createElement("canvas");
  canvas.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "width:100%",
    "height:100%",
    `z-index:${zIndex}`,
    "opacity:0",
    "transition:opacity 1.5s ease",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(canvas);

  const ctx    = canvas.getContext("2d");
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;

  // One "drop" per column — tracks how far down each column the leading character is
  const cols  = Math.floor(canvas.width / FONT_SIZE);
  const drops = Array(cols).fill(1);

  // ── ANIMATION LOOP ──
  const interval = setInterval(() => {
    // Semi-transparent black fill creates the "trail" effect:
    // old characters fade out over several frames rather than disappearing instantly.
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw one random character at the leading position of each column.
    // Color is pulled from the active theme so it respects theme switches mid-animation.
    ctx.fillStyle = getThemeColors().primary;
    ctx.font = `${FONT_SIZE}px 'Share Tech Mono', monospace`;

    for (let i = 0; i < drops.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      ctx.fillText(char, i * FONT_SIZE, drops[i] * FONT_SIZE);

      // Once a drop reaches the bottom, randomly reset it to the top.
      // The 0.975 threshold staggers resets so columns don't all wrap at once.
      if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }, FRAME_MS);

  // ── FADE IN ──
  // Double requestAnimationFrame ensures the canvas is fully in the DOM and
  // has had its initial paint before the opacity transition starts.
  // A single rAF can fire before the browser has committed the element's style,
  // causing the transition to be skipped entirely.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      canvas.style.opacity = "1";
    });
  });

  // ── STOP ──
  // Clears the draw loop, triggers a fast fade-out, then self-removes the canvas.
  // Callers don't need to clean up anything — this is the only handle needed.
  const stop = () => {
    clearInterval(interval);
    canvas.style.transition = "opacity 0.6s ease";
    canvas.style.opacity = "0";
    // Remove the canvas after the transition finishes (avoids a layout-visible pop)
    canvas.addEventListener("transitionend", () => canvas.remove(), { once: true });
  };

  return { stop, canvas };
}
