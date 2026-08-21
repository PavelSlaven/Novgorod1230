import { loadImage } from '../../shared/image-cache.js';

export const PORTRAIT_12_URL =
  '/assets/portrait/portrait-12-neutral.png';

export function supportsPortrait12(spec) {
  return spec?.person?.sex === 'male'
    && spec.person.age === 'old'
    && spec.person.build === 'average'
    && spec.person.skin_tone === 'pale'
    && spec.person.face_shape === 'long'
    && spec.hair?.color === 'white'
    && spec.hair.length === 'bald'
    && spec.hair.style === 'straight'
    && spec.hair.facial_hair === 'full_beard'
    && spec.eyes?.color === 'dark'
    && spec.eyes.gaze === 'viewer'
    && spec.clothing?.neckline === 'slit_round'
    && spec.clothing.sleeve === 'narrow'
    && spec.clothing.outer === 'none'
    && spec.clothing.fabric === 'light_linen'
    && spec.clothing.trim === 'none'
    && spec.clothing.main_color === 'undyed_linen'
    && spec.clothing.secondary_color === 'undyed_linen'
    && spec.clothing.headwear === 'none'
    && spec.pose?.body === 'frontal'
    && spec.pose.head === 'straight';
}

export async function renderPortrait12(canvas, lighting, {
  imageLoader = loadImage,
  isCurrent = () => true
} = {}) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('Portrait Canvas 2D context is required.');
  const image = await imageLoader(PORTRAIT_12_URL);
  if (!isCurrent()) return Object.freeze({ cancelled: true });

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.filter = [
    `brightness(${lighting.exposure})`,
    `contrast(${lighting.contrast})`,
    `saturate(${lighting.saturation})`
  ].join(' ');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  context.filter = 'none';
  context.globalCompositeOperation = 'source-atop';
  if (lighting.tint && lighting.tintAlpha > 0) {
    context.globalAlpha = lighting.tintAlpha;
    context.fillStyle = lighting.tint;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (lighting.snowBounce > 0) {
    const bounce = context.createLinearGradient(0, canvas.height, 0, 0);
    bounce.addColorStop(0, `rgba(238, 247, 251, ${lighting.snowBounce})`);
    bounce.addColorStop(.62, 'rgba(238, 247, 251, 0)');
    context.globalAlpha = 1;
    context.fillStyle = bounce;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.restore();
  return Object.freeze({ assetUrl: PORTRAIT_12_URL, cancelled: false });
}
