import {
  appLanguageMiddleware,
  currentRequestLanguage,
  runWithLanguage,
  languageFromHeaders,
  normalizeAppLanguage,
  translateResponseBody,
  translateServerText,
} from './server-i18n';
import { SERVER_STRINGS_EN } from './server-strings-en';

describe('server-i18n', () => {
  it('reads the app language from headers', () => {
    expect(normalizeAppLanguage('en')).toBe('en');
    expect(normalizeAppLanguage('en-GB,fr;q=0.8')).toBe('en');
    expect(normalizeAppLanguage('fr')).toBe('fr');
    expect(normalizeAppLanguage(undefined)).toBe('fr');
    expect(languageFromHeaders({ 'x-app-language': 'en' })).toBe('en');
    expect(languageFromHeaders({ 'accept-language': 'en-US' })).toBe('fr');
    expect(languageFromHeaders({ 'x-app-language': 'fr', 'accept-language': 'en' })).toBe('fr');
  });

  it('keeps French for French users and unknown texts', () => {
    expect(translateServerText('Course introuvable.', 'fr')).toBe('Course introuvable.');
    expect(translateServerText('Texte inconnu', 'en')).toBe('Texte inconnu');
  });

  it('translates exact texts and templates', () => {
    expect(translateServerText('Course introuvable.', 'en')).toBe('Ride not found.');
    expect(translateServerText('Frais d\'annulation : 1 500 FC (après 5 min).', 'en')).toBe(
      'Cancellation fee: 1 500 FC (after 5 min).',
    );
    expect(translateServerText('Paiement de 2 300 FC effectué. Merci d\'utiliser SENGA.', 'en')).toBe(
      'Payment of 2 300 FC made. Thank you for using SENGA.',
    );
  });

  it('translates UI keys and partner translations in a JSON body, nothing else', () => {
    const body = {
      statusCode: 404,
      message: 'Course introuvable.',
      code: 'MOVA_RIDE_001',
      items: [{ name: 'Poulet mayo', description: 'Avec frites', translations: { en: { name: 'Mayo chicken' } } }],
      address: 'Course introuvable.',
    };
    expect(translateResponseBody(body, 'en')).toEqual({
      statusCode: 404,
      message: 'Ride not found.',
      code: 'MOVA_RIDE_001',
      items: [{ name: 'Mayo chicken', description: 'Avec frites', translations: { en: { name: 'Mayo chicken' } } }],
      address: 'Course introuvable.',
    });
    expect(translateResponseBody(body, 'fr')).toBe(body);
  });

  it('every template keeps its placeholders in English', () => {
    for (const [fr, en] of SERVER_STRINGS_EN) {
      const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(',');
      expect(`${fr} => ${ph(en)}`).toBe(`${fr} => ${ph(fr)}`);
    }
  });

  it('keeps the request language through async work', async () => {
    expect(currentRequestLanguage()).toBe('fr');
    await new Promise<void>((resolve) =>
      appLanguageMiddleware({ headers: { 'x-app-language': 'en' } }, {}, () => {
        setTimeout(() => {
          expect(currentRequestLanguage()).toBe('en');
          resolve();
        }, 1);
      }),
    );
    expect(runWithLanguage('en', () => currentRequestLanguage())).toBe('en');
  });
});

describe('Swahili / Lingala dictionaries', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('./server-i18n');

  it('reads sw and ln from the app header', () => {
    expect(m.normalizeAppLanguage('sw')).toBe('sw');
    expect(m.normalizeAppLanguage('ln-CD')).toBe('ln');
    expect(m.normalizeAppLanguage('de')).toBe('fr');
  });

  it('uses the registered dictionary, templates included, and keeps French when missing', () => {
    m.registerServerDictionary('sw', {
      'Course introuvable.': 'Safari haipatikani.',
      'Paiement de {0} FC effectué. Merci d\'utiliser SENGA.': 'Malipo ya {0} FC yamefanyika. Asante kwa kutumia SENGA.',
    });
    expect(m.translateServerText('Course introuvable.', 'sw')).toBe('Safari haipatikani.');
    expect(m.translateServerText('Paiement de 2 300 FC effectué. Merci d\'utiliser SENGA.', 'sw')).toBe(
      'Malipo ya 2 300 FC yamefanyika. Asante kwa kutumia SENGA.',
    );
    expect(m.translateServerText('Course introuvable.', 'ln')).toBe('Course introuvable.');
    expect(m.translateResponseBody({ message: 'Course introuvable.' }, 'sw')).toEqual({ message: 'Safari haipatikani.' });
  });
});
