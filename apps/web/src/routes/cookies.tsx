import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/cookies")({
  component: CookiesPage,
});

const COOKIES = [
  { name: "session",        type: "Strictly necessary", purpose: "Keeps you logged in. Without this cookie the service doesn't work.", duration: "Session" },
  { name: "csrf_token",     type: "Strictly necessary", purpose: "Protects against cross-site request forgery attacks.",               duration: "Session" },
  { name: "theme",          type: "Functional",         purpose: "Remembers your light/dark mode preference.",                         duration: "1 year"  },
];

function CookiesPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-16">
        <ScrambleText text="LEGAL" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-white mb-4">Cookie Policy</h1>
        <p className="text-sm text-white/30">Effective date: March 2026</p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-16 max-w-3xl flex flex-col gap-10">
        <div>
          <h2 className="text-base font-semibold text-white mb-3">What we use</h2>
          <p className="text-sm text-white/40 leading-relaxed">
            Maschina uses a minimal set of cookies. We do not use advertising cookies, third-party tracking cookies, or analytics cookies that share your data with anyone else. The cookies we set are either strictly necessary for the service to function or improve your experience.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-6">Cookie list</h2>
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-4 gap-4 pb-3 border-b border-white/[0.06]">
              {["Name", "Type", "Purpose", "Duration"].map((h) => (
                <span key={h} className="text-xs text-white/25 uppercase tracking-widest">{h}</span>
              ))}
            </div>
            {COOKIES.map((c) => (
              <div key={c.name} className="grid grid-cols-4 gap-4 py-4 border-b border-white/[0.04]">
                <span className="text-sm text-white/70 font-mono">{c.name}</span>
                <span className="text-sm text-white/40">{c.type}</span>
                <span className="text-sm text-white/40">{c.purpose}</span>
                <span className="text-sm text-white/40">{c.duration}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">Your choices</h2>
          <p className="text-sm text-white/40 leading-relaxed">
            You can disable cookies in your browser settings. Disabling strictly necessary cookies will prevent you from logging in. We don't use cookies that require your consent under GDPR or CCPA — but if that changes, we'll ask.
          </p>
        </div>

        <div>
          <h2 className="text-base font-semibold text-white mb-3">Contact</h2>
          <p className="text-sm text-white/40">Questions: <a href="mailto:team@maschina.ai" className="text-white/60 hover:text-white/90 transition-colors">team@maschina.ai</a></p>
        </div>
      </div>

      <Footer />
    </main>
  );
}
