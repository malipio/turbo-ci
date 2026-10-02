const fs = require("fs");
const path = require("path");
require("emulators");

const emulators = global.emulators;
const REPO_ROOT = path.join(__dirname, "..", "..");
const TP7_DIR = path.join(REPO_ROOT, "ci", "tp7");
const SENTINEL_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;

emulators.pathPrefix = path.join(REPO_ROOT, "node_modules", "emulators", "dist") + "/";

function fileEntry(dosPath, localPath) {
  return { path: dosPath, contents: new Uint8Array(fs.readFileSync(localPath)) };
}

function resolveName(sourcePath) {
  const resolvedSourcePath = path.resolve(REPO_ROOT, sourcePath);
  const name = path.basename(resolvedSourcePath, path.extname(resolvedSourcePath)).toUpperCase();
  if (name.length > 8) {
    throw new Error(`program name "${name}" exceeds DOS 8.3 limit (8 chars)`);
  }
  return { name, resolvedSourcePath };
}

function readIfExists(ci, dosPath) {
  return ci.fsReadFile(dosPath).then(
    (data) => Buffer.from(data),
    () => null
  );
}

async function waitForSentinel(ci, dosPath, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await ci.fsReadFile(dosPath);
      return true;
    } catch (e) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  return false;
}

// Compiles sourcePath headlessly with TPC.EXE and returns the resulting .EXE bytes
// (or null if compilation failed). Used both by the CI pass/fail check and by the
// site builder, which only needs the compiled program, not the TP7 toolchain.
async function compileProgram(sourcePath) {
  const { name, resolvedSourcePath } = resolveName(sourcePath);

  const tp7Files = fs.readdirSync(TP7_DIR).map((f) => fileEntry(`TP/${f}`, path.join(TP7_DIR, f)));
  const sourceEntry = fileEntry(`TP/${name}.PAS`, resolvedSourcePath);

  const bundle = await emulators.bundle();
  bundle.autoexec("CD \\TP", `TPC.EXE ${name}.PAS > COMPILE.LOG`, "ECHO DONE > DONE.TXT");
  const bundleBytes = await bundle.toUint8Array();

  const ci = await emulators.dosboxDirect([bundleBytes, ...tp7Files, sourceEntry]);

  const sentinelFound = await waitForSentinel(ci, "TP/DONE.TXT", SENTINEL_TIMEOUT_MS);
  const compileLogBytes = await readIfExists(ci, "TP/COMPILE.LOG");
  const exeBytes = await readIfExists(ci, `TP/${name}.EXE`);

  await ci.exit();

  return {
    name,
    sentinelFound,
    compileLog: compileLogBytes !== null ? compileLogBytes.toString() : null,
    exeBytes,
  };
}

module.exports = { compileProgram, resolveName, REPO_ROOT, TP7_DIR };
