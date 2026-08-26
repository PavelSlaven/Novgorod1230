import { loadImage } from '../../shared/image-cache.js';

export const PORTRAIT_EMOTIONS = Object.freeze([
  'neutral', 'calm', 'happy', 'sad', 'angry', 'afraid', 'suspicious',
  'tired', 'surprised'
]);

export const AUTHORED_PORTRAIT_ASSETS = Object.freeze({
  'lower-dvina-mikula': 'mikula',
  'lower-dvina-onisim': 'onisim',
  'lower-dvina-eremey': 'eremey',
  'lower-dvina-ratsha': 'ratsha',
  'lower-dvina-zhdanko': 'zhdanko',
  'lower-dvina-fisher-1': 'fisher-1',
  'lower-dvina-fisher-2': 'fisher-2'
});

const ROOT = '/assets/portrait/lower-dvina';
const EMOTIONS = new Set(PORTRAIT_EMOTIONS);
const SOURCE_SIZE = 768;

export function supportsAuthoredPortrait(assetId) {
  return Object.hasOwn(AUTHORED_PORTRAIT_ASSETS, assetId);
}

export function authoredPortraitUrls(assetId, emotion) {
  const folder = AUTHORED_PORTRAIT_ASSETS[assetId];
  if (!folder) return null;
  const normalizedEmotion = EMOTIONS.has(emotion) ? emotion : 'neutral';
  return Object.freeze({
    emotion: normalizedEmotion,
    outfitUrl: `${ROOT}/${folder}/outfit.png`,
    headUrl: `${ROOT}/${folder}/heads/${normalizedEmotion}.png`
  });
}

export async function renderAuthoredPortrait(canvas, assetId, emotion,
  lighting, { imageLoader = loadImage, isCurrent = () => true } = {}) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('Portrait Canvas 2D context is required.');
  const urls = authoredPortraitUrls(assetId, emotion);
  if (!urls) throw new TypeError('Unknown authored portrait asset.');
  const [outfit, head] = await Promise.all([
    imageLoader(urls.outfitUrl), imageLoader(urls.headUrl)
  ]);
  if (!isCurrent()) return Object.freeze({ cancelled: true });

  context.save();
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.filter = [
    `brightness(${lighting.exposure})`,
    `contrast(${lighting.contrast})`,
    `saturate(${lighting.saturation})`
  ].join(' ');
  context.drawImage(outfit, 0, 320, SOURCE_SIZE, 20,
    0, canvas.height * 285 / SOURCE_SIZE,
    canvas.width, canvas.height * 55 / SOURCE_SIZE);
  context.drawImage(outfit, 0, 0, canvas.width, canvas.height);
  context.drawImage(head, 0, 0, canvas.width, canvas.height);
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
  return Object.freeze({ ...urls, cancelled: false });
}
