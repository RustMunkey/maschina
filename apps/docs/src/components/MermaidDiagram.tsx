import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "#0f0f0f",
    primaryColor: "#1a1a1a",
    primaryBorderColor: "#B83232",
    primaryTextColor: "#ffffff",
    lineColor: "rgba(255,255,255,0.25)",
    edgeLabelBackground: "#0f0f0f",
    nodeTextColor: "#ffffff",
    fontSize: "13px",
  },
  fontFamily: "SohneMono, monospace",
  flowchart: { curve: "basis", padding: 20 },
});

let counter = 0;

export function MermaidDiagram({ code }: { code: string }) {
  const id = useRef(`mermaid-${++counter}`);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    mermaid.render(id.current, code.trim())
      .then(({ svg }) => setSvg(svg))
      .catch((e) => setError(String(e)));
  }, [code]);

  if (error) return (
    <pre className="text-red-400/70 text-xs p-4 bg-white/[0.03] rounded-xl border border-white/6 mb-6">{error}</pre>
  );

  if (!svg) return null;

  return (
    <div
      className="mb-6 rounded-xl overflow-hidden border border-white/6 bg-[#0f0f0f] p-6 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
