import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT, LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Terms of Service — Klinik Hijraa",
  description: "Terms for messaging Klinik Hijraa on WhatsApp, Facebook, TikTok and web chat.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="12 November 2026">
      <p>
        These terms apply when you message Klinik Hijraa 24 Jam (Dungun and Paka) through our WhatsApp line, our Facebook
        pages, our TikTok account or the chat page on our websites.
      </p>

      <h2>What this service is</h2>
      <ul>
        <li>A way to ask the clinic about its services, opening hours, prices and appointments, and to request a booking.</li>
        <li>
          Replies may come from clinic staff or from an automated AI assistant. The assistant gives general information only.
        </li>
      </ul>

      <h2>Not for emergencies or medical advice</h2>
      <p>
        Messages are not monitored as an emergency service. In an emergency call 999 or come to the clinic or the nearest
        hospital immediately. Nothing sent in a chat is a diagnosis or a substitute for seeing a doctor.
      </p>

      <h2>Bookings and prices</h2>
      <ul>
        <li>A booking request made in chat is confirmed only when clinic staff confirm it.</li>
        <li>Prices mentioned in chat are a guide; the final charge is confirmed at the clinic.</li>
      </ul>

      <h2>Using the service fairly</h2>
      <p>
        Please do not send abusive, unlawful or spam messages. We may stop replying to, or block, an account that does.
        Do not send other people&apos;s personal information without their permission.
      </p>

      <h2>Your information</h2>
      <p>
        How we handle your messages is described in our <Link href="/legal/privacy" className="font-semibold text-blue-700 underline">Privacy Notice</Link>.
        The platform you use (WhatsApp, Facebook, TikTok) also applies its own terms to your account.
      </p>

      <h2>Changes</h2>
      <p>We may update these terms; the date at the top shows the latest version.</p>

      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </LegalPage>
  );
}
