const fs = require("fs");
const path = require("path");

function readEnv(...names) {
  for (const name of names) {
    const value = (process.env[name] || "").trim();
    if (value) return { name, value };
  }
  return { name: names[0], value: "" };
}

const master = readEnv("JSONBIN_MASTER_KEY", "JSONBIN_API_KEY");
const bin = readEnv("JSONBIN_BIN_ID");
const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

const related = Object.keys(process.env)
  .filter((key) => /json|bin|harada|render/i.test(key))
  .sort();

console.log("[Harada build] environment probe", {
  onRender,
  relatedKeys: related,
  masterKeyVar: master.value ? master.name : "(missing)",
  binIdVar: bin.value ? bin.name : "(missing)"
});

if (!master.value && onRender) {
  console.error(
    "[Harada build] JSONBIN_MASTER_KEY is empty. Add it in Render → Environment, then choose Save, rebuild, and deploy (not Save and deploy)."
  );
  process.exit(1);
}

const config = {
  masterKey: master.value,
  binId: bin.value
};

const out = path.join(__dirname, "..", "config.js");
const body = `window.HARADA_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(out, body, "utf8");

console.log("[Harada build] wrote", out, {
  masterKey: config.masterKey ? "set" : "empty",
  binId: config.binId || "empty"
});
