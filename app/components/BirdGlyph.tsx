export default function BirdGlyph({
  view = "front",
  highlight,
  variant,
}: {
  view?: "front" | "left" | "right" | "back";
  highlight?: "left" | "right" | "both" | "unknown";
  variant?: "blurred" | "partial" | "hidden" | "unknown";
}) {
  const front = view === "front",
    back = view === "back";
  return (
    <svg
      viewBox="0 0 100 86"
      aria-hidden="true"
      className={`birdglyph ${variant === "blurred" ? "blurred" : ""}`}
    >
      <rect x="1" y="1" width="98" height="84" rx="9" fill="#edf2e8" />
      <g
        opacity={variant === "hidden" ? 0.18 : 1}
        transform={
          view === "right" ? "translate(100 0) scale(-1 1)" : undefined
        }
      >
        <ellipse cx="50" cy="55" rx="18" ry="25" fill="#268994" />
        <path d="M44 66 L49 83 L56 66" fill="#277c8f" />
        <ellipse
          cx="50"
          cy="53"
          rx="12"
          ry="21"
          fill={back ? "#27858f" : "#e7bd51"}
        />
        <ellipse cx="50" cy="28" rx="19" ry="21" fill="#48a68b" />
        {front ? (
          <>
            <ellipse cx="39" cy="28" rx="8" ry="11" fill="#f9f2db" />
            <ellipse cx="61" cy="28" rx="8" ry="11" fill="#f9f2db" />
            <circle cx="38" cy="27" r="3.5" fill="#203e33" />
            <circle cx="62" cy="27" r="3.5" fill="#203e33" />
            <path d="M47 30 Q50 23 54 30 L52 44 Q46 39 47 30" fill="#25373a" />
            {highlight && (
              <>
                <circle
                  cx="38"
                  cy="27"
                  r="8"
                  fill="none"
                  stroke={
                    highlight === "right" || highlight === "both"
                      ? "#d06a32"
                      : "transparent"
                  }
                  strokeWidth="3"
                />
                <circle
                  cx="62"
                  cy="27"
                  r="8"
                  fill="none"
                  stroke={
                    highlight === "left" || highlight === "both"
                      ? "#d06a32"
                      : "transparent"
                  }
                  strokeWidth="3"
                />
              </>
            )}
          </>
        ) : !back ? (
          <>
            <ellipse cx="58" cy="28" rx="10" ry="12" fill="#f9f2db" />
            <circle cx="61" cy="26" r="3.8" fill="#203e33" />
            <path d="M67 22 Q86 23 77 42 L69 32" fill="#25373a" />
            {highlight && (
              <circle
                cx="61"
                cy="26"
                r="8"
                fill="none"
                stroke="#d06a32"
                strokeWidth="3"
              />
            )}
          </>
        ) : (
          <path
            d="M40 22 Q50 16 60 22"
            fill="none"
            stroke="#27858f"
            strokeWidth="4"
          />
        )}
      </g>
      {variant === "partial" && (
        <>
          <rect x="20" y="57" width="63" height="27" fill="#edf2e8" />
          <path
            d="M20 57 H83"
            stroke="#c57742"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        </>
      )}
      {variant === "hidden" && (
        <path d="M20 18 L80 70" stroke="#a56c53" strokeWidth="3" />
      )}
      {variant === "unknown" && (
        <text x="76" y="35" fontSize="28" fill="#bd7440" fontWeight="bold">
          ?
        </text>
      )}
    </svg>
  );
}
