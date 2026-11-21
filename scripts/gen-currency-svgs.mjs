import opentype from "opentype.js";
import fs from "fs";
import path from "path";

const font = opentype.parse(fs.readFileSync("C:/Windows/Fonts/arialbd.ttf").buffer);

const symbols = [
  { id: "usd", char: "$", color: "#85BB65" },
  { id: "cny", char: "¥", color: "#E891B0" },
  { id: "gbp", char: "£", color: "#6B3AA0" },
  { id: "eur", char: "€", color: "#2E5AAB" },
  { id: "rub", char: "₽", color: "#D52B1E" },
];

const outDir = "src/assets/currency-symbols";
fs.mkdirSync(outDir, { recursive: true });

for (const s of symbols) {
  const glyph = font.charToGlyph(s.char);
  if (!glyph || glyph.name === ".notdef" || glyph.index === 0) {
    console.log("MISSING", s.id, s.char, glyph && glyph.name, glyph && glyph.index);
    continue;
  }
  const pathObj = glyph.getPath(0, 0, 720);
  const d = pathObj.toPathData(2);
  const bb = pathObj.getBoundingBox();
  const pad = 40;
  const x = bb.x1 - pad;
  const y = bb.y1 - pad;
  const w = bb.x2 - bb.x1 + pad * 2;
  const h = bb.y2 - bb.y1 + pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" fill="none">
  <path d="${d}" fill="${s.color}"/>
</svg>
`;
  fs.writeFileSync(path.join(outDir, `${s.id}.svg`), svg);
  console.log(
    "OK",
    s.id,
    s.char,
    "idx",
    glyph.index,
    "name",
    glyph.name
  );
}
