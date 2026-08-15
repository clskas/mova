import type { ReactNode } from "react";

type ServiceCardProps = {
  icon: ReactNode;
  title: string;
  shortTitle?: string;
  subtitle: string;
  color: string;
  onClick: () => void;
  comingSoon?: boolean;
};

export function ServiceCard({ icon, title, shortTitle, subtitle, color, onClick, comingSoon }: ServiceCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={comingSoon}
      aria-label={title}
      className="bg-white rounded-xl p-1.5 sm:p-4 shadow-sm text-center sm:text-left w-full disabled:opacity-60 hover:shadow-md transition-shadow min-h-11 sm:min-h-0 flex flex-col items-center sm:items-start"
    >
      <div
        className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center mb-0.5 sm:mb-2"
        style={{ backgroundColor: `${color}20`, color }}
      >
        {icon}
      </div>
      <p className="font-semibold text-[10px] sm:text-sm leading-tight sm:hidden">{shortTitle ?? title}</p>
      <p className="hidden sm:block font-semibold text-sm leading-tight">{title}</p>
      <p className="hidden sm:block text-xs text-gray-500 mt-1 line-clamp-2">{subtitle}</p>
      {comingSoon && (
        <span className="inline-block mt-1 text-[10px] sm:text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Bientôt</span>
      )}
    </button>
  );
}
