import { useEffect, useRef, useState } from "react";

const TICK_COUNT = 48;

export function ScrollIndicator() {
  const [activeTick, setActiveTick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const doc = document.documentElement;
        const total = doc.scrollHeight - doc.clientHeight;
        const progress = total > 0 ? window.scrollY / total : 0;
        setActiveTick(Math.floor(progress * (TICK_COUNT - 1)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <>
      <Ticks activeTick={activeTick} side="left" />
      <Ticks activeTick={activeTick} side="right" />
    </>
  );
}

function Ticks({ activeTick, side }: { activeTick: number; side: "left" | "right" }) {
  return (
    <div
      className="fixed flex flex-col justify-between pointer-events-none z-[9999]"
      style={{
        top: 64,
        bottom: 0,
        [side]: "calc(5rem - 68px)",
        width: 68,
        alignItems: side === "left" ? "flex-end" : "flex-start",
      }}
    >
      {Array.from({ length: TICK_COUNT }).map((_, i) => {
        const isActive = i === activeTick;
        const dist = Math.abs(i - activeTick);
        const isNear = dist <= 2 && dist > 0;

        return (
          <div
            key={i}
            style={{
              height: 2,
              width: isActive ? 68 : isNear ? 48 : 24,
              borderRadius: 1,
              background: isActive
                ? "#F84242"
                : isNear
                ? `rgba(255,255,255,${0.35 - dist * 0.1})`
                : "rgba(255,255,255,0.12)",
              transform: isActive ? "scaleY(1)" : "scaleY(0.5)",
              transition: "width 0.15s ease, background 0.15s ease",
            }}
          />
        );
      })}
    </div>
  );
}
