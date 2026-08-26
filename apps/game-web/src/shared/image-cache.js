const imageCache = new Map();

export function loadImage(url) {
  const cached = imageCache.get(url);
  if (cached) return cached;

  const image = new Image();
  image.src = url;
  const promise = image.decode().then(() => image);
  imageCache.set(url, promise);
  promise.catch(() => imageCache.delete(url));
  return promise;
}
