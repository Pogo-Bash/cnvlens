import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

await sharp(join(publicDir, 'og-image.svg'))
  .resize(1200, 630)
  .png()
  .toFile(join(publicDir, 'og-image.png'));

console.log('✓ og-image.png generated (1200x630)');
