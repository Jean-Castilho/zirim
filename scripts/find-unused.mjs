/**
 * Lista arquivos que nenhum outro arquivo referencia (candidatos a remoção).
 * Uso: npm run unused
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignoreDirs = new Set(["node_modules", ".git", "scripts"]);
const entries = new Set(["index.js", "package.json", ".gitignore", "render.yaml"]);

const all = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoreDirs.has(e.name)) continue;
    const full = path.join(dir, e.name);
    e.isDirectory() ? walk(full) : all.push(path.relative(root, full).split(path.sep).join("/"));
  }
})(root);

const text = all
  .filter((f) => /\.(js|mjs|ejs|css|json|html)$/.test(f))
  .map((f) => fs.readFileSync(path.join(root, f), "utf8"))
  .join("\n");

const unused = all.filter((file) => {
  if (entries.has(file)) return false;
  const base = path.basename(file);
  const stem = base.replace(/\.(js|css|ejs|svg)$/, "");
  if (file.endsWith(".ejs")) return !text.includes(`/${stem}"`) && !text.includes(`/${stem}'`);
  return !text.includes(base) && !(file.startsWith("public/") && text.includes(file.slice("public".length)));
});

if (unused.length) {
  console.log("Arquivos sem nenhuma referência:\n" + unused.map((f) => "  " + f).join("\n"));
  process.exitCode = 1;
} else {
  console.log("✔ Nenhum arquivo órfão.");
}
