import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

const SECTIONS = [
  {
    title: "Acceptance",
    body: "By accessing or using Maschina, you agree to these Terms of Service. If you don't agree, don't use the service. These terms apply to all users — developers, node operators, and guests.",
  },
  {
    title: "What Maschina provides",
    body: "Maschina provides infrastructure for deploying and executing AI agents across a distributed network. We are a platform, not an AI provider. The models and agents you use or build are your responsibility.",
  },
  {
    title: "Acceptable use",
    body: "You may not use Maschina to generate illegal content, conduct fraud, spam, conduct attacks on third-party systems, violate others' intellectual property, or circumvent rate limits or billing. Violations result in immediate account termination.",
  },
  {
    title: "Your content",
    body: "You own the agents you build and the data you process. By using Maschina, you grant us a limited license to execute your agents on network nodes as directed. We do not train on your data.",
  },
  {
    title: "Billing",
    body: "Subscription fees are charged monthly or annually. Credits are consumed per agent run. Unused credits do not roll over unless stated. Refunds are evaluated case-by-case — contact us within 7 days of a charge.",
  },
  {
    title: "Node operators",
    body: "Node operators agree to execute jobs faithfully, maintain uptime commitments, and abide by network policies. Maschina may remove nodes from the network at any time for policy violations or reliability failures.",
  },
  {
    title: "Availability",
    body: "We aim for high availability but make no uptime guarantee on the Access tier. SLA guarantees are specific to M10 and enterprise plans. Scheduled maintenance will be communicated in advance.",
  },
  {
    title: "Limitation of liability",
    body: "Maschina is provided as-is. To the extent permitted by law, we are not liable for indirect, incidental, or consequential damages arising from use of the platform.",
  },
  {
    title: "Termination",
    body: "We may suspend or terminate accounts that violate these terms, with or without notice depending on severity. You may cancel your account at any time from your dashboard.",
  },
  {
    title: "Changes",
    body: "We may update these terms. Continued use after notice of changes constitutes acceptance. Material changes are notified at least 14 days in advance.",
  },
];

function TermsPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-16">
        <ScrambleText text="LEGAL" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white mb-4">Terms of Service</h1>
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
