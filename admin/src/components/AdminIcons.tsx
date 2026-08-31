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

export function FraudIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
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

export function DriversIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </Svg>
  );
}

export function RidesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 17h14l-1.5-4.5H6.5L5 17z" />
      <path d="M7 12.5V9a5 5 0 0110 0v3.5" />
      <circle cx="7.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function RestaurantsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3v8M10 3v8M6 11v10M10 11v10" />
      <path d="M14 7v14M18 3v18" />
    </Svg>
  );
}

export function PricingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v10M9 10h4.5a2 2 0 010 4H9" />
    </Svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </Svg>
  );
}

export function SubscriptionIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 10h8M8 14h5" />
      <path d="M12 3v3" />
    </Svg>
  );
}

export function WalletIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <circle cx="16" cy="14" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function LocationsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 17h14l-1.5-4.5H6.5L5 17z" />
      <path d="M7 12.5V9a5 5 0 0110 0v3.5" />
      <circle cx="7.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="17.5" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function MovingIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="8" width="12" height="10" rx="1" />
      <path d="M15 12h4l2 2v4h-6v-6z" />
      <path d="M7 5v3M11 5v3" />
    </Svg>
  );
}

export function CarpoolIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="9" r="2.5" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 18v-1a4 4 0 014-4h2M21 18v-1a4 4 0 00-4-4h-2" />
      <path d="M10 14h4" />
    </Svg>
  );
}

export function PublicitesIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 6h16v10H4z" />
      <path d="M8 10h8M8 13h5" />
      <path d="M7 4h10" />
    </Svg>
  );
}

export function AccountIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20v-1a5 5 0 015-5h4a5 5 0 015 5v1" />
    </Svg>
  );
}
