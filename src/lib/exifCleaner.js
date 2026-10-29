// Turns the cryptic camera and lens strings cameras write into EXIF ("ILCE-7RM4", "XF35mmF2 R WR")
// into the names people actually use ("Sony A7R IV", "Fujifilm XF 35mm f/2 R WR").
// Pure string functions: unknown names come back trimmed but otherwise untouched.

// EXIF Make values → display brand. Keys are lowercase.
const BRANDS = {
  sony: "Sony",
  canon: "Canon",
  nikon: "Nikon",
  "nikon corporation": "Nikon",
  fujifilm: "Fujifilm",
  fuji: "Fujifilm",
  "fuji photo film co., ltd.": "Fujifilm",
  panasonic: "Panasonic",
  leica: "Leica",
  "leica camera ag": "Leica",
  olympus: "Olympus",
  "olympus corporation": "Olympus",
  "olympus imaging corp.": "Olympus",
  "om digital solutions": "OM System",
  ricoh: "Ricoh",
  "ricoh imaging company, ltd.": "Ricoh",
  pentax: "Pentax",
  hasselblad: "Hasselblad",
  sigma: "Sigma",
  apple: "Apple",
  samsung: "Samsung",
  google: "Google",
  dji: "DJI",
};

// Bodies whose model code no rule below can read. Keys are the bare model, uppercase.
const MODELS = {
  "ILCE-1": "Sony A1",
  "ILCE-9": "Sony A9",
  "ZV-E10": "Sony ZV-E10",
  "ZV-1": "Sony ZV-1",
  "DC-S5M2": "Panasonic S5 II",
  "DC-G9M2": "Panasonic G9 II",
};

const ROMAN = ["", "", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const roman = (n) => ROMAN[Number(n)] ?? n;

// Bare model codes that only one brand uses, for files that carry no Make.
const MODEL_BRAND = [
  [/^(ILCE|DSC|ZV|SLT|NEX)-/i, "Sony"],
  [/^EOS\b/i, "Canon"],
  [/^(X-[A-Z]|X\d{3}|GFX)/i, "Fujifilm"],
  [/^(NIKON|Z ?\d|Z ?f)/i, "Nikon"],
  [/^DC-/i, "Panasonic"],
];

function splitBrand(name) {
  const s = name.replace(/\s+/g, " ").trim();
  const lower = s.toLowerCase();
  // Longest known Make that the string starts with ("nikon corporation" before "nikon").
  const make = Object.keys(BRANDS)
    .filter((k) => lower === k || lower.startsWith(k + " "))
    .sort((a, b) => b.length - a.length)[0];
  let brand = make ? BRANDS[make] : "";
  let model = make ? s.slice(make.length).trim() : s;
  // Canon and Nikon repeat the brand in Model ("Canon Canon EOS R5", "NIKON CORPORATION NIKON Z 6_2").
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase() + " ")) model = model.slice(brand.length + 1);
  if (!brand) brand = MODEL_BRAND.find(([re]) => re.test(model))?.[1] ?? "";
  if (brand === "Nikon") model = model.replace(/^NIKON /i, "");
  return [brand, model];
}

// Samsung writes a code (SM-S931B: S931 is the model, the last letter the region). Phones and tablets
// people photograph with, newest first. shortcut: popular models only; add new ones as they come out.
const GALAXY = {
  S931: "Galaxy S25", S936: "Galaxy S25+", S938: "Galaxy S25 Ultra", S937: "Galaxy S25 Edge", S731: "Galaxy S25 FE",
  S921: "Galaxy S24", S926: "Galaxy S24+", S928: "Galaxy S24 Ultra", S721: "Galaxy S24 FE",
  S911: "Galaxy S23", S916: "Galaxy S23+", S918: "Galaxy S23 Ultra", S711: "Galaxy S23 FE",
  S901: "Galaxy S22", S906: "Galaxy S22+", S908: "Galaxy S22 Ultra",
  G991: "Galaxy S21", G996: "Galaxy S21+", G998: "Galaxy S21 Ultra", G990: "Galaxy S21 FE",
  F966: "Galaxy Z Fold7", F956: "Galaxy Z Fold6", F946: "Galaxy Z Fold5", F936: "Galaxy Z Fold4",
  F766: "Galaxy Z Flip7", F741: "Galaxy Z Flip6", F731: "Galaxy Z Flip5", F721: "Galaxy Z Flip4",
  A566: "Galaxy A56", A366: "Galaxy A36", A266: "Galaxy A26", A556: "Galaxy A55", A356: "Galaxy A35",
  A546: "Galaxy A54", A346: "Galaxy A34", A256: "Galaxy A25", A156: "Galaxy A15",
  X610: "Galaxy Tab S9 FE+", X616: "Galaxy Tab S9 FE+", X510: "Galaxy Tab S9 FE", X516: "Galaxy Tab S9 FE",
  X710: "Galaxy Tab S9", X810: "Galaxy Tab S9+", X910: "Galaxy Tab S9 Ultra",
  X820: "Galaxy Tab S10+", X920: "Galaxy Tab S10 Ultra",
};

