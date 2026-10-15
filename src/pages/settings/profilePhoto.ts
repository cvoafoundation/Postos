/** Re-encode a square thumbnail; original image and metadata are never uploaded. */
export async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG, or WebP image of up to 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (
      !img.naturalWidth ||
      !img.naturalHeight ||
      img.naturalWidth * img.naturalHeight > 60_000_000
    )
      throw new Error("Choose a smaller image (up to 60 megapixels).");
    const side = Math.min(img.naturalWidth, img.naturalHeight),
      canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare the photo.");
    context.drawImage(
      img,
      (img.naturalWidth - side) / 2,
      (img.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      512,
      512,
    );
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88),
    );
    if (
      !result ||
      result.type !== "image/webp" ||
      result.size > 2 * 1024 * 1024
    )
      throw new Error(
        "Your browser could not prepare this photo. Try another JPG or PNG.",
      );
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}
