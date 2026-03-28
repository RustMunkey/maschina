import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import { ArrowUpRight } from "@phosphor-icons/react";

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});

const PRACTICES = [
  { title: "Encryption at rest",      body: "Agent configs, run payloads, and sensitive user data are encrypted at rest using AES-256-GCM. Encryption keys are compartmentalized by data type." },
  { title: "Encryption in transit",   body: "All API endpoints are served over HTTPS/TLS 1.3. Internal service communication uses mTLS. NATS traffic is encrypted in transit." },
  { title: "Authentication",          body: "Passwords are hashed with argon2id. API keys use a prefix + hash model — we never store plaintext keys. Sessions are short-lived JWT tokens." },
  { title: "Access control",          body: "Role-based access control at the API level. Node runners can only receive jobs, not read user data. Internal services have minimal required permissions." },
  { title: "Infrastructure",          body: "Services run behind a reverse proxy. Internal services are not publicly exposed. Firewall rules restrict access by IP and port. fail2ban is active on all SSH-accessible hosts." },
  { title: "Dependency management",   body: "Dependencies are pinned and audited. We run automated vulnerability scans on CI. Critical patches are applied within 24 hours of disclosure." },
];

function SecurityPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="SECURITY" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          How we protect the network.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          Security is a first-class concern at every layer of Maschina — from API design to infrastructure to the encryption model for agent payloads.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="PRACTICES" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {PRACTICES.map((p) => (
            <div
              key={p.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-sm font-semibold text-white">{p.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 grid grid-cols-2 gap-24">
        <div>
          <ScrambleText text="VULNERABILITY DISCLOSURE" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <h2 className="text-2xl font-bold text-white mb-4">Found something?</h2>
          <p className="text-base text-white/40 leading-relaxed">
            We appreciate responsible disclosure. If you find a security vulnerability in Maschina, please report it privately before going public. We'll acknowledge within 24 hours and keep you updated on the fix.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-sm text-white/30">
              Email: <a href="mailto:security@maschina.ai" className="text-white/60 hover:text-white/90 transition-colors">security@maschina.ai</a>
            </p>
            <p className="text-xs text-white/20">Please include reproduction steps, impact assessment, and any proof of concept. We do not currently operate a bug bounty program, but we recognize and thank all reporters publicly (if desired).</p>
          </div>
        </div>
        <div>
          <ScrambleText text="SCOPE" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
          <div className="flex flex-col gap-3">
            {[
              { label: "In scope",     items: ["api.maschina.dev", "app.maschina.dev", "maschina.dev", "CLI binary", "Node software"] },
              { label: "Out of scope", items: ["Third-party services (Stripe, Neon)", "Social engineering attacks", "Physical attacks", "DoS / load testing"] },
            ].map((group) => (
              <div key={group.label}>
                <p className="text-xs text-white/30 uppercase tracking-widest mb-3">{group.label}</p>
                <ul className="flex flex-col gap-1.5">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-white/40">
                      <span className="text-white/20">—</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
