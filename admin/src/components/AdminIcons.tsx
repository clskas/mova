type IconProps = { className?: string };

function Svg({ children, className }: IconProps & { children: React.ReactNode }) {
  return (
    <svg className={className ?? "w-4 h-4"} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export function MetricsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V11M12 16V7M16 16v-4" />
    </Svg>
  );
}

export function UsersIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20v-1a5 5 0 015-5h2a5 5 0 015 5v1" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15 20v-1a3.5 3.5 0 013.5-3.5" />
    </Svg>
  );
}

export function KycIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 16h8" />
    </Svg>
  );
}

export function IncidentsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 9v5" />
      <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function DeliveriesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 7h11v10H3z" />
      <path d="M14 10h4l3 3v4h-7V10z" />
      <circle cx="7.5" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="18.5" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}
