const fs = require("fs");
const path = require("path");
require("emulators");

const emulators = global.emulators;
const REPO_ROOT = path.join(__dirname, "..");
const TP7_DIR = path.join(__dirname, "tp7");
const SENTINEL_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 500;

emulators.pathPrefix = path.join(REPO_ROOT, "node_modules", "emulators", "dist") + "/";

function fileEntry(dosPath, localPath) {
  return { path: dosPath, contents: new Uint8Array(fs.readFileSync(localPath)) };
}

function readIfExists(ci, dosPath) {
  return ci.fsReadFile(dosPath).then(
    (data) => Buffer.from(data).toString(),
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

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    console.error("usage: node ci/run-dos.js <path/to/file.pas>");
    process.exit(1);
  }

  const sourcePath = path.resolve(REPO_ROOT, sourceArg);
  const name = path.basename(sourcePath, path.extname(sourcePath)).toUpperCase();
  if (name.length > 8) {
    console.error(`program name "${name}" exceeds DOS 8.3 limit (8 chars)`);
    process.exit(1);
  }

  const tp7Files = fs.readdirSync(TP7_DIR).map((f) => fileEntry(`TP/${f}`, path.join(TP7_DIR, f)));
  const sourceEntry = fileEntry(`TP/${name}.PAS`, sourcePath);

  const bundle = await emulators.bundle();
  bundle.autoexec(
    "CD \\TP",
    `TPC.EXE ${name}.PAS > COMPILE.LOG`,
    "ECHO DONE > DONE.TXT"
  );
  const bundleBytes = await bundle.toUint8Array();

  console.log(`compiling ${sourceArg} (program name ${name})...`);
  const ci = await emulators.dosboxDirect([bundleBytes, ...tp7Files, sourceEntry]);

  const sentinelFound = await waitForSentinel(ci, "TP/DONE.TXT", SENTINEL_TIMEOUT_MS);

  const compileLog = await readIfExists(ci, "TP/COMPILE.LOG");
  const exeExists = (await readIfExists(ci, `TP/${name}.EXE`)) !== null;

  await ci.exit();

  if (compileLog !== null) {
    console.log("--- COMPILE.LOG ---");
    console.log(compileLog);
  }

  if (!sentinelFound) {
    console.error(`FAIL: DOS session did not finish within ${SENTINEL_TIMEOUT_MS}ms (hung or crashed)`);
    process.exit(1);
  }

  if (!exeExists) {
    console.error(`FAIL: ${name}.EXE was not produced (compile error)`);
    process.exit(1);
  }

  console.log(`PASS: ${sourceArg} compiled successfully`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
