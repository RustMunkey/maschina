import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/brand-kit")({
  component: BrandKitPage,
});

const ASSETS = [
  { title: "Logo — SVG",           desc: "Primary logo, wordmark, and icon variants. Light and dark." },
  { title: "Logo — PNG",           desc: "Rasterized at 1×, 2×, and 3× for web and print use." },
  { title: "Color palette",        desc: "Primary, neutral, and accent colors with hex, RGB, and HSL values." },
  { title: "Typography",           desc: "Type scale, weights, and usage guidelines." },
  { title: "Brand guidelines",     desc: "Do's and don'ts, spacing, clear space, and misuse examples." },
  { title: "Social assets",        desc: "Profile images, banners, and Open Graph templates." },
];

function BrandKitPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24 max-w-3xl">
        <ScrambleText text="BRAND KIT" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Assets and guidelines.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed">
          Everything you need to represent Maschina correctly — logos, colors, type, and usage rules.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24">
        <ScrambleText text="INCLUDED" className="text-xs text-white/30 tracking-widest uppercase mb-10 block" />
        <div className="grid grid-cols-3 gap-4">
          {ASSETS.map((a) => (
            <div
              key={a.title}
              className="rounded-xl border border-white/[0.08] p-7 flex flex-col gap-3"
              style={{ background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-sm font-semibold text-white">{a.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-24 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-3">Brand kit coming soon.</h2>
          <p className="text-base text-white/40 max-w-md">
            We're finalizing the asset package. Request early access or reach out with specific needs.
          </p>
        </div>
        <a
          href="mailto:team@maschina.ai?subject=Brand Kit Request"
          className="shrink-0 ml-16 text-sm px-8 py-3 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors"
        >
          Get in touch
        </a>
      </div>

      <Footer />
    </main>
  );
}
