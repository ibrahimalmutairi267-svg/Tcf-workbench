// Builds the single self-contained index.html from src/ + index.template.html.
// React and all app code are bundled and precompiled (no CDN, no in-browser
// Babel), then inlined into the HTML shell at the /*APP_BUNDLE*/ marker.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "fs";

const result = await build({
  entryPoints: ["src/app.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari14"],
  jsx: "transform", // classic React.createElement (React is imported in app.jsx)
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  write: false,
});

let js = result.outputFiles[0].text;
// Guard against any literal </script> in the bundle closing the inline tag early.
js = js.replace(/<\/script>/gi, "<\\/script>");

const template = readFileSync("index.template.html", "utf8");
if (!template.includes("/*APP_BUNDLE*/")) {
  throw new Error("index.template.html is missing the /*APP_BUNDLE*/ marker");
}
const html = template.replace("/*APP_BUNDLE*/", () => js);
writeFileSync("index.html", html);
console.log(`Built index.html — ${(html.length / 1024).toFixed(0)} KB (bundle ${(js.length / 1024).toFixed(0)} KB)`);
