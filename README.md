# MinimalFrame 🖼️

> **Zero-bloat, 100% local, high-performance photo framing & darkroom PWA.**  
> Give your photography clean gallery borders, rich analog effects, custom branding, and elegant camera EXIF typography — completely offline, directly in your browser or on Android.

---

[![Status: Active Development](https://img.shields.io/badge/Status-Active%20Development-blue.svg?style=for-the-badge)](https://github.com/rnlsn326/minimalframe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)
[![Framework: Svelte 5](https://img.shields.io/badge/Svelte-5.x%20Runes-FF3E00.svg?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev)
[![Bundler: Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Mobile: Capacitor](https://img.shields.io/badge/Capacitor-Android%20Ready-119EFF.svg?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com)

---

## ⚡ Project Status: Ongoing Development (WIP)

> [!NOTE]
> **MinimalFrame is actively under continuous development.**  
> Originally envisioned with a backend pipeline, V2 was rewritten to be **100% client-side (no Python / no server dependencies)** for privacy, zero latency, and seamless mobile compatibility via Capacitor Android. Features, performance tweaks, and camera RAW improvements are being added continuously.

---

## ✨ Key Features

### 🔒 1. 100% Local & Privacy-First (Zero Bloat)
- **No Cloud Uploads**: Your photos never leave your device. All rendering, EXIF extraction, and exports happen locally on your CPU/GPU.
- **Offline Ready**: Built as a Progressive Web App (PWA) and packaged for mobile platforms (Android) using Capacitor.
- **Zero Tracking**: No telemetry, no third-party analytics, and no accounts required.

---

### 🎨 2. Dual-Mode Creative Workflow
Switch effortlessly between two focused environments:

#### A. Photo Editor (Tone & Analog Lab)
- **Exposure & Light Controls**:
  - Exposure compensation: `-2.0 EV` to `+2.0 EV`
  - Fine-grained Brightness, Contrast, and Saturation adjustments
- **Analog & Film Simulation Engine**:
  - **Film Grain**: Ultra-fast randomized monochrome grain engine powered by an inlined LCG PRNG algorithm designed to process 24MP+ frames without UI lag.
  - **Soft Bloom / Black Mist**: Optical diffusion filter simulating CineBloom and Black Pro-Mist lenses with dynamic downsampled buffering.
- **Instant Style Presets**:
  - `RAW Fix` (Shadow lift and contrast normalization)
  - `Vivid` (Punchy color saturation and clarity)
  - `B&W Contrast` (Deep shadows with delicate analog grain)
  - `Warm Film` (Golden-hour glow with soft bloom)
  - `Moody` (Underexposed cinematic tones)

#### B. Framing & EXIF Typography Mode
- **Aspect Ratio Formatting**:
  - `Original Frame` (Maintains source image geometry)
  - `1:1 Square` (Classic feed / Exhibition)
  - `4:5 Portrait` (Instagram feed standard)
  - `9:16 Story` (TikTok / Reels / Mobile story)
  - `16:9 Landscape` (Cinematic widescreen)
  - `3:2 Print` (Traditional 35mm format)
  - `Custom Manual` (Custom proportional bounds)
- **Fine Padding Control**:
  - Independent Horizontal and Vertical margin sliders (5% to 50%).
- **Smart Color & Auto-Contrast**:
  - Custom background color picker & direct Hex input.
  - Real-time perceptual luminance calculation to automatically adjust text to black or white for optimal readability.
  - Save custom background/text palette combinations to LocalStorage.

---

### 📷 3. Camera EXIF Typography & Branding
- **Automated Metadata Extraction**:
  - Seamlessly parses Camera Make & Model, Lens Model, Focal Length, Aperture, Shutter Speed, and ISO using `exifr`.
- **Granular Display Toggles**:
  - Selectively hide or show any individual EXIF parameter.
- **Editable Metadata Overrides**:
  - Manually modify camera details, lens names, or exposure numbers per photo (perfect for vintage manual glass or unrecorded shot info).
- **Dynamic & Safe Placement**:
  - Non-overlapping layout math guarantees captions stay strictly within the margin zone — never obscuring your photograph.
  - Position presets (Top or Bottom zone) + precise horizontal and vertical offset sliders.
- **Custom Font Selection**:
  - Curated typography: *Inter, System UI, Playfair Display (Classic Editorial), JetBrains Mono, Sans-Serif, Serif, Impact, and Courier New*.
  - Auto-calculated proportional font scaling or direct manual font sizing override.
- **Personal Logo & Watermark**:
  - Import custom transparent PNG or SVG logos.
  - Adjustable scale (3% - 45%), opacity, and 1-click anchor presets (Corners & Center).

---

### 🚀 4. Batch Processing & Full-Res Multi-File Support
- **Multi-File Drag & Drop**:
  - Drop dozens of images at once; inspect and select through the interactive bottom filmstrip.
- **Dual-Resolution Performance Pipeline**:
  - **Proxy Canvas (Live View)**: Real-time UI rendering is strictly capped at a 1080p proxy canvas, providing 60 FPS fluidity on laptops and smartphones.
  - **Full-Resolution Export (24MP+)**: Full-resolution pixel pipelines and analog effects run strictly during export, delivering print-ready output without freezing the UI.
- **Batch ZIP Export**:
  - Export all loaded photos framed and rendered in full resolution into a single `.zip` archive via `JSZip` with an active progress indicator.
- **Single File JPEG Export**:
  - Configurable JPEG quality selector (`50%` to `100%`).
  - Mobile-tested download triggers compliant with Chrome Android and web sandboxes.

---

### 🎞️ 5. RAW Image Engine (Phase 1)
- Built-in detection and parsing for modern and legacy RAW formats:
  - **Sony** (`.arw`)
  - **Canon** (`.cr2`, `.cr3`)
  - **Nikon** (`.nef`)
  - **Adobe / Leica** (`.dng`)
  - **Fujifilm** (`.raf`)
  - **Olympus** (`.orf`)
  - **Panasonic** (`.rw2`)
  - **Pentax** (`.pef`)
  - **Samsung** (`.srw`)
- **Embedded Full-Res Stream Extraction**:
  - Scans RAW binary buffers for highest-resolution embedded preview streams to avoid low-resolution thumbnail pitfalls.
  - Reads embedded EXIF orientation tags for automatic upright orientation.
- **Pluggable WebAssembly Architecture**:
  - Modular API hooks (`initRawWasm`, `registerWasmDecoder`) ready for full WebAssembly demosaicing engines (e.g. dcraw or LibRaw Wasm).

---

### 💾 6. Presets & Local Templates
- **Built-in Curated Presets**:
  - *Minimal Gallery*, *Editorial Dark*, *Square Exhibition*, and *Analog Cine 16:9*.
- **Save Custom Presets**:
  - Save your custom margin dimensions, colors, font choices, and watermark configurations for one-click reuse via LocalStorage.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **UI Framework** | [Svelte 5](https://svelte.dev) (Runes: `$state`, `$derived`, `$effect`, `$state.raw`) |
| **Build Tool** | [Vite 8](https://vitejs.dev) |
| **Mobile Runtime** | [Capacitor 8](https://capacitorjs.com) (Android / Cross-platform) |
| **Metadata Parsing** | [exifr](https://github.com/MikeKovarik/exifr) |
| **Archive Packaging** | [JSZip](https://stuk.github.io/jszip/) |
| **Graphics Engine** | HTML5 Canvas 2D with custom pixel PRNG & computational shaders |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- `npm` or `pnpm` / `yarn`

### Installation

```bash
# Clone the repository
git clone https://github.com/rnlsn326/minimalframe.git

# Navigate into the project folder
cd minimalframe

# Install dependencies
npm install
```

### Running Locally

```bash
# Start Vite development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Building for Production

```bash
# Compile and optimize for web/PWA
npm run build

# Preview production build locally
npm run preview
```

---

## 📱 Mobile & Android Setup (Capacitor)

MinimalFrame is configured to run as a native mobile application using Capacitor:

```bash
# Build the production web assets
npm run build

# Sync web assets to Android
npx cap sync android

# Open project in Android Studio
npx cap open android
```

---

## 🗺️ Development Roadmap

MinimalFrame is an active, evolving project. Here is what is currently planned:

- [x] **V2 Architecture**: 100% Client-side migration (removed Python backend).
- [x] Svelte 5 runes migration & reactive state architecture.
- [x] Multi-file batch processing & ZIP bundle export.
- [x] Analog effects engine (monochrome film grain & soft bloom diffusion).
- [x] Watermark / Personal logo integration with anchor presets.
- [x] Editable EXIF metadata overrides.
- [ ] **Wasm Full RAW Debayering**: Integrating LibRaw / dcraw compiled to WebAssembly for direct sensor Bayer-pattern decoding.
- [ ] **Custom TTF/WOFF2 Font Uploads**: Allow users to drag-and-drop custom font files.
- [ ] **Custom 3D LUT Support**: Import `.cube` lookup tables for analog film color grading.
- [ ] **Native Android APK Releases**: Pre-built Android APK downloads in GitHub Releases.

---

## 🤝 Contributing

Contributions, feature requests, and feedback are welcome!
Feel free to open an [Issue](https://github.com/rnlsn326/minimalframe/issues) or submit a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
