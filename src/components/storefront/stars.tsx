type Props = { value: number; className?: string };

export function Stars({ value, className = "" }: Props) {
  const filled = Math.round(value);
  return (
    <span className={`inline-flex tracking-[2px] ${className}`} aria-label={`Rating ${value} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} aria-hidden className={i <= filled ? "text-olive" : "text-olive/25"}>
          ★
        </span>
      ))}
    </span>
  );
}
