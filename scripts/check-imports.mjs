/**
 * Verifica, com sensibilidade a maiúsculas/minúsculas (como no Linux do Render),
 * se todo import relativo e todo caminho de view EJS aponta para um arquivo real.
 * Uso: node scripts/check-imports.mjs   (npm run check)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

/** Resolve `target` exigindo a caixa exata de cada segmento. */
function existsExact(target) {
  const rel = path.relative(root, target).split(path.sep);
  let current = root;
  for (const part of rel) {
    if (part === "..") return false;
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) return false;
    if (!fs.readdirSync(current).includes(part)) return false;
    current = path.join(current, part);
  }
  return true;
}

function walk(dir, exts, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// 1. Imports relativos em .js
const importRe = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g;
for (const file of walk(root, [".js", ".mjs"])) {
  if (file.includes(`${path.sep}scripts${path.sep}`)) continue;
  const src = fs.readFileSync(file, "utf8");
  for (const [, spec] of src.matchAll(importRe)) {
    const target = path.resolve(path.dirname(file), spec);
    if (!existsExact(target)) {
      errors.push(`${path.relative(root, file)} -> "${spec}" (arquivo não encontrado / caixa diferente)`);
    }
  }
}

// 2. Includes EJS
const includeRe = /include\(\s*["']([^"']+)["']/g;
const viewsDir = path.join(root, "views");
for (const file of walk(viewsDir, [".ejs"])) {
  const src = fs.readFileSync(file, "utf8");
  for (const [, spec] of src.matchAll(includeRe)) {
    const base = spec.startsWith(".") ? path.dirname(file) : viewsDir;
    let target = path.resolve(base, spec);
    if (!path.extname(target)) target += ".ejs";
    if (!existsExact(target)) errors.push(`${path.relative(root, file)} -> include "${spec}"`);
  }
}


// 2b. Views renderizadas pelo código ("../pages/..." e "./layout/...")
const viewRe = /["'](?:\.\.\/(pages\/[^"']+)|\.\/(layout\/[^"']+))["']/g;
for (const file of walk(path.join(root, "src"), [".js"])) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(viewRe)) {
    const target = path.join(viewsDir, `${m[1] || m[2]}.ejs`);
    if (!existsExact(target)) errors.push(`${path.relative(root, file)} -> view "${m[0].slice(1, -1)}"`);
  }
}

// 2c. Assets públicos referenciados nas views (/css, /js, /img)
const assetRe = /["'`](\/(?:css|js|img)\/[^"'`?#\s<%]+)/g;
for (const file of [...walk(viewsDir, [".ejs"]), ...walk(path.join(root, "public"), [".js", ".css"])]) {
  const src = fs.readFileSync(file, "utf8");
  for (const [, asset] of src.matchAll(assetRe)) {
    if (!existsExact(path.join(root, "public", asset))) errors.push(`${path.relative(root, file)} -> asset "${asset}"`);
  }
}

// 3. Arquivos que diferem apenas pela caixa (quebram em checkouts case-insensitive)
const seen = new Map();
for (const file of walk(root, [""])) {
  const key = file.toLowerCase();
  if (seen.has(key) && seen.get(key) !== file) {
    errors.push(`Nomes duplicados por caixa: ${path.relative(root, seen.get(key))} / ${path.relative(root, file)}`);
  }
  seen.set(key, file);
}

if (errors.length) {
  console.error(`✖ ${errors.length} problema(s):\n` + errors.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
console.log("✔ Todos os imports e includes resolvem com a caixa exata.");
