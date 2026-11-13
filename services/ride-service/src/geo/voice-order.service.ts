import { HttpStatus, Injectable } from '@nestjs/common';
import { MovaErrorCode, MovaHttpException } from '@mova/shared';
import { runAiText } from '../common/ai-vision.util';
import { GeoService } from './geo.service';

const VEHICLES = new Set(['MOTO_TAXI', 'TRICYCLE', 'STANDARD', 'COMFORT', 'VIP', 'FAMILIALE']);

type Parsed = {
  understood?: boolean;
  pickup?: string;
  dropoff?: string;
  vehicleType?: string;
  passengerCount?: number;
  clarification?: string;
};

/**
 * Voice ride order: the phone turns speech into text; Claude extracts pickup / destination /
 * vehicle; the places are looked up like a typed search (SENGA base, OpenStreetMap, Mapbox).
 * Nothing is ordered here — the app fills the booking screen and the passenger confirms.
 */
@Injectable()
export class VoiceOrderService {
  constructor(private geo: GeoService) {}

  async parse(body: { text?: string; city?: string; lat?: number; lng?: number }) {
    const text = String(body.text ?? '').trim();
    if (text.length < 3) {
      throw new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Je n’ai rien entendu. Réessayez.');
    }
    const ai = await runAiText('RIDE_VOICE_ORDER', { text: text.slice(0, 400), city: body.city ?? 'Kinshasa' });
    if (!ai.available || !ai.result) {
      return { available: false, transcript: text, message: ai.message ?? 'Commande vocale momentanément indisponible. Tapez votre destination.' };
    }
    const p = ai.result as Parsed;
    const near =
      Number.isFinite(Number(body.lat)) && Number.isFinite(Number(body.lng))
        ? { lat: Number(body.lat), lng: Number(body.lng) }
        : undefined;
    const search = async (q?: string) => {
      const query = String(q ?? '').trim();
      if (!query) return [];
      const rows = await this.geo.autocomplete(query, body.city, near).catch(() => []);
      return (rows as unknown[]).slice(0, 5);
    };
    const [pickupCandidates, dropoffCandidates] = await Promise.all([search(p.pickup), search(p.dropoff)]);
    const vehicleType = VEHICLES.has(String(p.vehicleType ?? '')) ? String(p.vehicleType) : null;
    const passengerCount = Number.isInteger(p.passengerCount) && Number(p.passengerCount) > 0 ? Math.min(8, Number(p.passengerCount)) : null;
    let clarification = String(p.clarification ?? '').trim() || null;
    if (p.understood && String(p.dropoff ?? '').trim() && dropoffCandidates.length === 0) {
      clarification = `Je n’ai pas trouvé « ${String(p.dropoff).trim()} ». Précisez la commune ou un repère proche.`;
    }
    return {
      available: true,
      transcript: text,
      understood: Boolean(p.understood),
      pickupText: String(p.pickup ?? '').trim() || null,
      dropoffText: String(p.dropoff ?? '').trim() || null,
      pickupCandidates,
      dropoffCandidates,
      vehicleType,
      passengerCount,
      clarification,
    };
  }
}
