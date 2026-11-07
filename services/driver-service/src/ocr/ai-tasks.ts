/**
 * Vision tasks other services may ask driver-service to run with Claude (the only
 * service holding the Anthropic key). Prompts and schemas live here, never in the
 * caller, so a caller cannot make Claude do something else.
 */
export type AiVisionTask = 'RECEIPT' | 'MOVING_VOLUME' | 'MENU' | 'RENTAL_LISTING';

export const AI_VISION_TASKS: Record<
  AiVisionTask,
  { maxImages: number; uploadCategories: string[]; schema: Record<string, unknown>; prompt: (ctx: Record<string, unknown>) => string }
> = {
  RECEIPT: {
    maxImages: 2,
    // Proof photos are uploaded through /uploads/parcel-photo.
    uploadCategories: ['parcels'],
    schema: {
      type: 'object',
      properties: {
        isReceipt: { type: 'boolean', description: 'La photo montre bien un ticket de caisse, une facture ou un reçu' },
        readable: { type: 'boolean' },
        totalCdf: { type: ['integer', 'null'], description: 'Total payé converti en francs congolais si le ticket est en CDF ; null sinon' },
        totalOriginal: { type: ['number', 'null'], description: 'Total tel qu’écrit sur le ticket' },
        currency: { type: ['string', 'null'], enum: ['CDF', 'USD', null] },
        merchant: { type: ['string', 'null'] },
        date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, price: { type: ['number', 'null'] } },
            required: ['name', 'price'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string', description: 'Une phrase en français' },
      },
      required: ['isReceipt', 'readable', 'totalCdf', 'totalOriginal', 'currency', 'merchant', 'date', 'items', 'notes'],
      additionalProperties: false,
    },
    prompt: (ctx) =>
      [
        'Tu lis la photo d’un ticket de caisse pris par un livreur SENGA (courses pour un client, RDC).',
        'Recopie uniquement ce qui est écrit : commerçant, date, articles et total. Ne devine rien.',
        ctx.expectedItems ? `Liste d’achats du client (pour information) : ${String(ctx.expectedItems).slice(0, 600)}` : '',
        'Si ce n’est pas un ticket ou s’il est illisible, mets isReceipt/readable à false et les montants à null.',
      ]
        .filter(Boolean)
        .join('\n'),
  },
  MOVING_VOLUME: {
    maxImages: 6,
    uploadCategories: ['moving'],
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, quantity: { type: 'integer' } },
            required: ['name', 'quantity'],
            additionalProperties: false,
          },
        },
        estimatedVolumeM3: { type: 'number', description: 'Volume total à transporter, en m³' },
        recommendedCategory: { type: 'string', enum: ['CAMIONNETTE', 'CAMION_15M3', 'CAMION_30M3', 'CAMION_50M3'] },
        confidence: { type: 'number' },
        notes: { type: 'string', description: 'Une ou deux phrases en français pour le client' },
      },
      required: ['items', 'estimatedVolumeM3', 'recommendedCategory', 'confidence', 'notes'],
      additionalProperties: false,
    },
    prompt: () =>
      [
        'Tu aides un client SENGA (RDC) à estimer le volume de son déménagement à partir de photos de ses pièces et meubles.',
        'Liste les meubles et objets visibles avec leur quantité, puis estime le volume total à transporter en m³ ' +
          '(carton standard ≈ 0,1 m³, lit double ≈ 2 m³, réfrigérateur ≈ 1 m³, canapé 3 places ≈ 2 m³, armoire ≈ 2 m³).',
        'Choisis l’engin : CAMIONNETTE jusqu’à 6 m³, CAMION_15M3 jusqu’à 18, CAMION_30M3 jusqu’à 35, sinon CAMION_50M3.',
        'Reste prudent : c’est une estimation que le client pourra corriger.',
      ].join('\n'),
  },
  MENU: {
    maxImages: 3,
    // Restaurant menu photos are uploaded through /restaurant/menu-photo.
    uploadCategories: ['menu'],
    schema: {
      type: 'object',
      properties: {
        isMenu: { type: 'boolean', description: 'La photo montre bien un menu, une carte ou une liste de prix' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              priceCdf: { type: ['integer', 'null'], description: 'Prix en francs congolais ; null si absent ou en dollars' },
              priceUsd: { type: ['number', 'null'] },
              category: { type: ['string', 'null'], description: 'Rubrique du menu (Entrées, Plats, Boissons…)' },
              description: { type: ['string', 'null'], description: 'Courte description si écrite sur le menu' },
            },
            required: ['name', 'priceCdf', 'priceUsd', 'category', 'description'],
            additionalProperties: false,
          },
        },
        notes: { type: 'string', description: 'Une phrase en français (lisibilité, prix manquants…)' },
      },
      required: ['isMenu', 'items', 'notes'],
      additionalProperties: false,
    },
    prompt: () =>
      [
        'Tu lis la photo du menu d’un restaurant ou commerce partenaire de SENGA (RDC).',
        'Recopie chaque plat ou article avec son prix, sa rubrique et sa description si elle est écrite. N’invente aucun plat ni prix.',
        'Prix en francs congolais (FC, CDF) dans priceCdf ; en dollars dans priceUsd. Une ligne par article (au plus 80).',
        'Si ce n’est pas un menu, mets isMenu à false et une liste vide.',
      ].join('\n'),
  },
  RENTAL_LISTING: {
    maxImages: 5,
    // Rental vehicle photos are uploaded through /rental-partner/vehicle-photo.
    uploadCategories: ['vehicles'],
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Annonce en français, 3 à 6 phrases' },
        descriptionEn: { type: 'string', description: 'Même annonce en anglais' },
        highlights: { type: 'array', items: { type: 'string' }, description: '3 à 5 points forts courts' },
        missing: { type: 'array', items: { type: 'string' }, description: 'Ce qui manque pour une bonne annonce (photos, informations), en français' },
        photosMatchVehicle: { type: 'boolean', description: 'Les photos montrent bien le véhicule décrit' },
      },
      required: ['description', 'descriptionEn', 'highlights', 'missing', 'photosMatchVehicle'],
      additionalProperties: false,
    },
    prompt: (ctx) =>
      [
        'Tu rédiges l’annonce d’un véhicule de location sur SENGA (RDC), pour des clients locaux et étrangers.',
        `Informations du loueur : ${JSON.stringify(ctx.vehicle ?? {}).slice(0, 1500)}`,
        'Appuie-toi uniquement sur ces informations et sur ce qui est visible sur les photos (état, intérieur, coffre…).',
        'N’invente aucun équipement ni promesse (climatisation, assurance, kilométrage) qui ne soit ni déclaré ni visible.',
        'Ton clair et professionnel, sans majuscules excessives ni emojis. Pas de prix ni de numéro de téléphone dans le texte.',
      ].join('\n'),
  },
};

