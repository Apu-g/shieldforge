export function MiniDotBars({
  heights = [30, 45, 60, 40, 75, 90],
  variant = "cyan",
}: {
  heights?: number[];
  variant?: "cyan" | "indigo" | "amber" | "green" | "purple";
}) {
  const colorMap = {
    cyan: "var(--accent, #22d3ee)",
    indigo: "#818cf8",
    amber: "var(--amber, #f59e0b)",
    green: "var(--green, #34d399)",
    purple: "#c084fc",
  };

  const activeColor = colorMap[variant] || colorMap.cyan;

  return (
    <div className="mini-dot-bars" aria-hidden="true">
      {heights.map((h, i) => (
        <div key={i} className="mini-dot-col">
          <div
            className="mini-dot-fill"
            style={{
              height: `${Math.max(15, Math.min(100, h))}%`,
              background: `linear-gradient(180deg, ${activeColor}, rgba(34, 211, 238, 0.2))`,
              boxShadow: i === heights.length - 1 ? `0 0 8px ${activeColor}` : "none",
            }}
          />
        </div>
      ))}
    </div>
  );
}