/** "ILCE-7RM4" → "Sony A7R IV", "Canon EOS 5D Mark IV" → "Canon 5D Mark IV", "NIKON Z 6_2" → "Nikon Z6 II". */
export function cleanCamera(name) {
  if (!name?.trim()) return "";
  const [brand, raw] = splitBrand(name);
  if (MODELS[raw.toUpperCase()]) return MODELS[raw.toUpperCase()];
  let model = raw;
  let m;

  if (brand === "Sony") {
    // ILCE-7RM4 → A7R IV, ILCE-7C → A7C, ILCE-6400 → A6400, DSC-RX100M7 → RX100 VII
    if ((m = /^ILCE-(\d+[A-Z]*?)(?:M(\d)([A-Z]?))?$/i.exec(raw))) model = `A${m[1]}${m[2] ? " " + roman(m[2]) + m[3] : ""}`;
    else if ((m = /^DSC-([A-Z]+\d+[A-Z]*?)(?:M(\d)([A-Z]?))?$/i.exec(raw))) model = `${m[1]}${m[2] ? " " + roman(m[2]) + m[3] : ""}`;
  } else if (brand === "Canon") {
    model = raw.replace(/^EOS /i, ""); // "EOS R5" → "R5"; PowerShot and Kiss keep their names
  } else if (brand === "Nikon") {
    model = raw.replace(/^Z (?=\w)/i, "Z").replace(/_(\d)$/, (_, n) => " " + roman(n)); // Z 6_2 → Z6 II
  } else if (brand === "Panasonic") {
    model = raw.replace(/^DC-/i, "").replace(/M(\d)$/, (_, n) => " " + roman(n));
  } else if (brand === "Samsung" && (m = /^SM-([A-Z]\d{3})/i.exec(raw)) && GALAXY[m[1].toUpperCase()]) {
    return GALAXY[m[1].toUpperCase()]; // SM-S931B → Galaxy S25
  } else if (brand === "Apple" || brand === "Google" || brand === "Samsung") {
    return raw || brand; // "iPhone 15 Pro", "Pixel 8" are already the name people use
  }

  return [brand, model].filter(Boolean).join(" ");
}

// Lens mount prefixes → brand, for lenses written without one.
const MOUNTS = [
  [/^(FE|E)\b/, "Sony"],
  [/^(EF|EF-S|EF-M|RF|RF-S)\b/, "Canon"],
  [/^(XF|XC|GF)\b/, "Fujifilm"],
];
const LENS_BRANDS = /^(Sony|Canon|Nikon|Nikkor|Fujifilm|Fujinon|Sigma|Tamron|Tokina|Samyang|Viltrox|Zeiss|Leica|Voigtl|Laowa|Panasonic|Lumix|Olympus|OM|Ricoh|Pentax|smc|HD PENTAX|TTArtisan|7Artisans)/i;

/** "FE 24-70mm F2.8 GM" → "Sony FE 24-70mm f/2.8 GM", "XF35mmF2 R WR" → "Fujifilm XF 35mm f/2 R WR". */
export function cleanLens(name) {
  if (!name?.trim()) return "";
  let s = name
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(EF-S|EF-M|EF|RF-S|RF|XF|XC|GF|FE)(?=\d)/, "$1 ") // EF50mm → EF 50mm
    .replace(/mm\s*F\/?(?=\d)/gi, "mm f/") // 35mmF2, 70mm F2.8 → mm f/
    .replace(/\s1:(?=\d)/g, " f/"); // Canon/Nikon "1:1.8" → f/1.8
  if (!LENS_BRANDS.test(s)) {
    const brand = MOUNTS.find(([re]) => re.test(s))?.[1];
    if (brand) s = `${brand} ${s}`;
  }
  return s;
}

/** The brand of a camera string ("SONY ILCE-7M3" → "Sony"), or "" when it can't tell. */
export function cameraBrand(name) {
  return name?.trim() ? splitBrand(name)[0] : "";
}
