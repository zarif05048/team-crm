// Icons for the Google web chat page (/chat/dungun, /chat/paka) into
// public/chat. Run from the repo root:  node scripts/gen-webchat-icons.mjs
//
// The owner asked for the look of the WhatsApp icon (2026-10-27): WhatsApp's
// green, a rounded square, a white speech bubble with its tail at the bottom
// left. The handset inside WhatsApp's bubble is their mark, so ours holds a
// medical cross instead — familiar at a glance, and plainly the clinic.
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("public/chat", { recursive: true });

const GREEN = "#25D366";

/** The bubble on its own, centred in a 100x100 box (white strokes). */
const bubble = `
  <path d="M50 14c-20.4 0-37 15.6-37 34.9 0 7.3 2.4 14.1 6.5 19.7L14 86l18.6-5.6c5.2 2.7 11.1 4.3 17.4 4.3 20.4 0 37-15.6 37-34.9S70.4 14 50 14z"
        fill="none" stroke="#fff" stroke-width="6.5" stroke-linejoin="round"/>
  <path d="M45 34h10v11h11v10H55v11H45V55H34V45h11z" fill="#fff"/>`;

const svg = (size, { pad = 0.14, radius = 0.22 } = {}) => {
  const inner = size * (1 - pad * 2);
  const s = inner / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * radius}" fill="${GREEN}"/>
  <g transform="translate(${size * pad} ${size * pad}) scale(${s})">${bubble}</g>
</svg>`;
};

for (const [size, name, opts] of [
  [192, "icon-192.png"],
  [512, "icon-512.png"],
  [180, "apple-touch-icon.png", { radius: 0 }],   // iOS rounds it itself
  [512, "icon-maskable-512.png", { pad: 0.22, radius: 0 }],
  [64, "favicon-64.png"],
]) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(`public/chat/${name}`);
}
writeFileSync("public/chat/bubble.svg", svg(100));
console.log("web chat icons written to public/chat");
