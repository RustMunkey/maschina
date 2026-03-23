import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/blog")({
  component: BlogPage,
});

function BlogPage() {
  return (
    <main className="pt-16 overflow-x-hidden">
      <div className="px-28 pt-20 pb-24">
        <ScrambleText text="BLOG" className="text-xs text-white/30 tracking-widest uppercase mb-6 block" />
        <h1 className="text-5xl font-bold leading-tight tracking-tight text-white mb-8">
          Writing from the network.
        </h1>
        <p className="text-lg text-white/40 leading-relaxed max-w-xl">
          Engineering deep-dives, network updates, and thinking on the future of autonomous infrastructure.
        </p>
      </div>

      <div className="border-t border-white/5" />

      <div className="px-28 py-32 flex flex-col items-center text-center gap-4">
        <p className="text-xs text-white/20 uppercase tracking-widest font-mono">Coming soon</p>
        <p className="text-base text-white/30 max-w-sm leading-relaxed">
          The first posts are in draft. Subscribe to get notified when we publish.
        </p>
        <a
          href="mailto:team@maschina.ai?subject=Blog updates"
          className="mt-4 inline-flex items-center text-sm text-white/50 hover:text-white/80 transition-colors border border-white/10 hover:border-white/20 rounded-full px-6 py-2.5"
        >
          Notify me
        </a>
      </div>

      <Footer />
    </main>
  );
}
