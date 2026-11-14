import { Injectable, Logger } from '@nestjs/common';
import { INTERNAL_API_KEY, RedisService, serviceUrl, ussdSteps } from '@mova/shared';
import { VehicleType } from '@prisma/client';
import { GeoService } from '../geo/geo.service';
import { PlatformConfigService } from '../platform/platform-config.service';
import { RidesService } from '../rides/rides.service';

type Place = { label: string; lat: number; lng: number };
const VEHICLES: Record<string, { type: VehicleType; label: string }> = {
  '1': { type: VehicleType.MOTO_TAXI, label: 'Moto-taxi' },
  '2': { type: VehicleType.STANDARD, label: 'Taxi' },
};

/**
 * Booking without the app (Automatisations → Réservation USSD / WhatsApp).
 * Steps: vehicle → pickup → destination → confirm. Payment in cash; status by SMS.
 */
@Injectable()
export class TextBookingService {
  private readonly logger = new Logger(TextBookingService.name);

  constructor(
    private geo: GeoService,
    private rides: RidesService,
    private platformConfig: PlatformConfigService,
    private redis: RedisService,
  ) {}

  private async firstPlace(q: string): Promise<Place | null> {
    const rows = (await this.geo.autocomplete(q, undefined, undefined).catch(() => [])) as Array<Partial<Place>>;
    const r = rows.find((x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lng) && x.label);
    return r ? { label: String(r.label), lat: Number(r.lat), lng: Number(r.lng) } : null;
  }

  private async passengerId(phone: string): Promise<string | null> {
    try {
      const res = await fetch(serviceUrl('auth', '/internal/users/ensure-passenger'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-api-key': INTERNAL_API_KEY },
        body: JSON.stringify({ phone }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return null;
      const u = (await res.json()) as { id?: string; active?: boolean };
      return u.active ? (u.id ?? null) : null;
    } catch {
      return null;
    }
  }

  private async book(phone: string, vehicle: VehicleType, pickup: Place, dropoff: Place, via: 'USSD' | 'WHATSAPP') {
    const pid = await this.passengerId(phone);
    if (!pid) return 'Compte introuvable ou suspendu. Appelez le service client SENGA.';
    try {
      const ride = (await this.rides.createRide(pid, {
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        pickupAddress: pickup.label,
        dropoffLat: dropoff.lat,
        dropoffLng: dropoff.lng,
        dropoffAddress: dropoff.label,
        vehicleType: vehicle,
        bookedVia: via,
      })) as { id: string; estimatedFareCdf?: number | null };
      await this.rides.searchDrivers(ride.id, pid);
      return `Course demandée (${ride.estimatedFareCdf ?? '?'} FC, espèces). Vous recevrez un SMS dès qu'un chauffeur accepte.`;
    } catch (e) {
      const msg = (e as { message?: string })?.message;
      return msg && msg.length < 140 ? msg : 'Impossible de commander maintenant. Réessayez.';
    }
  }

  private async quote(vehicle: VehicleType, pickup: Place, dropoff: Place): Promise<number | null> {
    try {
      const est = (await this.rides.estimate(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, vehicle)) as { totalCdf?: number };
      return est.totalCdf ?? null;
    } catch {
      return null;
    }
  }

  /** USSD: stateless, the aggregator sends the whole input « 1*Gombe*Limete*1 ». */
  async ussd(phone: string, text: string): Promise<string> {
    if (!this.platformConfig.get().automations.ussdBooking.enabled) return 'END SENGA : service USSD indisponible.';
    const s = ussdSteps(text);
    if (s.length === 0) return 'CON SENGA - Commander\n1. Moto-taxi\n2. Taxi';
    const v = VEHICLES[s[0]];
    if (!v) return 'END Choix invalide.';
    if (s.length === 1) return 'CON Lieu de départ (quartier, avenue, repère) :';
    if (s.length === 2) return 'CON Destination :';
    const pickup = await this.firstPlace(s[1]);
    if (!pickup) return 'END Lieu de départ introuvable. Précisez la commune ou un repère.';
    const dropoff = await this.firstPlace(s[2]);
    if (!dropoff) return 'END Destination introuvable. Précisez la commune ou un repère.';
    if (s.length === 3) {
      const price = await this.quote(v.type, pickup, dropoff);
      return `CON ${v.label} : ${pickup.label.slice(0, 40)} -> ${dropoff.label.slice(0, 40)}\nPrix : ${price ?? '?'} FC (espèces)\n1. Confirmer\n2. Annuler`;
    }
    if (s[3] !== '1') return 'END Commande annulée.';
    return `END ${await this.book(phone, v.type, pickup, dropoff, 'USSD')}`;
  }

  /** WhatsApp: same steps, the state kept 15 minutes in Redis. */
  async whatsapp(phone: string, message: string): Promise<string> {
    if (!this.platformConfig.get().automations.whatsappBooking.enabled) return 'SENGA : la réservation par WhatsApp est momentanément indisponible.';
    const key = `wa:booking:${phone}`;
    const text = String(message ?? '').trim();
    const raw = await this.redis.client.get(key).catch(() => null);
    const st = (raw ? JSON.parse(String(raw)) : {}) as { step?: string; v?: string; pickup?: Place; dropoff?: Place };
    const save = (next: object) => this.redis.client.setex(key, 15 * 60, JSON.stringify(next));
    const reset = () => this.redis.client.del(key).catch(() => undefined);
    if (/^(annuler|stop|0)$/i.test(text)) {
      await reset();
      return 'Commande annulée. Écrivez « course » pour recommencer.';
    }
    if (!st.step) {
      await save({ step: 'vehicle' });
      return 'Bonjour, ici SENGA. Quel véhicule ?\n1. Moto-taxi\n2. Taxi\n(0 pour annuler)';
    }
    if (st.step === 'vehicle') {
      if (!VEHICLES[text]) return 'Répondez 1 (Moto-taxi) ou 2 (Taxi).';
      await save({ step: 'pickup', v: text });
      return 'Lieu de départ ? (quartier, avenue, repère)';
    }
    if (st.step === 'pickup') {
      const pickup = await this.firstPlace(text);
      if (!pickup) return 'Je ne trouve pas ce lieu. Précisez la commune ou un repère.';
      await save({ ...st, step: 'dropoff', pickup });
      return `Départ : ${pickup.label}\nDestination ?`;
    }
    if (st.step === 'dropoff') {
      const dropoff = await this.firstPlace(text);
      if (!dropoff) return 'Je ne trouve pas ce lieu. Précisez la commune ou un repère.';
      const v = VEHICLES[st.v ?? '1'];
      const price = await this.quote(v.type, st.pickup!, dropoff);
      await save({ ...st, step: 'confirm', dropoff });
      return `${v.label} : ${st.pickup!.label} → ${dropoff.label}\nPrix : ${price ?? '?'} FC (espèces)\n1. Confirmer\n2. Annuler`;
    }
    if (st.step === 'confirm') {
      await reset();
      if (text !== '1') return 'Commande annulée. Écrivez « course » pour recommencer.';
      return this.book(phone, VEHICLES[st.v ?? '1'].type, st.pickup!, st.dropoff!, 'WHATSAPP');
    }
    await reset();
    return 'Écrivez « course » pour commander.';
  }
}
