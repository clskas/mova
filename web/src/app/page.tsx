"use client";

import { useEffect, useState } from "react";
import { checkGatewayHealth, fetchActivePublicites, type Publicite } from "@/lib/api";
import { OtpGate } from "@/components/OtpGate";
import { PubliciteCarousel } from "@/components/PubliciteCarousel";
import { ServiceCard } from "@/components/ServiceCard";
import {
  CalendarIcon,
  CarpoolIcon,
  ErrandIcon,
  ExpressIcon,
  FoodIcon,
  HistoryIcon,
  LocationIcon,
  MovingIcon,
  ParcelIcon,
  RentalIcon,
  TaxiIcon,
  WalletIcon,
} from "@/components/ServiceIcons";
import { TaxiBooking } from "@/components/TaxiBooking";
import { ParcelDelivery } from "@/components/ParcelDelivery";
import { ExpressDelivery } from "@/components/ExpressDelivery";
import { FoodOrder } from "@/components/FoodOrder";
import { MovingView } from "@/components/MovingView";
import { RentalView } from "@/components/RentalView";
import { ErrandsView } from "@/components/ErrandsView";
import { HistoryView } from "@/components/HistoryView";
import { ReceiptView } from "@/components/ReceiptView";
import { ReceiptsListView } from "@/components/ReceiptsListView";
import { HelpView } from "@/components/HelpView";
import { WalletView } from "@/components/WalletView";
import { ScheduledRidesView } from "@/components/ScheduledRidesView";
import { CarpoolView } from "@/components/CarpoolView";
import { HelpIcon } from "@/components/ServiceIcons";

type View =
  | "home"
  | "taxi"
  | "parcel"
  | "express"
  | "food"
  | "moving"
  | "rental"
  | "errands"
  | "history"
  | "receipts"
  | "receipt"
  | "help"
  | "wallet"
  | "scheduled"
  | "carpool";

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function HomeContent() {
  const [view, setView] = useState<View>("home");
  const [mock, setMock] = useState(false);
  const [receiptRef, setReceiptRef] = useState<{ type: string; id: string } | null>(null);
  const [publicites, setPublicites] = useState<Publicite[]>([]);

  const openReceipt = (type: string, id: string) => {
    setReceiptRef({ type, id });
    setView("receipt");
  };

  useEffect(() => {
    checkGatewayHealth().then((ok) => setMock(!ok));
    fetchActivePublicites("PASSENGER").then(setPublicites);
  }, []);

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col">
      <header className="bg-[#1A1A2E] text-white p-3 sm:p-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="w-10" />
          <div>
            <h1 className="text-xl font-semibold text-center flex items-center justify-center gap-2">
              <img src="/icon-192.png" alt="" width={28} height={28} className="rounded-md" />
              SENGA — RDC
            </h1>
            <p className="text-sm opacity-80 text-center flex items-center justify-center gap-1">
              <LocationIcon color="#6C63FF" size={14} />
              Kinshasa · Mobilité nationwide
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView("help")}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="Aide"
          >
            <HelpIcon color="#FFFFFF" size={22} />
          </button>
        </div>
      </header>

      <main className="flex-1 p-3 sm:p-4">
        {mock && (
          <p className="text-center text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-2 mb-3 sm:mb-4">
            Serveur indisponible — mode hors ligne
          </p>
        )}

        {view === "home" && (
          <div className="space-y-3 sm:space-y-4">
            <div>
              <p className="text-base sm:text-lg font-bold">{greeting()} 👋</p>
              <p className="text-[#6C63FF] font-medium text-sm sm:text-base">La mobilité, simplement.</p>
              <p className="text-xs sm:text-sm text-gray-500">Choisissez un service pour continuer</p>
            </div>

            <PubliciteCarousel items={publicites} />

            <div className="grid grid-cols-3 sm:grid-cols-2 gap-2 sm:gap-3">
              <ServiceCard icon={<TaxiIcon color="#6C63FF" />} title="Taxi / Moto-taxi" subtitle="Course immédiate" color="#6C63FF" onClick={() => setView("taxi")} />
              <ServiceCard icon={<ParcelIcon color="#00D4A1" />} title="Livraison colis" subtitle="Envoi sécurisé" color="#00D4A1" onClick={() => setView("parcel")} />
              <ServiceCard icon={<ExpressIcon color="#FF6B35" />} title="Express" subtitle="Livraison prioritaire" color="#FF6B35" onClick={() => setView("express")} />
              <ServiceCard icon={<FoodIcon color="#00D4A1" />} title="Repas" subtitle="Restaurants locaux" color="#00D4A1" onClick={() => setView("food")} />
              <ServiceCard icon={<MovingIcon color="#6C63FF" />} title="Déménagement" subtitle="Volume & devis" color="#6C63FF" onClick={() => setView("moving")} />
              <ServiceCard icon={<RentalIcon color="#6C63FF" />} title="Location" subtitle="Véhicules avec chauffeur" color="#6C63FF" onClick={() => setView("rental")} />
              <ServiceCard icon={<ErrandIcon color="#00D4A1" />} title="Commissions" subtitle="Courses & achats" color="#00D4A1" onClick={() => setView("errands")} />
              <ServiceCard icon={<WalletIcon color="#6C63FF" />} title="Portefeuille" subtitle="Solde et recharges" color="#6C63FF" onClick={() => setView("wallet")} />
              <ServiceCard icon={<CalendarIcon color="#FF6B35" />} title="Planifiée" subtitle="Réserver à l'avance" color="#FF6B35" onClick={() => setView("scheduled")} />
              <ServiceCard icon={<CarpoolIcon color="#6C63FF" />} title="Covoiturage" subtitle="Partager un trajet" color="#6C63FF" onClick={() => setView("carpool")} />
              <ServiceCard icon={<HistoryIcon color="#FF6B35" />} title="Historique" subtitle="Vos activités" color="#FF6B35" onClick={() => setView("history")} />
            </div>
          </div>
        )}

        {view === "taxi" && <TaxiBooking onBack={() => setView("home")} mock={mock} />}
        {view === "parcel" && <ParcelDelivery onBack={() => setView("home")} mock={mock} />}
        {view === "express" && <ExpressDelivery onBack={() => setView("home")} mock={mock} />}
        {view === "food" && <FoodOrder onBack={() => setView("home")} mock={mock} />}
        {view === "moving" && <MovingView onBack={() => setView("home")} mock={mock} />}
        {view === "rental" && <RentalView onBack={() => setView("home")} mock={mock} />}
        {view === "errands" && <ErrandsView onBack={() => setView("home")} mock={mock} />}
        {view === "wallet" && <WalletView onBack={() => setView("home")} mock={mock} />}
        {view === "scheduled" && <ScheduledRidesView onBack={() => setView("home")} mock={mock} />}
        {view === "carpool" && <CarpoolView onBack={() => setView("home")} mock={mock} />}
        {view === "history" && (
          <HistoryView
            onBack={() => setView("home")}
            onOpenReceipts={() => setView("receipts")}
            onOpenReceipt={openReceipt}
            mock={mock}
          />
        )}
        {view === "receipts" && (
          <ReceiptsListView onBack={() => setView("history")} onOpenReceipt={openReceipt} />
        )}
        {view === "receipt" && receiptRef && (
          <ReceiptView
            referenceType={receiptRef.type}
            referenceId={receiptRef.id}
            onBack={() => setView("receipts")}
          />
        )}
        {view === "help" && <HelpView onBack={() => setView("home")} />}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <OtpGate>
      <HomeContent />
    </OtpGate>
  );
}
