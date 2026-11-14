import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { fetchAutomations, kinshasaClock, MovaErrorCode, MovaHttpException, postStaffAlert } from '@mova/shared';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ocr/ocr.service';
import { claudeAvailable, claudeJson } from '../ocr/claude-json';

export const FACE_CHECK_REQUIRED = 'Vérification du visage requise';

const SCHEMA = {
  type: 'object',
  properties: {
    samePerson: { type: 'boolean' },
    liveSelfie: { type: 'boolean' },
    confidence: { type: 'number' },
    notes: { type: 'string', description: 'Explication courte en français' },
  },
  required: ['samePerson', 'liveSelfie', 'confidence', 'notes'],
  additionalProperties: false,
} as const;

/**
 * The SENGA upload path of a selfie: `/api/uploads/kyc/<file>` as given, or rebuilt from our
 * storage's signed link. Anything else is refused (pure, tested).
 */
export function selfieUploadPath(raw: string): string | null {
  const value = String(raw ?? '').trim();
  let file: string | null = null;
  const direct = value.match(/^(?:https?:\/\/[^/]+)?\/(?:api\/)?uploads\/kyc\/([^/?#]+)(?:[?#].*)?$/i);
  if (direct) file = direct[1]!;
  else {
    const signed = value.match(/^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/kyc\/([^/?#]+)(?:[?#].*)?$/i);
    if (signed) file = signed[1]!;
  }
  if (!file) return null;
  let name: string;
  try {
    name = decodeURIComponent(file);
  } catch {
    return null;
  }
  return /^[A-Za-z0-9._-]{1,200}$/.test(name) ? `/api/uploads/kyc/${name}` : null;
}

/** Passed today (Kinshasa calendar)? (pure, tested) */
export function faceCheckedToday(at: Date | null | undefined, now = new Date()): boolean {
  return Boolean(at) && kinshasaClock(at!).day === kinshasaClock(now).day;
}

/**
 * Daily face check (Admin → Automatisations): before going online the driver takes a selfie,
 * compared by the AI with the selfie validated at registration. A mismatch alerts the team.
 */
@Injectable()
export class FaceCheckService {
  private readonly logger = new Logger(FaceCheckService.name);

  constructor(private prisma: PrismaService, private ocr: OcrService) {}

  /** Throws when the driver must pass the check before going online. */
  async assertCanGoOnline(userId: string, faceCheckedAt: Date | null) {
    const cfg = (await fetchAutomations()).faceCheck;
    if (!cfg.enabled || !cfg.blockUntilChecked) return;
    if (faceCheckedToday(faceCheckedAt)) return;
    throw new MovaHttpException(
      MovaErrorCode.VALIDATION_ERROR,
      HttpStatus.PRECONDITION_REQUIRED,
      `${FACE_CHECK_REQUIRED} : prenez une selfie pour passer en ligne aujourd’hui.`,
    );
  }

  async check(userId: string, url: string) {
    const fail = (msg: string) => new MovaHttpException(MovaErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, msg);
    const reference = await this.prisma.kycDocument.findFirst({
      where: { userId, type: 'SELFIE', status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
    });
    if (!reference) throw fail('Aucune photo validée pour comparer : contactez SENGA.');
    // Only a selfie uploaded through SENGA (never an arbitrary address sent by the app).
    const own = selfieUploadPath(url);
    if (!own) throw fail('Photo non reconnue : reprenez la selfie dans l’application.');
    const [fresh, ref] = await Promise.all([this.ocr.fetchImageBuffer(own), this.ocr.fetchImageBuffer(reference.url)]);
    if (!fresh) throw fail('Impossible de lire la selfie : reprenez la photo.');
    if (!ref || !claudeAvailable()) {
      // Without the AI (switched off or unreachable) the check cannot be done: let the driver
      // work and tell the team, rather than blocking everyone.
      await this.prisma.driverProfile.update({ where: { userId }, data: { faceCheckedAt: new Date() } });
      await postStaffAlert({
        severity: 'INFO',
        title: 'Vérification du visage non faite',
        body: `Chauffeur ${userId.slice(0, 8)} : comparaison impossible (IA coupée ou photo de référence illisible). Passage en ligne autorisé.`,
        href: '/kyc',
      });
      return { ok: true, checked: false };
    }
    const verdict = await claudeJson({
      images: [ref, fresh],
      prompt:
        'Première photo : selfie validée du chauffeur lors de son inscription. Deuxième photo : selfie prise maintenant. ' +
        'Est-ce la même personne, et la deuxième est-elle une vraie selfie (pas une photo d’écran ou de papier) ? ' +
        'Réponds en JSON.',
      schema: SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 400,
    }).catch((e: unknown) => {
      this.logger.warn(`face check ${userId}: ${String(e)}`);
      return null;
    });
    const same = verdict?.samePerson === true && verdict?.liveSelfie === true && Number(verdict?.confidence ?? 0) >= 0.6;
    if (!same) {
      await postStaffAlert({
        severity: 'CRITICAL',
        title: 'Visage du chauffeur différent',
        body: `Chauffeur ${userId.slice(0, 8)} : la selfie du jour ne correspond pas à la photo validée (${String(verdict?.notes ?? 'pas de réponse')}). Vérifiez avant qu’il travaille.`,
        href: '/kyc',
      });
      throw fail('La selfie ne correspond pas à votre photo validée. Reprenez-la face à la caméra, bien éclairé ; sinon contactez SENGA.');
    }
    await this.prisma.driverProfile.update({ where: { userId }, data: { faceCheckedAt: new Date() } });
    return { ok: true, checked: true };
  }

  async qualityBlock(userId: string, reason: string) {
    await this.prisma.driverProfile.updateMany({
      where: { userId, qualityBlockedAt: null },
      data: { qualityBlockedAt: new Date(), qualityBlockReason: reason.slice(0, 300), isAvailable: false },
    });
    return { ok: true };
  }

  async qualityUnblock(userId: string) {
    await this.prisma.driverProfile.updateMany({ where: { userId }, data: { qualityBlockedAt: null, qualityBlockReason: null } });
    return { ok: true };
  }

  async qualityBlocked() {
    return this.prisma.driverProfile.findMany({
      where: { qualityBlockedAt: { not: null } },
      select: { userId: true, qualityBlockedAt: true, qualityBlockReason: true, ratingAvg: true },
      orderBy: { qualityBlockedAt: 'desc' },
      take: 200,
    });
  }
}
