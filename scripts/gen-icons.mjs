// Generates the Marketing CRM PWA icons from an inline SVG into public/icons.
// Run from crm/:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

// Emerald rounded square + white chat bubble + megaphone accent.
const svg = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect x="0" y="0" width="512" height="512" rx="${pad ? 0 : 96}" fill="#059669"/>
  <g transform="translate(${pad},${pad}) scale(${(512 - 2 * pad) / 512})">
    <!-- chat bubble -->
    <path fill="#ffffff" d="M256 88c-92 0-166 62-166 138 0 43 24 82 62 107l-14 66a10 10 0 0 0 14 11l77-38c9 1 18 2 27 2 92 0 166-62 166-138S348 88 256 88z"/>
    <!-- megaphone M -->
    <path fill="#059669" d="M180 288v-98l40 0 36 58 36-58 40 0v98h-34v-52l-30 48h-24l-30-48v52z"/>
  </g>
</svg>`;

mkdirSync("public/icons", { recursive: true });

await sharp(Buffer.from(svg())).resize(192, 192).png().toFile("public/icons/icon-192.png");
await sharp(Buffer.from(svg())).resize(512, 512).png().toFile("public/icons/icon-512.png");
// Maskable: full-bleed square with ~10% safe-zone padding baked in.
await sharp(Buffer.from(svg(80))).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
// Apple touch icon (iOS ignores manifest icons).
await sharp(Buffer.from(svg())).resize(180, 180).png().toFile("src/app/apple-icon.png");
// Favicon-ish app icon picked up by Next automatically.
await sharp(Buffer.from(svg())).resize(64, 64).png().toFile("src/app/icon.png");

console.log("icons generated");
