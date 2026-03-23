import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/careers")({
  component: CareersPage,
});

const VALUES = [
  { title: "Default to distributed", body: "We build decentralized infrastructure and operate the same way — async-first, globally distributed, no single point of failure." },
  { title: "Own the outcome", body: "Small team, real ownership. Everyone is close to the product and close to the user. No layers, no waiting for approval." },
  { title: "Build to last", body: "We move fast but we don't cut corners on correctness. Infrastructure that people depend on needs to be right." },
  { title: "Earn trust, don't demand it", body: "From users, from node operators, from each other. Trust is the foundation of a network." },
];

function CareersPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-4xl">
        <ScrambleText text="CAREERS" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Build the network with us.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          Maschina is a small team building large-scale infrastructure. We're looking for people who want to work on hard problems that matter.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="VALUES" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-2 gap-4">
          {VALUES.map((v) => (
            <div
              key={v.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-base font-semibold text-white">{v.title}</h3>
              <p className="text-sm text-white/40 leading-relaxed">{v.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 flex items-center justify-between">
        <div>
          <ScrambleText text="OPEN ROLES" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
          <h2 className="text-2xl font-bold text-white mb-3">No open roles right now.</h2>
          <p className="text-base text-white/40 max-w-md">
            We hire slowly and deliberately. If you think you belong here regardless, reach out.
          </p>
        </div>
        <a
          href="mailto:team@maschina.ai?subject=Working at Maschina"
          className="shrink-0 ml-16 text-sm px-8 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors"
        >
          Get in touch
        </a>
      </div>

      <Footer />
    </main>
  );
}
