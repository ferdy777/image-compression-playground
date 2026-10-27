# Browser Image Compression Playground

A small React + TypeScript + Vite project for testing `browser-image-compression` before uploading images to Azure Blob Storage.

## Run it

```bash
yarn
yarn dev
```

Open the local URL Vite prints in your terminal.

## What it demonstrates

- Accepts PNG, JPEG/JPG, and WebP.
- Skips compression when an image is at or below 500 KB **and** its longest dimension is at or below 1920 px.
- Uses `browser-image-compression` with a Web Worker (toggle it with the checkbox to compare against the main thread). The worker script is bundled by Vite and served from your own origin, not a CDN.
- Shows a progress bar while compressing.
- Shows original/compressed size, dimensions, processing time, and estimated size reduction.
- Lets you preview and download the processed image.
- Does not upload anything to Azure or any other server.

## Settings to discuss with the team

The 500 KB target and 1920 px dimension limit are example values for testing, not final requirements. Change them in `src/utils/imageCompression.ts` after Joshua confirms the product requirements.

Compression size is a target, not a guarantee. Results vary by image. Test on lower-powered phones as well as desktop. The worker reduces main-thread blocking but does not eliminate CPU or memory use.

## Notes

- JPEG and WebP keep their format. Large PNGs are converted to WebP (`CONVERT_PNG_TO_WEBP` in `src/utils/imageCompression.ts`).
- `KEEP_RESOLUTION` in the same file controls whether the library may shrink pixels while chasing the 500 KB target.
- The app does not automatically replace the original file on a server; it only lets you inspect and download the processed result.
- For real uploads, validate file type and size on the server/API too.
