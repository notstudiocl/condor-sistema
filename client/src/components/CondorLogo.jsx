export default function CondorLogo({ size = 'lg' }) {
  const sizes = {
    sm: { width: 120, condorSize: 'text-xl', tagSize: 'text-[8px]', lineH: 2 },
    md: { width: 180, condorSize: 'text-3xl', tagSize: 'text-[10px]', lineH: 3 },
    lg: { width: 260, condorSize: 'text-5xl', tagSize: 'text-xs', lineH: 4 },
  };

  const s = sizes[size] || sizes.lg;

  return (
    <div className="flex flex-col items-center" style={{ width: s.width }}>
      <span
        className={`font-heading font-bold tracking-[0.2em] text-white ${s.condorSize} leading-none`}
      >
        CONDOR
      </span>
      <div
        className="w-full bg-accent-600 rounded-full my-1"
        style={{ height: s.lineH }}
      />
      <span
        className={`font-heading font-medium tracking-[0.15em] text-white/90 ${s.tagSize} uppercase`}
      >
        Alcantarillados
      </span>
    </div>
  );
}
