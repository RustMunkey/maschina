import { useEffect, useRef, useState, type CSSProperties } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function rand() {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

interface ScrambleTextProps {
  text: string;
  className?: string;
  style?: CSSProperties;
  speed?: number;
  delay?: number;
}

export function ScrambleText({ text, className = "", style, speed = 60, delay = 0 }: ScrambleTextProps) {
  const [display, setDisplay] = useState<string[]>(() =>
    text.split("").map((c) => (c === " " ? " " : rand()))
  );
  const rafRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const spanRef = useRef<HTMLSpanElement>(null);

  function runScramble() {
    cancelAnimationFrame(rafRef.current);
    clearTimeout(timeoutRef.current);

    const chars = text.split("");
    let started = false;
    let startTime = 0;

    const tick = (now: number) => {
      if (!started) {
        startTime = now;
        started = true;
      }
      const elapsed = now - startTime;
      const locked = Math.floor(elapsed / speed);

      setDisplay(
        chars.map((c, i) => {
          if (c === " ") return " ";
          if (i < locked) return c;
          return rand();
        })
      );

      if (locked < chars.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(chars);
      }
    };

    timeoutRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, delay);
  }

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runScramble();
          } else {
            // reset to scrambled so it replays on re-entry
            cancelAnimationFrame(rafRef.current);
            clearTimeout(timeoutRef.current);
            setDisplay(text.split("").map((c) => (c === " " ? " " : rand())));
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [text, speed, delay]);

  return (
    <span ref={spanRef} className={className} style={style}>
      [{" "}{display.join("")}{" "}]
    </span>
  );
}
