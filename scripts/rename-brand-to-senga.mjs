/**
 * Rename user-facing brand MOVA/Mova → SENGA/Senga.
 * Skips technical identifiers (MOVA_*, camelCase MovaX, package paths).
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '.dart_tool',
  'Pods',
  'vendor',
]);

const EXT = new Set([
  '.dart',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.kts',
  '.xml',
  '.plist',
  '.html',
  '.yaml',
  '.yml',
  '.txt',
  '.gradle',
]);

const PHRASE_REPLACEMENTS = [
  [/MOVA Driver/g, 'SENGA Driver'],
  [/MOVA Passager/g, 'Senga'],
  [/MOVA Chauffeur/g, 'SENGA Driver'],
  [/MOVA Admin/g, 'SENGA Admin'],
  [/MOVA Restaurant/g, 'SENGA Restaurant'],
  [/MOVA Resto/g, 'SENGA Resto'],
  [/MOVA Location Partenaire/g, 'SENGA Location Partenaire'],
  [/MOVA Location/g, 'SENGA Location'],
  [/MOVA RDC/g, 'SENGA RDC'],
  [/MOVA Plus/g, 'SENGA Plus'],
  [/MOVA Premium/g, 'SENGA Premium'],
  [/MOVA Fleet/g, 'SENGA Fleet'],
  [/MOVA Platform Treasury/g, 'SENGA Platform Treasury'],
  [/Portefeuille MOVA/g, 'Portefeuille SENGA'],
  [/portefeuille MOVA/g, 'portefeuille SENGA'],
  [/Wallet MOVA/g, 'Wallet SENGA'],
  [/Message MOVA/g, 'Message SENGA'],
  [/Centre d'aide MOVA/g, "Centre d'aide SENGA"],
  [/Centre d&apos;aide MOVA/g, "Centre d&apos;aide SENGA"],
  [/Commission MOVA/g, 'Commission SENGA'],
  [/Commissions plateforme MOVA/g, 'Commissions plateforme SENGA'],
  [/application mobile MOVA/g, 'application mobile SENGA'],
  [/l'application MOVA/g, "l'application SENGA"],
  [/l&apos;application MOVA/g, "l&apos;application SENGA"],
];

function transform(content) {
  let out = content;
  for (const [re, to] of PHRASE_REPLACEMENTS) {
    out = out.replace(re, to);
  }
  // Whole-word brand tokens; \w includes _ so MOVA_DRIVER / MovaScreen stay intact.
  out = out.replace(/(?<![\w])MOVA(?![\w])/g, 'SENGA');
  out = out.replace(/(?<![\w])Mova(?![\w])/g, 'Senga');
  return out;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

const files = walk(root);
let changed = 0;
for (const file of files) {
  // Keep package/technical names untouched in these paths if needed later.
  if (file.includes(`${path.sep}scripts${path.sep}rename-brand-to-senga.mjs`)) continue;
  const before = fs.readFileSync(file, 'utf8');
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
    console.log(path.relative(root, file));
  }
}
console.log(`\nUpdated ${changed} files.`);
