import { loadImage } from '../../shared/image-cache.js';
import { buildLandscapeRenderModel } from './render-model.js';

export async function renderLandscapeCanvas(canvas, screen, {
  imageLoader = loadImage,
  isCurrent = () => true
} = {}) {
  const context = canvas?.getContext?.('2d');
  if (!context) throw new TypeError('Landscape Canvas 2D context is required.');
  const model = buildLandscapeRenderModel(screen);
  let assetUrl = model.assetUrl;
  let fallback = false;
  let image;
  try {
    image = await imageLoader(assetUrl);
  } catch {
    fallback = true;
    assetUrl = model.fallbackUrl;
    image = await imageLoader(assetUrl);
  }
  if (!isCurrent()) return Object.freeze({ model, cancelled: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return Object.freeze({ model, assetUrl, fallback, cancelled: false });
}

export function renderForegroundWeather(canvas, model) {
  const context = canvas?.getContext?.('2d');
  if (!context) return null;
  const width = Number(canvas.width || model.width);
  const height = Number(canvas.height || model.height);
  context.clearRect(0, 0, width, height);
  if (model.foregroundWeather === 'rain') drawRain(context, width, height);
  if (model.foregroundWeather === 'snow') drawSnow(context, width, height);
  if (model.foregroundWeather === 'fog') drawFog(context, width, height);
  return model.foregroundWeather;
}

function drawRain(context, width, height) {
  context.save();
  context.strokeStyle = 'rgba(210, 226, 236, .48)';
  context.lineWidth = 2.2;
  context.lineCap = 'round';
  for (let index = 0; index < 34; index += 1) {
    const x = (index * 173 + 41) % width;
    const y = (index * 97 + 23) % height;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - 15, y + 42);
    context.stroke();
  }
  context.restore();
}

function drawSnow(context, width, height) {
  context.save();
  context.fillStyle = 'rgba(246, 249, 247, .78)';
  for (let index = 0; index < 24; index += 1) {
    const x = (index * 227 + 59) % width;
    const y = (index * 131 + 37) % height;
    context.beginPath();
    context.arc(x, y, 2.5 + index % 4, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawFog(context, width, height) {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(228, 231, 226, .03)');
  gradient.addColorStop(.58, 'rgba(228, 231, 226, .2)');
  gradient.addColorStop(1, 'rgba(228, 231, 226, .08)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}
