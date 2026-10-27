import { NextResponse } from "next/server";
import { WEB_CLINICS, isWebClinic } from "@/lib/webchat";

// "Add to Home screen" from a clinic's chat page gives the patient a chat icon
// of its own that opens straight back into their conversation — not the staff
// CRM app the rest of this site installs as.
export async function GET(_req: Request, { params }: { params: Promise<{ clinic: string }> }) {
  const { clinic } = await params;
  if (!isWebClinic(clinic)) return new NextResponse("Not found", { status: 404 });
  const c = WEB_CLINICS[clinic];
  return NextResponse.json(
    {
      id: `/chat/${clinic}`,
      name: c.clinic,
      short_name: `Hijraa ${c.branch}`,
      start_url: `/chat/${clinic}`,
      scope: `/chat/${clinic}`,
      display: "standalone",
      background_color: "#efeae2",
      theme_color: "#008069",
      icons: [
        { src: "/chat/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/chat/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/chat/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
