# MinimalFrame

Frame your photos for Instagram and every other feed: clean borders, captions with your camera details, brand logos and seamless carousels, plus a film-style photo editor. Everything runs on your device, in the browser or as an installed app. Nothing is uploaded.

[![Svelte 5](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vitejs.dev)
[![PWA](https://img.shields.io/badge/PWA-offline-5A0FC8)](#install-and-offline-use)

**Languages:** English · Türkçe · Deutsch

---

## What it does

### Frame
- **Ratios for each platform:** feed portrait (4:5), feed square, Story & Reel (9:16), print 3:2, wide 16:9, photo + caption, and an even border.
- **Carousels:** one wide photo split into 2–10 seamless 4:5 or square slides, each saved at Instagram's full size. Drag the photo to choose which part fills the strip.
- **Templates:** Gallery, Instant, Museum mat, Film border, Brand bar, Spread, Midnight and more. You can also save your own, and back up or import them as a file.
- **Captions:** camera, lens, focal length, aperture, shutter, ISO, date and a note, read from the photo's EXIF data and editable per photo. Raw camera codes (ILCE-7RM4, XF35mmF2) become readable names.
- **Caption layouts:** stacked, a brand bar with the real camera-maker logo, or one slim spread row.
- **Colours:** quick picks, colours taken from the photo, automatic text contrast and saved colour pairs.
- **Fonts:** eight bundled fonts that work offline, fonts from your computer, or your own font file.
- **Your logo or signature** as a watermark, with corner presets, size and opacity.

### Edit
- **Looks:** one-tap film looks, an **Auto** look worked out for each photo, and your own saved looks.
- **Fujifilm recipes:** paste a recipe's settings text and it's turned into a look.
- **LUTs:** import `.cube` files and blend them with a strength slider.
- **Match look:** makes one photo's brightness, white balance, contrast and colour follow another photo.
- **Light and colour:** exposure, contrast, highlights, shadows, whites, blacks, temperature, tint, vibrance and saturation.
- **Tone curve** per channel, and a **colour mixer** for the hue, saturation and luminance of each of eight colour bands.
- **Detail:** clarity and sharpening. **Film:** grain and soft bloom.
- **Crop:** free or fixed ratios, straighten, rotate and flip.
- **GPU engine:** develops in WebGL2, so sliders update live. Exports are rendered again at full resolution.

### Files
- **Formats:** JPEG, PNG, WebP, HEIC/HEIF, and RAW from Sony, Canon, Nikon, Fujifilm, Olympus, Panasonic, Pentax, Samsung and DNG. RAW is developed from the sensor data with LibRaw (WebAssembly).
- **Batch:** open a whole shoot, tick the photos you want and export them together. Desktop gets one ZIP; phones and tablets get separate images straight into the gallery.
- **Export:** Instagram size, 2K, 4K or full size, as JPEG, PNG or WebP, with an estimate of the file size. You can also share straight to Instagram and other apps.
- **Privacy:** every export is saved without metadata, so no GPS location, serial numbers or camera data end up in the file.

### Phone and tablet
- **Gestures:** pinch or double-tap to zoom, swipe between photos, press and hold to see the original, pull the tool panel down to close it, double-tap a slider to reset it, and drag its number to fine-tune.
- **Back gesture:** closes the open panel or sheet instead of leaving the app.
- **Animations:** the photo area grows and shrinks with the tool panel. Frame and ratio changes morph from one to the next. After you crop, the view zooms in Lightroom-style to show the result.
- **Smooth on big screens:** shadows, grain and bloom step aside while things move, which keeps large tablets fluid.
- **Samsung Internet:** it allows only one download per tap, so there the remaining carousel slides are saved one tap at a time.

### Your work is kept
Open photos come back after a reload, or after Android closes the app in the background: originals, edits, crops, captions, the frame settings and the selected photo. They're stored only on the device, and removing a photo deletes its stored copy too.

---

## Install and offline use

MinimalFrame is a Progressive Web App. Open it in Chrome or Samsung Internet and choose **Install** (or **Add to Home screen**). It then opens like an app and works offline. Photos shared from the gallery's share menu open directly in MinimalFrame.

The Android app for the Play Store is planned: either a Trusted Web Activity (a small Android shell around this web app) or Capacitor.

---

## Development

Requires [Node.js](https://nodejs.org/) 20 or newer.

```bash
git clone https://github.com/erenalsan/minimalframe.git
cd minimalframe
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/`, including the offline service worker |
| `npm run preview` | Serves the production build locally |
| `npm test` | Unit tests: frame layout, geometry, colour, LUTs, recipes, EXIF names, brand logos, zoom, translations |

To check frame rates on a real device, open the app with `?fps` at the end of the address. A small meter shows frames per second and late frames.

### Project layout

```
src/
  App.svelte              workbench: state, rendering, gestures, export
  components/             landing page, export sheet, photos tray, save dialog
  components/tools/       one component per tool panel
  lib/                    pure logic and engines (each with a *.test.js where it matters)
    frameLayout.js        border, caption and carousel layout, shared by preview and export
    developEngine.js      WebGL2 develop engine
    rawEngine.js          LibRaw (WebAssembly) RAW decoding
    i18n.svelte.js        interface language; locales/ holds Turkish and German
    store.js              IndexedDB storage for fonts, LUTs and the last session
public/                   icons, brand logos, landing images, share-target worker
```

### Translations

The English text is the key: `t("Export")` gives the Turkish or German version from `src/lib/locales/`, and falls back to English if one is missing. `npm test` fails if any text in the app lacks a Turkish or German version, or if the `{placeholders}` differ. To add a language, add a locale file and an entry in `LANGUAGES` in `i18n.svelte.js`.

---

## Stack

| | |
|---|---|
| Interface | [Svelte 5](https://svelte.dev) (runes) |
| Build | [Vite 8](https://vitejs.dev), [vite-plugin-pwa](https://vite-pwa-org.netlify.app) |
| Image engine | WebGL2 shaders, Canvas 2D |
| RAW | [libraw-wasm](https://www.npmjs.com/package/libraw-wasm) |
| HEIC | [libheif-js](https://www.npmjs.com/package/libheif-js) (LGPL-3.0, see `public/licenses/`) |
| EXIF | [exifr](https://github.com/MikeKovarik/exifr) |
| ZIP | [JSZip](https://stuk.github.io/jszip/) |
| Fonts | [Fontsource](https://fontsource.org) (bundled, offline) |

---

## Licence

No licence has been chosen for MinimalFrame itself yet. Third-party licences are in `public/licenses/`.
