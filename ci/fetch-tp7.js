const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.join(__dirname, "..");
const TP7_DIR = path.join(REPO_ROOT, "ci", "tp7");
const ARCHIVE_URL = "https://archive.org/download/tp_20240418/TP.zip";
const NEEDED_FILES = ["TPC.EXE", "TURBO.TPL", "GRAPH.TPU", "EGAVGA.BGI"];

// Turbo Pascal 7.0 was never released as freeware by Borland/Embarcadero (only
// 1.0, 3.02, and 5.5 were). We don't vendor it in this repo - see NOTICE.md.
// Instead we fetch it transiently here, at build/CI time, and only keep the
// files actually needed to compile and run the demos: the compiler and its
// default unit library, plus GRAPH.TPU (needed at *compile* time for any
// `uses Graph;` program - unlike Dos/Crt, Graph isn't prelinked into
// TURBO.TPL) and EGAVGA.BGI (the VGA driver InitGraph loads from disk at
// *runtime* - CI never runs compiled .EXEs, so this one is only needed by
// the live browser demo in ci/build-site.js, not by ci/run-dos.js).
function alreadyFetched() {
  return NEEDED_FILES.every((f) => fs.existsSync(path.join(TP7_DIR, f)));
}

function findFile(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return full;
    }
  }
  return null;
}

function main() {
  if (alreadyFetched()) {
    console.log(`ci/tp7/ already has ${NEEDED_FILES.join(", ")}, skipping fetch`);
    return;
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "tp7-fetch-"));
  try {
    const zipPath = path.join(stagingDir, "TP.zip");
    console.log(`downloading ${ARCHIVE_URL} ...`);
    execFileSync("curl", ["-sL", "-o", zipPath, ARCHIVE_URL]);

    const extractDir = path.join(stagingDir, "extracted");
    fs.mkdirSync(extractDir);
    execFileSync("unzip", ["-q", zipPath, "-d", extractDir]);

    fs.mkdirSync(TP7_DIR, { recursive: true });
    for (const name of NEEDED_FILES) {
      const found = findFile(extractDir, name);
      if (!found) {
        throw new Error(`${name} not found anywhere inside ${ARCHIVE_URL}`);
      }
      fs.copyFileSync(found, path.join(TP7_DIR, name));
      console.log(`extracted ${name}`);
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

main();
