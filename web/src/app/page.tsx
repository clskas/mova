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
import { AccountView } from "@/components/AccountView";
import { HelpIcon, ProfileIcon } from "@/components/ServiceIcons";

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
  | "account"
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
    checkGatewayHealth().then((ok) => setMock(!ok && process.env.NODE_ENV !== "production"));
    fetchActivePublicites("PASSENGER").then(setPublicites);
  }, []);

  return (
    <div className="max-w-lg mx-auto min-h-screen flex flex-col overflow-x-hidden">
      <header className="bg-[#1A1A2E] text-white px-3 py-2 sm:p-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="w-10" />
          <div>
            <h1 className="text-base sm:text-xl font-semibold text-center flex items-center justify-center gap-2">
              <img src="/icon-192.png" alt="" width={24} height={24} className="rounded-md sm:w-7 sm:h-7" />
              SENGA — RDC
            </h1>
            <p className="text-[11px] sm:text-sm opacity-80 text-center flex items-center justify-center gap-1">
              <LocationIcon color="#6C63FF" size={12} />
              Kinshasa · Mobilité nationwide
            </p>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setView("account")}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Connexion"
            >
              <ProfileIcon color="#FFFFFF" size={22} />
            </button>
            <button
              type="button"
              onClick={() => setView("help")}
              className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="Aide"
            >
              <HelpIcon color="#FFFFFF" size={22} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 p-2.5 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {mock && (
          <p className="text-center text-xs sm:text-sm text-[#FF6B35] bg-orange-50 rounded-lg py-1.5 mb-2 sm:mb-4">
            Serveur indisponible — mode hors ligne
          </p>
        )}

        {view === "home" && (
          <div className="space-y-2 sm:space-y-4">
            <div>
              <p className="text-sm sm:text-lg font-bold">{greeting()} 👋 <span className="text-[#6C63FF] font-medium">La mobilité, simplement.</span></p>
              <p className="hidden sm:block text-sm text-gray-500">Choisissez un service pour continuer</p>
            </div>

            <PubliciteCarousel items={publicites} />

            <div className="grid grid-cols-4 sm:grid-cols-2 gap-1.5 sm:gap-3">
              <ServiceCard icon={<TaxiIcon color="#6C63FF" />} title="Taxi / Moto-taxi" shortTitle="Taxi" subtitle="Course immédiate" color="#6C63FF" onClick={() => setView("taxi")} />
              <ServiceCard icon={<ParcelIcon color="#00D4A1" />} title="Livraison colis" shortTitle="Colis" subtitle="Envoi sécurisé" color="#00D4A1" onClick={() => setView("parcel")} />
              <ServiceCard icon={<ExpressIcon color="#FF6B35" />} title="Express" shortTitle="Express" subtitle="Livraison prioritaire" color="#FF6B35" onClick={() => setView("express")} />
              <ServiceCard icon={<FoodIcon color="#00D4A1" />} title="Repas" shortTitle="Repas" subtitle="Restaurants locaux" color="#00D4A1" onClick={() => setView("food")} />
              <ServiceCard icon={<MovingIcon color="#6C63FF" />} title="Déménagement" shortTitle="Démén." subtitle="Volume & devis" color="#6C63FF" onClick={() => setView("moving")} />
              <ServiceCard icon={<RentalIcon color="#6C63FF" />} title="Location" shortTitle="Location" subtitle="Véhicules avec chauffeur" color="#6C63FF" onClick={() => setView("rental")} />
              <ServiceCard icon={<ErrandIcon color="#00D4A1" />} title="Commissions" shortTitle="Courses" subtitle="Courses & achats" color="#00D4A1" onClick={() => setView("errands")} />
              <ServiceCard icon={<WalletIcon color="#6C63FF" />} title="Portefeuille" shortTitle="Portef." subtitle="Solde et recharges" color="#6C63FF" onClick={() => setView("wallet")} />
              <ServiceCard icon={<CalendarIcon color="#FF6B35" />} title="Planifiée" shortTitle="Planif." subtitle="Réserver à l'avance" color="#FF6B35" onClick={() => setView("scheduled")} />
              <ServiceCard icon={<CarpoolIcon color="#6C63FF" />} title="Covoiturage" shortTitle="Covoit." subtitle="Partager un trajet" color="#6C63FF" onClick={() => setView("carpool")} />
              <ServiceCard icon={<HistoryIcon color="#FF6B35" />} title="Historique" shortTitle="Histo." subtitle="Vos activités" color="#FF6B35" onClick={() => setView("history")} />
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
        {view === "account" && <AccountView onBack={() => setView("home")} mock={mock} />}
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
