const fs = require("fs");
const path = require("path");

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return String(process.argv[index + 1] || "").trim();
}

function readEnv(...names) {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return { name, value };
  }
  return { name: names[0], value: "" };
}

const fromArgs = {
  masterKey: arg("--master-key"),
  binId: arg("--bin-id")
};
const fromEnv = {
  masterKey: readEnv("JSONBIN_MASTER_KEY", "JSONBIN_API_KEY"),
  binId: readEnv("JSONBIN_BIN_ID")
};

const config = {
  masterKey: fromArgs.masterKey || fromEnv.masterKey.value,
  binId: fromArgs.binId || fromEnv.binId.value
};

const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
const root = path.join(__dirname, "..");
const configPath = path.join(root, "config.js");
const indexPath = path.join(root, "index.html");

console.log("[Harada build] injecting JSONBin config", {
  onRender,
  masterKeyFrom: fromArgs.masterKey ? "build-arg" : fromEnv.masterKey.value ? fromEnv.masterKey.name : "(missing)",
  binIdFrom: fromArgs.binId ? "build-arg" : fromEnv.binId.value ? fromEnv.binId.name : "(missing)",
  relatedKeys: Object.keys(process.env).filter((key) => /json|bin|harada|render/i.test(key)).sort()
});

if (!config.masterKey && onRender) {
  console.error(
    "[Harada build] JSONBIN_MASTER_KEY was not injected. In Render → Settings set Build Command to: bash scripts/inject-config.sh"
  );
  process.exit(1);
}

const body = `window.HARADA_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(configPath, body, "utf8");

let html = fs.readFileSync(indexPath, "utf8");
const inline = `window.HARADA_CONFIG = ${JSON.stringify(config)};`;
html = html.replace(
  /<script id="harada-env">[\s\S]*?<\/script>/,
  `<script id="harada-env">${inline}</script>`
);
const stamp = process.env.RENDER_GIT_COMMIT || String(Date.now());
html = html.replace(/src="config\.js[^"]*"/, `src="config.js?v=${stamp}"`);
fs.writeFileSync(indexPath, html, "utf8");

console.log("[Harada build] wrote config.js and inlined env into index.html", {
  masterKey: config.masterKey ? "set" : "empty",
  binId: config.binId || "empty"
});
