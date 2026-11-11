interface LyricsDotsProps {
  animated?: boolean;
  className?: string;
}

/** The "•••" interlude marker, optionally bouncing like the sidebar lyrics. */
export function LyricsDots({ animated = false, className = "" }: LyricsDotsProps) {
  if (!animated) {
    return <span className={className}>•••</span>;
  }

  return (
    <span className={`inline-flex ${className}`}>
      {"•••".split("").map((dot, index) => (
        <span
          key={index}
          className="lyric-dot-anim"
          style={{ animationDelay: `${index * 0.2}s` }}
        >
          {dot}
        </span>
      ))}
    </span>
  );
}
