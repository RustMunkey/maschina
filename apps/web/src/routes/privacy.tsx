import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

const SECTIONS = [
  {
    title: "What we collect",
    body: "We collect the information you provide when creating an account (name, email), usage data (agent runs, API calls, billing events), and standard server logs (IP address, timestamps, user agent). We do not sell your data.",
  },
  {
    title: "How we use it",
    body: "Account management and authentication, processing payments via Stripe, delivering the service, debugging and improving reliability, and communicating product updates if you've opted in.",
  },
  {
    title: "Data storage",
    body: "Data is stored on servers in the United States. Agent run inputs and outputs are encrypted at rest. Email addresses are stored as HMAC hashes where possible. We do not store plaintext passwords.",
  },
  {
    title: "Third parties",
    body: "We use Stripe for billing, Neon for database hosting, and Sentry for error monitoring. Each is bound by their own privacy policy. We do not share your data with third parties for advertising.",
  },
  {
    title: "Your rights",
    body: "You may request a copy of your data, correct inaccuracies, or request deletion at any time by contacting team@maschina.ai. Account deletion removes all personally identifiable information within 30 days.",
  },
  {
    title: "Cookies",
    body: "We use strictly necessary session cookies for authentication. We do not use tracking or advertising cookies. See our Cookie Policy for details.",
  },
  {
    title: "Changes",
    body: "We may update this policy. Material changes will be communicated via email or in-app notice at least 14 days before they take effect.",
  },
  {
    title: "Contact",
    body: "Questions about this policy: team@maschina.ai. We aim to respond within 5 business days.",
  },
];

function PrivacyPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-16">
        <ScrambleText text="LEGAL" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white mb-4">Privacy Policy</h1>
        <p className="text-sm text-white/30">Effective date: March 2026</p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-16 max-w-3xl flex flex-col gap-10">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-white mb-3">{s.title}</h2>
            <p className="text-sm text-white/40 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>

      <Footer />
    </main>
  );
}
