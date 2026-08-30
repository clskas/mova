type IconProps = { color?: string; size?: number };

const defaults = { color: "currentColor", size: 22 };

function Svg({ children, color, size }: IconProps & { children: React.ReactNode }) {
  const { color: c, size: s } = { ...defaults, color, size };
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke={c} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

export function TaxiIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="10" width="18" height="8" rx="2" />
      <path d="M5 10l2-4h10l2 4" />
      <circle cx="7.5" cy="18" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
      <circle cx="16.5" cy="18" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function ParcelIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
    </Svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M9 14l2 2 4-4" />
    </Svg>
  );
}

export function FoodIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3v8a3 3 0 006 0V3" />
      <path d="M9 11v10" />
      <path d="M18 3v18" />
    </Svg>
  );
}

export function ErrandIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 7h14l-1.5 9H8.5L7 7z" />
      <path d="M7 7L6 3H3" />
      <circle cx="10" cy="20" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
      <circle cx="18" cy="20" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function CarpoolIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M4 20v-1a4 4 0 014-4h8a4 4 0 014 4v1" />
    </Svg>
  );
}

export function LocationIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s6-5.2 6-10a6 6 0 10-12 0c0 4.8 6 10 6 10z" />
      <circle cx="12" cy="11" r="2" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19v-1a5 5 0 015-5h4a5 5 0 015 5v1" />
    </Svg>
  );
}

export function HelpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 014.8 1c0 1.5-2.3 1.7-2.3 3.5" />
      <circle cx="12" cy="17" r="0.75" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function ExpressIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </Svg>
  );
}

export function MovingIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="8" width="15" height="10" rx="1" />
      <path d="M17 11h3l2 4v3h-5v-7z" />
      <circle cx="7" cy="18" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
      <circle cx="18" cy="18" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}

export function RentalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 17h14M7 17l-1-5h12l-1 5" />
      <path d="M7 12l2-5h6l2 5" />
      <circle cx="8" cy="17" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
      <circle cx="16" cy="17" r="1.5" fill={props.color ?? defaults.color} stroke="none" />
    </Svg>
  );
}
