// Copies the self-hosted fonts from the @fontsource dev packages into public/fonts.
// Run once after `npm install`: npm run fonts. The copied files are committed, because
// the site is deployed straight from public/ with no build step.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/fonts';
const PACKAGES = [
  { pkg: 'ibm-plex-sans-arabic', subsets: ['arabic', 'latin'], weights: [400, 500, 600, 700] },
  { pkg: 'ibm-plex-sans', subsets: ['latin'], weights: [400, 500, 600, 700] },
  { pkg: 'ibm-plex-mono', subsets: ['latin'], weights: [400, 500, 600] },
  { pkg: 'space-grotesk', subsets: ['latin'], weights: [500, 600, 700] },
];

mkdirSync(OUT, { recursive: true });
let copied = 0;
for (const { pkg, subsets, weights } of PACKAGES) {
  for (const subset of subsets) {
    for (const weight of weights) {
      const name = `${pkg}-${subset}-${weight}-normal.woff2`;
      const from = join('node_modules', '@fontsource', pkg, 'files', name);
      if (!existsSync(from)) {
        console.error(`Missing ${from}. Run npm install first.`);
        process.exit(1);
      }
      copyFileSync(from, join(OUT, name));
      copied += 1;
    }
  }
}
console.log(`Copied ${copied} font files to ${OUT}`);
