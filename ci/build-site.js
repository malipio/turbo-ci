const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
require("emulators");
const { compileProgram, REPO_ROOT } = require("./lib/tp-bundle");

const emulators = global.emulators;
emulators.pathPrefix = path.join(REPO_ROOT, "node_modules", "emulators", "dist") + "/";

const SITE_SRC_DIR = path.join(REPO_ROOT, "site");
const SITE_OUT_DIR = path.join(REPO_ROOT, "dist-site");
const SOURCE_PAS = path.join(REPO_ROOT, "src", "hello.pas");

async function main() {
  const { name, compileLog, exeBytes } = await compileProgram(SOURCE_PAS);
  if (exeBytes === null) {
    console.error("--- COMPILE.LOG ---");
    console.error(compileLog);
    throw new Error(`${SOURCE_PAS} did not produce an .EXE (compile error)`);
  }

  fs.rmSync(SITE_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_OUT_DIR, { recursive: true });
  fs.copyFileSync(path.join(SITE_SRC_DIR, "index.html"), path.join(SITE_OUT_DIR, "index.html"));

  const bundle = await emulators.bundle();
  bundle.autoexec(`${name}.EXE`);
  const bundleBytes = await bundle.toUint8Array();
  const bundlePath = path.join(SITE_OUT_DIR, "hello.jsdos");
  fs.writeFileSync(bundlePath, bundleBytes);

  // DosBundle.extract() is meant to pull extra files into the bundle, but its Node
  // "local file" code path relies on module.require, which isn't present on the
  // browserify module shim this package ships - it throws when called outside a
  // browser. So instead we inject the compiled .EXE into the zip ourselves.
  const exePath = path.join(SITE_OUT_DIR, `${name}.EXE`);
  fs.writeFileSync(exePath, exeBytes);
  execFileSync("zip", ["-jq", bundlePath, exePath]);
  fs.rmSync(exePath);

  console.log(`site written to ${SITE_OUT_DIR}`);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
