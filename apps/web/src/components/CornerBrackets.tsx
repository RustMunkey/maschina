interface CornerBracketsProps {
  className?: string;
  size?: number;
  thickness?: number;
  color?: string;
}

export function CornerBrackets({
  className = "",
  size = 16,
  thickness = 1.5,
  color = "#F84242",
}: CornerBracketsProps) {
  const style = { position: "absolute" as const, width: size, height: size };
  const line = { background: color, borderRadius: 1, position: "absolute" as const };

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Top-left */}
      <div style={{ ...style, top: 0, left: 0 }}>
        <div style={{ ...line, top: 0, left: 0, width: thickness, height: size }} />
        <div style={{ ...line, top: 0, left: 0, width: size, height: thickness }} />
      </div>
      {/* Top-right */}
      <div style={{ ...style, top: 0, right: 0 }}>
        <div style={{ ...line, top: 0, right: 0, width: thickness, height: size }} />
        <div style={{ ...line, top: 0, right: 0, width: size, height: thickness }} />
      </div>
      {/* Bottom-left */}
      <div style={{ ...style, bottom: 0, left: 0 }}>
        <div style={{ ...line, bottom: 0, left: 0, width: thickness, height: size }} />
        <div style={{ ...line, bottom: 0, left: 0, width: size, height: thickness }} />
      </div>
      {/* Bottom-right */}
      <div style={{ ...style, bottom: 0, right: 0 }}>
        <div style={{ ...line, bottom: 0, right: 0, width: thickness, height: size }} />
        <div style={{ ...line, bottom: 0, right: 0, width: size, height: thickness }} />
      </div>
    </div>
  );
}
