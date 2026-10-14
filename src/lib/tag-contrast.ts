/** Pick the more readable foreground for the CRM's hex tag colors. */
export function tagTextColor(background: string): "#000000" | "#ffffff" {
  let hex = background.replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) hex = hex.split("").map(c => c + c).join("");
  if (!/^[\da-f]{6}$/i.test(hex)) return "#ffffff";
  const rgb = [0, 2, 4].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}
