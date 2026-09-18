const fs = require("fs");
const path = require("path");

const config = {
  masterKey: (process.env.JSONBIN_MASTER_KEY || process.env.JSONBIN_API_KEY || "").trim(),
  binId: (process.env.JSONBIN_BIN_ID || "").trim()
};

const out = path.join(__dirname, "..", "config.js");
const body = `window.HARADA_CONFIG = ${JSON.stringify(config, null, 2)};\n`;
fs.writeFileSync(out, body, "utf8");

console.log("[Harada build] wrote config.js", {
  masterKey: config.masterKey ? "set" : "empty",
  binId: config.binId || "empty"
});