export function isAiVisionTask(task: unknown): task is AiVisionTask {
  return typeof task === 'string' && Object.prototype.hasOwnProperty.call(AI_VISION_TASKS, task);
}

/** Text-only tasks (no photos): admin analytics, daily summary, reply drafts. */
export type AiTextTask = 'ANALYTICS_ANSWER' | 'DAILY_SUMMARY' | 'REPLY_DRAFT' | 'TRANSLATE_CONTENT';

const DATA_RULES =
  'Réponds uniquement à partir des données fournies ; si elles ne permettent pas de répondre, dis-le et indique quelle donnée manque. ' +
  'N’invente aucun chiffre. Montants en francs congolais (FC). Réponds en français.';

export const AI_TEXT_TASKS: Record<
  AiTextTask,
  { schema: Record<string, unknown>; prompt: (ctx: Record<string, unknown>) => string; maxTokens: number }
> = {
  ANALYTICS_ANSWER: {
    maxTokens: 3000,
    schema: {
      type: 'object',
      properties: {
        answer: { type: 'string', description: 'Réponse directe en 2 à 6 phrases' },
        columns: { type: 'array', items: { type: 'string' }, description: 'En-têtes du tableau (vide si pas de tableau)' },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Lignes du tableau, au plus 15' },
        caveats: { type: 'array', items: { type: 'string' } },
      },
      required: ['answer', 'columns', 'rows', 'caveats'],
      additionalProperties: false,
    },
    prompt: (ctx) =>
      [
        'Tu es l’analyste de données de SENGA (VTC, livraisons, courses, déménagement, location en RDC).',
        DATA_RULES,
        `Période : ${String(ctx.period ?? '')}. Ville : ${String(ctx.city ?? 'toutes')}.`,
        `Données (JSON) : ${String(ctx.data ?? '{}')}`,
        `Question de l’administrateur : ${String(ctx.question ?? '').slice(0, 500)}`,
        'Ajoute un tableau (columns + rows) seulement s’il aide ; sinon laisse-les vides.',
      ].join('\n'),
  },
  DAILY_SUMMARY: {
    maxTokens: 2500,
    schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'Une phrase qui résume la journée' },
        highlights: { type: 'array', items: { type: 'string' }, description: '3 à 6 chiffres clés commentés' },
        alerts: { type: 'array', items: { type: 'string' }, description: 'Anomalies ou points à surveiller (peut être vide)' },
        actions: { type: 'array', items: { type: 'string' }, description: 'Actions concrètes pour l’équipe (peut être vide)' },
      },
      required: ['headline', 'highlights', 'alerts', 'actions'],
      additionalProperties: false,
    },
    prompt: (ctx) =>
      [
        'Tu rédiges le résumé quotidien de l’activité SENGA pour l’équipe d’exploitation.',
        DATA_RULES,
        'Compare la journée à la moyenne des 7 derniers jours quand c’est possible. Signale les baisses ou pics inhabituels.',
        `Ville : ${String(ctx.city ?? 'toutes')}.`,
        `Aujourd’hui (JSON) : ${String(ctx.today ?? '{}')}`,
        `7 derniers jours (JSON) : ${String(ctx.week ?? '{}')}`,
      ].join('\n'),
  },
  REPLY_DRAFT: {
    maxTokens: 1200,
    schema: {
      type: 'object',
      properties: {
        reply: { type: 'string', description: 'Brouillon de réponse, prêt à être relu' },
        tone: { type: 'string', enum: ['EXCUSES', 'EXPLICATION', 'REMERCIEMENT', 'FERME'] },
        internalNote: { type: 'string', description: 'Conseil interne pour l’équipe (non envoyé au client)' },
      },
      required: ['reply', 'tone', 'internalNote'],
      additionalProperties: false,
    },
    prompt: (ctx) =>
      [
        `Tu rédiges un brouillon de réponse au nom de ${String(ctx.signature ?? 'l’équipe SENGA')} ; un humain le relira avant envoi.`,
        'Réponse courte (3 à 6 phrases), polie, empathique, sans promettre de remboursement, de compensation ni de sanction : ' +
          'propose plutôt les prochaines étapes. Ne cite aucune donnée personnelle. Réponds dans la langue du message du client.',
        `Contexte : ${String(ctx.kind ?? '')} ${String(ctx.subject ?? '').slice(0, 300)}`,
        `Message du client : ${String(ctx.message ?? '').slice(0, 2000)}`,
      ].join('\n'),
  },
  /** Partner content (menu items, listings, ads) → English, shown to users who chose English. */
  TRANSLATE_CONTENT: {
    maxTokens: 8000,
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'La clé reçue, recopiée telle quelle' },
              en: { type: 'string', description: 'Traduction anglaise' },
            },
            required: ['key', 'en'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    prompt: (ctx) => {
      const target = TRANSLATION_TARGETS[String(ctx.target ?? 'en')] ?? TRANSLATION_TARGETS.en;
      return [
        `Traduis du français vers ${target} les textes ci-dessous. Ce sont des textes de SENGA, application de transport, livraison et paiement en RDC : boutons, messages et écrans de l'app, ou contenus de partenaires (menus, annonces de location, publicités).`,
        'Garde tels quels les noms propres, les marques (SENGA, M-Pesa, Airtel Money, Orange Money…), les noms de plats locaux sans équivalent (pondu, liboke, fufu, chikwangue, makayabu), les montants et les numéros.',
        'Recopie exactement les marqueurs entre accolades ({name}, {0}…) et garde les retours à la ligne.',
        'Traduction naturelle, courte et polie, comme dans une application, sans rien ajouter ni commenter. Si un texte est déjà dans la langue cible, recopie-le.',
        'Renvoie un élément par clé reçue, avec la même clé ; le champ « en » contient la traduction.',
        `Textes (JSON clé → texte) : ${JSON.stringify(ctx.texts ?? {}).slice(0, 12000)}`,
      ].join('\n');
    },
  },
};

/** Target languages of TRANSLATE_CONTENT (as said to Claude). */
const TRANSLATION_TARGETS: Record<string, string> = {
  en: 'l’anglais',
  sw: 'le swahili (kiswahili tel qu’on l’écrit dans l’est de la RDC, simple et courant)',
  ln: 'le lingala (tel qu’on l’écrit à Kinshasa, simple et courant ; garde les mots français d’usage courant quand le lingala les emprunte)',
};

export function isAiTextTask(task: unknown): task is AiTextTask {
  return typeof task === 'string' && Object.prototype.hasOwnProperty.call(AI_TEXT_TASKS, task);
}
