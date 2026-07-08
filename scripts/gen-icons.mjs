// Generates the Marketing CRM PWA icons from the Hijraa logo into public/icons.
// Run from crm/:  node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const LOGO = "public/logo.png";

mkdirSync("public/icons", { recursive: true });

// White rounded square with the logo centered — the logo has colored art on a
// transparent background, so it reads cleanly on white. `pad` = safe-zone
// padding for the maskable variant.
async function icon(size, out, { pad = 0.16, radius = 0.19, bg = "#ffffff" } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const logo = await sharp(LOGO)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  const r = Math.round(size * radius);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`,
  );
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([
      { input: logo, gravity: "centre" },
      { input: mask, blend: "dest-in" },
    ])
    .png()
    .toFile(out);
}

await icon(192, "public/icons/icon-192.png");
await icon(512, "public/icons/icon-512.png");
// Maskable: square corners + generous safe-zone so launchers can crop it.
await icon(512, "public/icons/icon-maskable-512.png", { pad: 0.22, radius: 0 });
// Apple touch icon (iOS ignores manifest icons) — square corners, iOS rounds it.
await icon(180, "src/app/apple-icon.png", { radius: 0 });
// App icon picked up by Next automatically.
await icon(64, "src/app/icon.png");

console.log("icons generated from logo");
