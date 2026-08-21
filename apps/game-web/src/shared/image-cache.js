const images = new Map();

export function loadImage(url) {
  if (!images.has(url)) {
    const image = new Image();
    image.src = url;
    images.set(url, image.decode().then(() => image).catch((error) => {
      images.delete(url);
      throw error;
    }));
  }
  return images.get(url);
}
