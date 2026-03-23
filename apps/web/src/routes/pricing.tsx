import { useState, useRef, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "../components/Footer";
import { ScrambleText } from "../components/ScrambleText";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
});

const MONTHLY = { access: 0, m1: 20, m5: 60, m10: 100, teams: 30 };
const ANNUAL_DISCOUNT = 0.2;

const CARD_BG = { background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.07) 0%, transparent 100%), rgba(255,255,255,0.02)" };

function annualPrice(monthly: number) {
  return Math.round(monthly * (1 - ANNUAL_DISCOUNT));
}

function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const monthlyRef = useRef<HTMLButtonElement>(null);
  const annualRef = useRef<HTMLButtonElement>(null);
  const [pillStyle, setPillStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const btn = annual ? annualRef.current : monthlyRef.current;
    if (!btn) return;
    const parent = btn.parentElement!;
    const parentRect = parent.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPillStyle({ left: btnRect.left - parentRect.left, width: btnRect.width });
  }, [annual]);

  // init pill on mount without transition
  useEffect(() => {
    const btn = monthlyRef.current;
    if (!btn) return;
    const parent = btn.parentElement!;
    const parentRect = parent.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    setPillStyle({ left: btnRect.left - parentRect.left, width: btnRect.width });
  }, []);

  const p = annual
    ? { m1: annualPrice(MONTHLY.m1), m5: annualPrice(MONTHLY.m5), m10: annualPrice(MONTHLY.m10), teams: annualPrice(MONTHLY.teams) }
    : { m1: MONTHLY.m1, m5: MONTHLY.m5, m10: MONTHLY.m10, teams: MONTHLY.teams };

  return (
    <main className="pt-16 overflow-x-hidden">
      {/* Hero */}
      <div className="px-28 pt-20 pb-16 text-center">
        <ScrambleText text="PRICING" className="text-xs text-white/30 tracking-widest uppercase mb-4 block" />
        <h1 className="text-4xl font-bold tracking-tight text-white mb-4">
          Simple, transparent pricing.
        </h1>
        <p className="text-base text-white/40 max-w-md mx-auto mb-8">
          Start free. Scale as you grow. No hidden fees.
        </p>

        {/* Toggle */}
        <div className="relative inline-flex items-center gap-3 border border-white/10 rounded-full p-1">
          {/* morphing pill */}
          <div
            className="absolute top-1 bottom-1 rounded-full bg-white pointer-events-none"
            style={{
              left: pillStyle.left || 4,
              width: pillStyle.width || 0,
              transition: "left 280ms cubic-bezier(0.4,0,0.2,1), width 280ms cubic-bezier(0.4,0,0.2,1)",
            }}
          />
          <button
            ref={monthlyRef}
            onClick={() => setAnnual(false)}
            className={`relative z-10 text-xs px-4 py-1.5 rounded-full transition-colors duration-250 ${!annual ? "text-black font-medium" : "text-white/40 hover:text-white/70"}`}
          >
            Monthly
          </button>
          <button
            ref={annualRef}
            onClick={() => setAnnual(true)}
            className={`relative z-10 text-xs px-4 py-1.5 rounded-full transition-colors duration-250 flex items-center gap-2 ${annual ? "text-black font-medium" : "text-white/40 hover:text-white/70"}`}
          >
            Annual
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${annual ? "bg-black/10 text-black" : "bg-white/10 text-white/50"}`}>
              −20%
            </span>
          </button>
        </div>
      </div>

      {/* Bento grid */}
      <div className="px-28 pb-24">
        <div className="grid grid-cols-4 gap-3 auto-rows-[minmax(220px,auto)]">

          {/* Access — col 1, row 1 */}
          <div className="col-span-1 rounded-xl border border-white/[0.08] p-6 flex flex-col justify-between" style={CARD_BG}>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Access</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-2xl font-bold text-white">Free</span>
              </div>
              <p className="text-xs text-white/40">Get started with the network.</p>
            </div>
            <div>
              <ul className="flex flex-col gap-2 mb-5">
                {["Ollama models only", "5 agent runs / day", "Community support"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/50">
                    <span className="text-white/20">—</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/download" className="block text-center text-xs py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
                Get Started
              </a>
            </div>
          </div>

          {/* M1 — col 2, row 1 */}
          <div className="col-span-1 rounded-xl border border-white/[0.08] p-6 flex flex-col justify-between" style={CARD_BG}>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">M1</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-2xl font-bold text-white">${p.m1}</span>
                <span className="text-xs text-white/30 mb-0.5">/ mo</span>
              </div>
              <p className="text-xs text-white/40">For individuals exploring agentic workflows.</p>
            </div>
            <div>
              <ul className="flex flex-col gap-2 mb-5">
                {["Claude Haiku + GPT-4o Mini", "100 agent runs / day", "Email support", "Marketplace publishing"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/50">
                    <span className="text-white/20">—</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/download" className="block text-center text-xs py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
                Get Started
              </a>
            </div>
          </div>

          {/* M5 — col 3-4, row 1-2 (featured, tall) */}
          <div
            className="col-span-2 row-span-2 relative rounded-xl border p-8 flex flex-col justify-between"
            style={{ borderColor: "#F84242", background: "radial-gradient(ellipse 100% 35% at bottom center, rgba(248,66,66,0.1) 0%, transparent 100%), rgba(255,255,255,0.02)" }}
          >
            <div className="absolute -top-px left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-b-md text-[10px] font-semibold tracking-widest uppercase" style={{ background: "#F84242", color: "#fff" }}>
              Most Popular
            </div>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">M5</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-4xl font-bold text-white">${p.m5}</span>
                <span className="text-sm text-white/30 mb-1">/ mo</span>
              </div>
              {annual && (
                <p className="text-xs text-white/30 mb-1">Billed annually · Save ${(MONTHLY.m5 - p.m5) * 12}/yr</p>
              )}
              <p className="text-sm text-white/40 mb-8">For builders running production agents.</p>
              <ul className="flex flex-col gap-3">
                {[
                  "Claude Sonnet + GPT-4o",
                  "500 agent runs / day",
                  "Priority support",
                  "Advanced analytics",
                  "Webhook integrations",
                  "Custom agent config",
                  "Audit logs",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/60">
                    <span style={{ color: "#F84242" }}>—</span>{f}
                  </li>
                ))}
              </ul>
            </div>
            <a href="/download" className="block text-center text-sm py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition-colors">
              Get Started
            </a>
          </div>

          {/* M10 — col 1, row 2 */}
          <div className="col-span-1 rounded-xl border border-white/[0.08] p-6 flex flex-col justify-between" style={CARD_BG}>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">M10</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-2xl font-bold text-white">${p.m10}</span>
                <span className="text-xs text-white/30 mb-0.5">/ mo</span>
              </div>
              <p className="text-xs text-white/40">For power users who need full throughput.</p>
            </div>
            <div>
              <ul className="flex flex-col gap-2 mb-5">
                {["Claude Opus + GPT-4o", "Unlimited runs", "SLA guarantee", "Audit logs"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/50">
                    <span className="text-white/20">—</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/download" className="block text-center text-xs py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
                Get Started
              </a>
            </div>
          </div>

          {/* Teams — col 2, row 2 */}
          <div className="col-span-1 rounded-xl border border-white/[0.08] p-6 flex flex-col justify-between" style={CARD_BG}>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-4">Teams</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-2xl font-bold text-white">${p.teams}</span>
                <span className="text-xs text-white/30 mb-0.5">/ seat / mo</span>
              </div>
              <p className="text-xs text-white/40">Built for collaborative teams.</p>
            </div>
            <div>
              <ul className="flex flex-col gap-2 mb-5">
                {["Everything in M10", "Team workspace", "Role-based access", "Shared agents"].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-white/50">
                    <span className="text-white/20">—</span>{f}
                  </li>
                ))}
              </ul>
              <a href="/download" className="block text-center text-xs py-2 rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors">
                Get Started
              </a>
            </div>
          </div>

          {/* Enterprise — full width, row 3 */}
          <div className="col-span-4 rounded-xl border border-white/[0.08] px-10 py-8 flex items-center justify-between" style={CARD_BG}>
            <div>
              <p className="text-xs text-white/30 uppercase tracking-widest mb-2">Enterprise</p>
              <h3 className="text-xl font-bold text-white mb-1">Custom pricing for large teams.</h3>
              <p className="text-sm text-white/40">On-premise deployment, SSO, custom SLA, dedicated infrastructure, and volume discounts.</p>
            </div>
            <a href="/contact" className="shrink-0 ml-16 text-sm px-8 py-3 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/20 transition-colors">
              Contact Us
            </a>
          </div>

        </div>
      </div>

      <Footer />
    </main>
  );
}
