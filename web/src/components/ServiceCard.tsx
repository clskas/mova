import type { ReactNode } from "react";

type ServiceCardProps = {
  icon: ReactNode;
  title: string;
  subtitle: string;
  color: string;
  onClick: () => void;
  comingSoon?: boolean;
};

export function ServiceCard({ icon, title, subtitle, color, onClick, comingSoon }: ServiceCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      className="bg-white rounded-xl p-2.5 sm:p-4 shadow-sm text-left w-full disabled:opacity-60 hover:shadow-md transition-shadow min-h-0"
    >
      <div
        className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-1 sm:mb-2"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <p className="font-semibold text-[11px] sm:text-sm leading-tight">{title}</p>
      <p className="hidden sm:block text-xs text-gray-500 mt-1 line-clamp-2">{subtitle}</p>
      {comingSoon && (
        <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Bientôt</span>
      )}
    </button>
  );
}
