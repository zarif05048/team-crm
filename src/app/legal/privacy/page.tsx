import type { Metadata } from "next";
import { CONTACT, LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Privacy Notice — Klinik Hijraa",
  description: "How Klinik Hijraa handles messages sent to its WhatsApp, Facebook, TikTok and web chat.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Notice" updated="12 November 2026">
      <p>
        This notice explains what happens to the messages you send to Klinik Hijraa 24 Jam (Dungun and Paka) through our
        WhatsApp line, our Facebook pages, our TikTok account and the chat page on our websites. It is given in line with the
        Personal Data Protection Act 2010 (Malaysia).
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>The messages you send us and our replies, with the time they were sent.</li>
        <li>
          The name your account shows (your WhatsApp, Facebook or TikTok profile name) and the identifier the platform gives
          us so that our reply reaches you. On WhatsApp this is your phone number.
        </li>
        <li>Anything you choose to tell us in the chat — for example a name, a phone number, or a preferred appointment time.</li>
      </ul>
      <p>We do not read your Facebook or TikTok profile, friends, posts or followers. We only receive the messages you send to us.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To answer your enquiry and to arrange an appointment or service you ask for.</li>
        <li>To let clinic staff follow up on that enquiry.</li>
        <li>To keep a record of what was asked and answered, for the quality and safety of our service.</li>
      </ul>
      <p>
        Some replies are written automatically by an AI assistant and are marked as such inside our system. It gives general
        information about the clinic; it does not diagnose or give medical advice. Staff can take over any conversation.
      </p>

      <h2>Who can see it</h2>
      <ul>
        <li>Authorised Klinik Hijraa staff, through a password-protected system.</li>
        <li>
          The service providers that carry or store the messages for us: Meta (WhatsApp, Facebook Messenger), TikTok, our
          database and hosting providers, and the AI service that drafts automatic replies. They process the messages only to
          provide that service to us.
        </li>
      </ul>
      <p>We do not sell your information and we do not use your messages for advertising to other people.</p>

      <h2>How long we keep it</h2>
      <p>
        Messages are deleted automatically 12 months after they were sent. Notes about a booking you made may be kept longer
        as part of the clinic&apos;s records.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You may ask us what we hold about your conversation, ask us to correct it, or ask us to delete it.</li>
        <li>You may stop at any time: simply stop messaging us, or block the account on the platform you used.</li>
      </ul>

      <h2 id="delete">How to ask for your data to be deleted</h2>
      <p>
        Send us a message on the same channel you used (WhatsApp, Facebook, TikTok or the web chat) saying
        &quot;delete my data&quot;, or contact the clinic using the details below. Tell us which channel and account name you
        used. We will delete the conversation and the contact record within 14 days and confirm to you when it is done.
      </p>

      <h2>Contact</h2>
      <p>{CONTACT}</p>
    </LegalPage>
  );
}
