import { IMG_SIZE } from "./constants";

/**
 * Re-encode an uploaded minimap image to a 1024×1024 WebP blob (the pixel space
 * the pipeline maps into). The 3 source images are up to 9000×9000; drawing them
 * straight into a 1024 canvas lets the browser downscale on the GPU rather than
 * holding a full-res RGBA buffer in JS.
 */
export async function downscaleMinimap(src: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(src);
  const canvas = document.createElement("canvas");
  canvas.width = IMG_SIZE;
  canvas.height = IMG_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, IMG_SIZE, IMG_SIZE);
  bmp.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/webp",
      0.82,
    );
  });
}
