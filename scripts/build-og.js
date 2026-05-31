import sharp from 'sharp';
import TextToSVG from 'text-to-svg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, statSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

// Load fonts (TTF needed for text-to-svg)
const fontsDir = join(__dirname, 'fonts');
const fontBold = TextToSVG.loadSync(join(fontsDir, 'JetBrainsMono-Bold.ttf'));
const fontMedium = TextToSVG.loadSync(join(fontsDir, 'JetBrainsMono-Medium.ttf'));
const fontRegular = TextToSVG.loadSync(join(fontsDir, 'JetBrainsMono-Regular.ttf'));

// Convert text to SVG path element
function textPath(font, text, x, y, fontSize, fill) {
  const d = font.getD(text, { x, y, fontSize, anchor: 'left top' });
  return `<path d="${d}" fill="${fill}"/>`;
}

// Catppuccin Mocha palette
const C = {
  base: '#1e1e2e',
  surface2: '#585b70',
  red: '#f38ba8',
  yellow: '#f9e2af',
  green: '#a6e3a1',
  mauve: '#cba6f7',
  lavender: '#b4befe',
  peach: '#fab387',
  text: '#cdd6f4',
  subtext1: '#bac2de',
  surface0: '#313244',
};

// --- DNA Helix geometry ---
// Browser frame inner viewport
const bx = 60, by = 80, bw = 560, bh = 470;
const vpx = bx + 12, vpy = by + 52, vpw = bw - 24, vph = bh - 64;

// Helix parameters
const helixY = vpy + vph / 2;          // vertical center
const amplitude = 55;                   // sine wave amplitude
const periods = 1.8;                    // number of full sine cycles
const helixStartX = vpx + 20;
const helixEndX = vpx + vpw - 20;
const helixLen = helixEndX - helixStartX;
const cutX = helixStartX + helixLen * 0.52;  // cut point
const cutGap = 14;                       // separation at cut

function sineY(x, phase) {
  const t = (x - helixStartX) / helixLen;
  return helixY + amplitude * Math.sin(2 * Math.PI * periods * t + phase);
}

