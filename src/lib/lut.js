// Reads Adobe/Resolve .cube 3D LUTs, the format colourists and creators share their looks in.
// The data comes back in .cube order (red changes fastest), which is also WebGL's 3D-texture order.

/**
 * @param {string} text  contents of a .cube file
 * @returns {{ title: string, size: number, data: Float32Array }}  data: size³ RGB triplets, 0..1
 */
export function parseCube(text) {
  let title = "";
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(/\s+/);
    if (key === "TITLE") title = line.slice(5).trim().replace(/^"|"$/g, "");
    else if (key === "LUT_3D_SIZE") size = Number(rest[0]);
    else if (key === "LUT_1D_SIZE") throw new Error("1D LUTs aren't supported, only 3D .cube files");
    else if (key === "DOMAIN_MIN") min = rest.map(Number);
    else if (key === "DOMAIN_MAX") max = rest.map(Number);
    else if (/^[-+.\d]/.test(key)) {
      const rgb = [key, ...rest].slice(0, 3).map(Number);
      if (rgb.length !== 3 || rgb.some((v) => !Number.isFinite(v))) throw new Error(`Bad LUT line: ${line}`);
      values.push(...rgb);
    } // other keywords (LUT_3D_INPUT_RANGE, comments from some tools) are ignored
  }
  if (!Number.isInteger(size) || size < 2 || size > 65) throw new Error("Missing or unsupported LUT_3D_SIZE");
  if (values.length !== size ** 3 * 3) throw new Error(`Expected ${size ** 3} colours, found ${values.length / 3}`);
  const data = new Float32Array(values);
  // Output values outside the domain are rescaled to 0..1.
  if (min.some((v, i) => v !== 0 || max[i] !== 1)) {
    for (let i = 0; i < data.length; i++) data[i] = (data[i] - min[i % 3]) / (max[i % 3] - min[i % 3]);
  }
  return { title, size, data };
}
