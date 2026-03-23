import { createFileRoute } from "@tanstack/react-router";
import { GlobeVisualization } from "../components/GlobeVisualization";
import { CornerBrackets } from "../components/CornerBrackets";
import { Starfield } from "../components/Starfield";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";
import Noise from "../components/Noise";
import LightRays from "../components/LightRays";

export const Route = createFileRoute("/network")({
  component: NetworkPage,
});

function NetworkPage() {
  return (
    <main className="pt-16 overflow-x-hidden relative">
      <Starfield />

      {/* Hero text */}
      <div className="relative bg-black px-28 pt-12 pb-12">
        <div className="flex flex-col items-start">
          <ScrambleText text="LIVE INFRASTRUCTURE" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
          <h1 className="text-4xl font-bold leading-tight tracking-tight mb-6 text-white">
            The network, in real time.
          </h1>
          <p className="max-w-sm text-base text-white/50 leading-relaxed">
            Nodes across the globe execute your agents. Every run is routed, verified, and settled on-chain.
          </p>
        </div>
      </div>


      <div className="relative h-screen border-t border-b border-white/5 overflow-hidden">

        {/* HUD */}
        <style>{`
          @keyframes hud-blink { 0%,100%{opacity:1} 50%{opacity:0} }
          @keyframes hud-scan  { 0%{opacity:0.6} 50%{opacity:0.15} 100%{opacity:0.6} }
          @keyframes hud-bar   { from{width:0} }
          .hud-blink { animation: hud-blink 1.1s step-end infinite; }
          .hud-scan  { animation: hud-scan 3s ease-in-out infinite; }
          .hud-bar   { animation: hud-bar 1.4s cubic-bezier(0.4,0,0.2,1) forwards; }
        `}</style>

        <div className="absolute top-0 left-0 h-full w-1/2 flex flex-col justify-center z-10" style={{ fontFamily: "'JetBrains Mono', monospace", paddingLeft: "7rem", paddingRight: "2rem", transform: "translateX(32px)" }}>

          {/* Panel border with corner ticks */}
          <div className="relative border border-white/10 p-8" style={{ borderStyle: "solid" }}>

            {/* Corner ticks */}
            {[
              { top: -1, left: -1, borderTop: "2px solid #F84242", borderLeft: "2px solid #F84242", width: 16, height: 16 },
              { top: -1, right: -1, borderTop: "2px solid #F84242", borderRight: "2px solid #F84242", width: 16, height: 16 },
              { bottom: -1, left: -1, borderBottom: "2px solid #F84242", borderLeft: "2px solid #F84242", width: 16, height: 16 },
              { bottom: -1, right: -1, borderBottom: "2px solid #F84242", borderRight: "2px solid #F84242", width: 16, height: 16 },
            ].map((s, i) => (
              <div key={i} className="absolute" style={{ ...s }} />
            ))}

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <span className="text-[10px] text-white/30 tracking-widest uppercase">// MASCHINA NETWORK</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full hud-blink" style={{ background: "#F84242" }} />
                <span className="text-[10px] tracking-widest" style={{ color: "#F84242" }}>LIVE</span>
              </div>
            </div>

            <div className="border-t border-white/[0.06] mb-6" />

            {/* System readout */}
            <div className="flex flex-col gap-3 mb-6">
              {[
                { label: "NODES ONLINE",  value: "2,841",  unit: "" },
                { label: "JOBS / 24H",    value: "148,302", unit: "" },
                { label: "AVG LATENCY",   value: "38",     unit: "ms" },
                { label: "REGIONS",       value: "12",     unit: "" },
                { label: "UPTIME",        value: "99.9",   unit: "%" },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between">
                  <span className="text-[11px] text-white/25 tracking-widest">{row.label}</span>
                  <span className="text-sm text-white/80">
                    {row.value}<span className="text-white/30">{row.unit}</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Network load bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-white/25 tracking-widest">NETWORK LOAD</span>
                <span className="text-[11px] text-white/50">41%</span>
              </div>
              <div className="h-px bg-white/[0.06] relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 hud-bar" style={{ width: "41%", background: "#F84242", height: "100%" }} />
              </div>
            </div>

            <div className="border-t border-white/[0.06] mb-4" />

            {/* Activity log */}
            <div className="flex flex-col gap-0">
              <div className="text-[10px] text-white/20 tracking-widest mb-3">EXEC LOG</div>
              {[
                { node: "node-sf-02", job: "researcher", time: "2s",  status: "ok"  },
                { node: "node-eu-07", job: "summarizer", time: "5s",  status: "ok"  },
                { node: "node-ap-11", job: "coder",      time: "12s", status: "run" },
                { node: "node-us-03", job: "analyst",    time: "18s", status: "ok"  },
                { node: "node-uk-01", job: "researcher", time: "31s", status: "ok"  },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] text-[11px]">
                  <span className="text-white/20">&gt;</span>
                  <span className="text-white/40 w-24">{row.node}</span>
                  <span className="text-white/60 w-20">{row.job}</span>
                  <span className="text-white/20 ml-auto">{row.time}</span>
                  <span className={row.status === "run" ? "hud-blink" : ""} style={{ color: row.status === "run" ? "#22c55e" : "rgba(255,255,255,0.15)", fontSize: 10 }}>
                    {row.status === "run" ? "RUN" : "OK"}
                  </span>
                </div>
              ))}
            </div>

            {/* Cursor */}
            <div className="mt-4 flex items-center gap-1">
              <span className="text-[11px] text-white/20">&gt;</span>
              <span className="text-[11px] text-white/20 hud-blink">█</span>
            </div>

          </div>
        </div>

        {/* Globe + rays on the right */}
        <div className="absolute top-0 right-0 h-full w-1/2 flex items-center justify-center" style={{ transform: "translateX(-32px)" }}>
          <div className="absolute inset-0 pointer-events-none" style={{ transform: "scaleY(-1)" }}>
            <LightRays
              raysOrigin="top-center"
              raysColor="#ffffff"
              raysSpeed={0.6}
              lightSpread={0.35}
              rayLength={0.6}
              pulsating={false}
              fadeDistance={0}
              saturation={0.15}
              followMouse={false}
              mouseInfluence={0}
              noiseAmount={0}
              distortion={0}
            />
          </div>
          <div className="relative z-10" style={{ maskImage: "radial-gradient(ellipse 55% 50% at 50% 50%, black 35%, transparent 80%)" }}>
            <GlobeVisualization width={800} height={800} />
          </div>
        </div>

        <Noise patternSize={250} patternScaleX={1} patternScaleY={1} patternRefreshInterval={2} patternAlpha={8} />
      </div>

      <Footer />
    </main>
  );
}