// Build helix strand as polyline points, with cut gap
function helixStrand(phase, gapDir) {
  const pts = [];
  const steps = 200;
  for (let i = 0; i <= steps; i++) {
    let x = helixStartX + (helixLen * i / steps);
    let y = sineY(x, phase);
    // Apply gap: shift right portion
    if (x > cutX) {
      x += cutGap * gapDir;
    }
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

// Base pair rungs connecting the two strands
function baseRungs() {
  const rungs = [];
  const count = 10;
  for (let i = 1; i <= count; i++) {
    const x = helixStartX + (helixLen * i / (count + 1));
    // Skip rungs very close to the cut point
    if (Math.abs(x - cutX) < 30) continue;
    const y1 = sineY(x, 0);
    const y2 = sineY(x, Math.PI);
    const offsetX = x > cutX ? cutGap : 0;
    rungs.push(`<line x1="${(x + offsetX).toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(x + offsetX).toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${C.subtext1}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`);
  }
  return rungs.join('\n    ');
}

// Scissors at the cut point
function scissors() {
  // Position scissors at the cut point, angled ~30°
  const sx = cutX + 2, sy = helixY;
  // Scissors as two crossed blade arcs + handle loops
  return `
    <g transform="translate(${sx}, ${sy}) rotate(-30)">
      <!-- Blade 1 -->
      <path d="M0,0 Q-8,-30 -2,-55" fill="none" stroke="${C.text}" stroke-width="3" stroke-linecap="round"/>
      <!-- Blade 2 -->
      <path d="M0,0 Q8,-30 2,-55" fill="none" stroke="${C.text}" stroke-width="3" stroke-linecap="round"/>
      <!-- Blade tips (pointed) -->
      <path d="M-2,-55 L-5,-62 L1,-55" fill="${C.text}" stroke="none"/>
      <path d="M2,-55 L5,-62 L-1,-55" fill="${C.text}" stroke="none"/>
      <!-- Pivot -->
      <circle cx="0" cy="0" r="3.5" fill="${C.surface2}" stroke="${C.text}" stroke-width="1.5"/>
      <!-- Handle 1 -->
      <path d="M0,0 C-12,10 -20,30 -10,42 C-4,48 6,44 8,36 C10,28 4,14 0,0Z" fill="none" stroke="${C.peach}" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Handle 2 -->
      <path d="M0,0 C12,10 20,30 10,42 C4,48 -6,44 -8,36 C-10,28 -4,14 0,0Z" fill="none" stroke="${C.peach}" stroke-width="2.5" stroke-linejoin="round"/>
    </g>`;
}

// Browser window frame
function browserFrame() {
  return `
    <!-- Browser window frame -->
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="12" ry="12" fill="${C.base}" stroke="${C.surface2}" stroke-width="2"/>
    <!-- Title bar background -->
    <rect x="${bx + 1}" y="${by + 1}" width="${bw - 2}" height="42" rx="11" ry="11" fill="${C.surface0}"/>
    <rect x="${bx + 1}" y="${by + 22}" width="${bw - 2}" height="21" fill="${C.surface0}"/>
    <!-- Window controls -->
    <circle cx="${bx + 26}" cy="${by + 22}" r="7" fill="${C.red}"/>
    <circle cx="${bx + 48}" cy="${by + 22}" r="7" fill="${C.yellow}"/>
    <circle cx="${bx + 70}" cy="${by + 22}" r="7" fill="${C.green}"/>
    <!-- Address bar -->
    <rect x="${bx + 94}" y="${by + 12}" width="${bw - 120}" height="20" rx="4" ry="4" fill="${C.base}" opacity="0.5"/>`;
}

// --- Text block (right 45%) ---
function textBlock() {
  const tx = 680;
  // Vertical centering: total text block height ~96+12+36+8+28 = ~180px
  // Canvas height 630, center = 315, block top = 315 - 90 = 225
  const titleY = 225;
  const subtitleY = titleY + 108;
  const taglineY = subtitleY + 52;

  return [
    textPath(fontBold, 'CNVLens', tx, titleY, 96, C.mauve),
    textPath(fontMedium, 'Browser-based CNV caller', tx, subtitleY, 34, C.text),
    textPath(fontRegular, 'for sequencing data', tx, taglineY, 26, C.subtext1),
  ].join('\n    ');
}

// Assemble full SVG
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${C.base}"/>

  ${browserFrame()}

  <!-- DNA helix strand 1 -->
  <polyline points="${helixStrand(0, 1)}" fill="none" stroke="${C.mauve}" stroke-width="3" stroke-linecap="round"/>
  <!-- DNA helix strand 2 -->
  <polyline points="${helixStrand(Math.PI, 1)}" fill="none" stroke="${C.lavender}" stroke-width="3" stroke-linecap="round"/>

  <!-- Base pair rungs -->
  ${baseRungs()}

  <!-- Scissors -->
  ${scissors()}

  <!-- Text block (paths, not <text>) -->
  ${textBlock()}
</svg>`;

// Write SVG source
import { writeFileSync } from 'fs';
const svgPath = join(publicDir, 'og-image.svg');
const pngPath = join(publicDir, 'og-image.png');
writeFileSync(svgPath, svg);
console.log('✓ og-image.svg written');

// Render at 2x then downscale for crisp text
const pngBuffer = await sharp(Buffer.from(svg))
  .resize(2400, 1260)
  .png({ quality: 90, compressionLevel: 9 })
  .toBuffer();

// Downscale to final 1200x630
await sharp(pngBuffer)
  .resize(1200, 630)
  .png({ compressionLevel: 9 })
  .toFile(pngPath);

// Validate output
const meta = await sharp(pngPath).metadata();
const size = statSync(pngPath).size;
const sizeKB = (size / 1024).toFixed(0);

console.log(`✓ og-image.png generated: ${meta.width}x${meta.height}, ${sizeKB} KB`);

if (meta.width !== 1200 || meta.height !== 630) {
  console.error(`✗ WRONG DIMENSIONS: expected 1200x630, got ${meta.width}x${meta.height}`);
  process.exit(1);
}
if (size > 1024 * 1024) {
  console.warn(`⚠ File size ${sizeKB} KB exceeds 1 MB — consider optimizing`);
} else if (size > 512 * 1024) {
  console.warn(`⚠ File size ${sizeKB} KB is over 500 KB — acceptable but could be smaller`);
}
