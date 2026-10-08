const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
require("emulators");

const emulators = global.emulators;
const REPO_ROOT = path.join(__dirname, "..", "..");
const TP7_DIR = path.join(REPO_ROOT, "ci", "tp7");
const SENTINEL_TIMEOUT_MS = 60000;
const POLL_INTERVAL_MS = 500;
const DOSBOX_BIN = process.env.DOSBOX_BIN || "dosbox";
const DEFAULT_BACKEND = process.env.TPC_BACKEND || "dosbox";

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

// WASM backend (emulators.dosboxDirect): in-process, zero system
// dependencies, but its headless/synchronous DOSBox backend hangs forever
// when linking in anything from GRAPH.TPU (confirmed: the compile itself
// finishes - COMPILE.LOG and the .EXE are fully written - but the next
// autoexec command never runs). Fine for non-Graph examples like
// hello.pas; do not use for Graph-based ones like clock.pas.
async function compileProgramWasm(sourcePath) {
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

// Native-dosbox backend: shells out to a real dosbox binary with a real
// host directory mounted as drive C (not a virtual in-memory FS), so
// reading results back afterward is a plain synchronous fs.readFileSync.
// Works correctly on Graph-based programs, unlike the WASM backend above.
async function compileProgramDosbox(sourcePath) {
  const { name, resolvedSourcePath } = resolveName(sourcePath);

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "tp7-compile-"));
  try {
    for (const f of fs.readdirSync(TP7_DIR)) {
      fs.copyFileSync(path.join(TP7_DIR, f), path.join(stageDir, f));
    }
    fs.copyFileSync(resolvedSourcePath, path.join(stageDir, `${name}.PAS`));

    let sentinelFound = true;
    try {
      execFileSync(
        DOSBOX_BIN,
        [
          "-c", `MOUNT C ${stageDir}`,
          "-c", "C:",
          "-c", `TPC.EXE ${name}.PAS > COMPILE.LOG`,
          "-c", "exit",
          "-noautoexec",
        ],
        {
          env: { ...process.env, SDL_VIDEODRIVER: "dummy" },
          timeout: SENTINEL_TIMEOUT_MS,
          stdio: "ignore",
        }
      );
    } catch (e) {
      if (e.killed || e.signal) {
        sentinelFound = false; // dosbox itself hung and we killed it
      } else {
        throw e;
      }
    }

    const compileLogPath = path.join(stageDir, "COMPILE.LOG");
    const exePath = path.join(stageDir, `${name}.EXE`);
    return {
      name,
      sentinelFound,
      compileLog: fs.existsSync(compileLogPath) ? fs.readFileSync(compileLogPath, "utf8") : null,
      exeBytes: fs.existsSync(exePath) ? fs.readFileSync(exePath) : null,
    };
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

// Compiles sourcePath headlessly with TPC.EXE and returns the resulting .EXE bytes
// (or null if compilation failed). Used both by the CI pass/fail check and by the
// site builder, which only needs the compiled program, not the TP7 toolchain.
async function compileProgram(sourcePath, opts = {}) {
  const backend = opts.backend || DEFAULT_BACKEND;
  if (backend === "wasm") return compileProgramWasm(sourcePath);
  if (backend === "dosbox") return compileProgramDosbox(sourcePath);
  throw new Error(`unknown backend "${backend}" (expected "wasm" or "dosbox")`);
}

module.exports = { compileProgram, resolveName, REPO_ROOT, TP7_DIR };
