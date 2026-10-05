const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
require("emulators");
const { compileProgram, REPO_ROOT, TP7_DIR } = require("./lib/tp-bundle");

const emulators = global.emulators;
emulators.pathPrefix = path.join(REPO_ROOT, "node_modules", "emulators", "dist") + "/";

const SITE_SRC_DIR = path.join(REPO_ROOT, "site");
const SITE_OUT_DIR = path.join(REPO_ROOT, "dist-site");

const EXAMPLES = [
  {
    file: "hello.pas",
    title: "hello.pas",
    description: "A minimal Turbo Pascal program - prints a line of text to the console.",
  },
  {
    file: "clock.pas",
    title: "clock.pas",
    description: "An analog clock drawn with the Graph (BGI) unit, updated once a second.",
  },
];

async function buildExample(example) {
  const sourcePath = path.join(REPO_ROOT, "src", example.file);
  const { name, compileLog, exeBytes } = await compileProgram(sourcePath, { backend: "dosbox" });
  if (exeBytes === null) {
    console.error(`--- COMPILE.LOG (${example.file}) ---`);
    console.error(compileLog);
    throw new Error(`${sourcePath} did not produce an .EXE (compile error)`);
  }

  const bundle = await emulators.bundle();
  bundle.autoexec(`${name}.EXE`);
  // Turbo Pascal 7's Crt unit calibrates its Delay()/timer routines against
  // the PIT at startup, and that calibration loop hangs forever under
  // DOSBox's default "cycles=auto" (it runs the emulated CPU too fast for
  // the loop's counter to behave) - a well-known old-DOS-software/DOSBox
  // interaction, not specific to this program. Pin a fixed, conservative
  // cycle count instead.
  bundle.dosboxConf = bundle.dosboxConf.replace("cycles=auto", "cycles=3000");
  const bundleBytes = await bundle.toUint8Array();
  const bundleFile = `${name.toLowerCase()}.jsdos`;
  const bundlePath = path.join(SITE_OUT_DIR, bundleFile);
  fs.writeFileSync(bundlePath, bundleBytes);

  // DosBundle.extract() is meant to pull extra files into the bundle, but its Node
  // "local file" code path relies on module.require, which isn't present on the
  // browserify module shim this package ships - it throws when called outside a
  // browser. So instead we inject files into the zip ourselves. We always add
  // EGAVGA.BGI (needed at runtime by any `uses Graph;` program) alongside the
  // .EXE - it's a harmless unused file for non-graphics examples like hello.pas.
  const exePath = path.join(SITE_OUT_DIR, `${name}.EXE`);
  fs.writeFileSync(exePath, exeBytes);
  const bgiPath = path.join(TP7_DIR, "EGAVGA.BGI");
  execFileSync("zip", ["-jq", bundlePath, exePath, bgiPath]);
  fs.rmSync(exePath);

  return {
    file: example.file,
    title: example.title,
    description: example.description,
    program: name,
    bundle: bundleFile,
  };
}

async function main() {
  fs.rmSync(SITE_OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_OUT_DIR, { recursive: true });

  const manifest = [];
  for (const example of EXAMPLES) {
    console.log(`building ${example.file} ...`);
    manifest.push(await buildExample(example));
  }

  const html = fs
    .readFileSync(path.join(SITE_SRC_DIR, "index.html"), "utf8")
    .replace("__EXAMPLES_JSON__", JSON.stringify(manifest));
  fs.writeFileSync(path.join(SITE_OUT_DIR, "index.html"), html);

  console.log(`site written to ${SITE_OUT_DIR} (${manifest.length} examples)`);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
