/**
 * Vision tasks other services may ask driver-service to run with Claude (the only
 * service holding the Anthropic key). Prompts and schemas live here, never in the
 * caller, so a caller cannot make Claude do something else.
 */
export type AiVisionTask = 'RECEIPT' | 'MOVING_VOLUME';

export const AI_VISION_TASKS: Record<
  AiVisionTask,
  { maxImages: number; schema: Record<string, unknown>; prompt: (ctx: Record<string, unknown>) => string }
> = {
  RECEIPT: {
    maxImages: 2,
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
};

export function isAiVisionTask(task: unknown): task is AiVisionTask {
  return typeof task === 'string' && task in AI_VISION_TASKS;
}
