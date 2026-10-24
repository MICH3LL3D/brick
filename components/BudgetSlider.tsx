const MIN = 50;
const MAX = 500;

export function BudgetSlider({ id, value, onChange, width = 120 }: { id?: string; value: number; onChange: (v: number) => void; width?: number }) {
  return (
    <input
      id={id}
      type="range"
      min={MIN}
      max={MAX}
      step={10}
      value={value}
      style={{ width, "--fill": `${((value - MIN) / (MAX - MIN)) * 100}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label="Budget in US dollars"
    />
  );
}
