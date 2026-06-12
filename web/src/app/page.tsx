"use client";

import { useEffect, useState } from "react";
import { checkGatewayHealth } from "@/lib/api";
import { ServiceCard } from "@/components/ServiceCard";
import {
  FoodIcon,
  HistoryIcon,
  LocationIcon,
  ParcelIcon,
  TaxiIcon,
} from "@/components/ServiceIcons";
import { TaxiBooking } from "@/components/TaxiBooking";
import { ParcelDelivery } from "@/components/ParcelDelivery";
import { FoodOrder } from "@/components/FoodOrder";
import { HistoryView } from "@/components/HistoryView";

type View = "home" | "taxi" | "parcel" | "food" | "history";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function Home() {
  const [view, setView] = useState<View>("home");
  const [mock, setMock] = useState(false);

  useEffect(() => {
    checkGatewayHealth().then((ok) => setMock(!ok));
  }, []);

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      <header className="bg-[#1A1A2E] text-white p-4">
        <h1 className="text-xl font-semibold text-center flex items-center justify-center gap-2">
          <img src="/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
          MOVA — RDC
        </h1>
        <p className="text-sm opacity-80 text-center flex items-center justify-center gap-1">
          <LocationIcon color="#6C63FF" size={14} />
          Kinshasa · Mobilité nationwide
        </p>
      </header>

      <main className="flex-1 p-4">
        {mock && view === "home" && (
          <p className="text-center text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-2 mb-4">
            Mode démo — passerelle indisponible
          </p>
        )}

        {view === "home" && (
          <div className="space-y-4">
            <div>
              <p className="text-lg font-bold">{greeting()} 👋</p>
              <p className="text-[#6C63FF] font-medium">La mobilité, simplement.</p>
              <p className="text-sm text-gray-500">Choisissez un service pour continuer</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <ServiceCard
                icon={<TaxiIcon color="#6C63FF" />}
                title="Taxi / Moto-taxi"
                subtitle="Course immédiate partout en ville"
                color="#6C63FF"
                onClick={() => setView("taxi")}
              />
              <ServiceCard
                icon={<ParcelIcon color="#00D4A1" />}
                title="Livraison colis"
                subtitle="Envoyez un colis en toute sécurité"
                color="#00D4A1"
                onClick={() => setView("parcel")}
              />
              <ServiceCard
                icon={<FoodIcon color="#00D4A1" />}
                title="Livraison repas"
                subtitle="Restaurants et plats locaux"
                color="#00D4A1"
                onClick={() => setView("food")}
              />
              <ServiceCard
                icon={<HistoryIcon color="#FF6B35" />}
                title="Historique"
                subtitle="Vos courses et livraisons"
                color="#FF6B35"
                onClick={() => setView("history")}
              />
            </div>
          </div>
        )}

        {view === "taxi" && <TaxiBooking onBack={() => setView("home")} mock={mock} />}
        {view === "parcel" && <ParcelDelivery onBack={() => setView("home")} mock={mock} />}
        {view === "food" && <FoodOrder onBack={() => setView("home")} mock={mock} />}
        {view === "history" && <HistoryView onBack={() => setView("home")} />}
      </main>
    </div>
  );
}
