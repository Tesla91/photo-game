// Resize an image to fit within MAX_EDGE on the long side and re-encode as
// JPEG at QUALITY. Phone photos can be 5-10 MB; this typically drops them
// to a few hundred KB with no visible quality loss for slideshow use.
//
// createImageBitmap() respects EXIF orientation by default in modern
// browsers (Chrome 75+, Safari 13.1+, Firefox 79+), so portrait phone
// photos come out the right way up.

const MAX_EDGE = 1600;
const QUALITY = 0.8;

export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.round(width * scale);
  const targetHeight = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('failed to get a 2d canvas context');
  }
  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      },
      'image/jpeg',
      QUALITY,
    );
  });
}
