const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { compileProgram, REPO_ROOT, TP7_DIR } = require("./lib/tp-bundle");
const { EXAMPLES } = require("./lib/examples");

const SITE_OUT_DIR = path.join(REPO_ROOT, "dist-site");
const DISPLAY = ":99";
const SCREEN_SIZE = "640x480";
const SCREEN_DEPTH = "24";
const BOOT_BUFFER_MS = 3000;
const RECORD_S = 9;
const GIF_FPS = 10;
const GIF_WIDTH = 480;
const WINDOW_TITLE = "turbociDemoCapture";

function parseArgs(argv) {
  const positional = [];
  const keys = [];
  let speed = 1;
  for (const arg of argv) {
    if (arg.startsWith("--speed=")) {
      speed = Number(arg.slice("--speed=".length));
      if (!(speed > 0)) throw new Error(`invalid --speed value: ${arg}`);
    } else if (arg.startsWith("--key=")) {
      const [name, ms] = arg.slice("--key=".length).split(":");
      const atMs = Number(ms);
      if (!name || !Number.isFinite(atMs)) throw new Error(`invalid --key value: ${arg}`);
      keys.push({ name, atMs });
    } else {
      positional.push(arg);
    }
  }
  if (positional.length !== 1) {
    throw new Error("usage: node ci/record-demo.js <file.pas> [--speed=N] [--key=NAME:MS ...]");
  }
  return { file: positional[0], speed, keys };
}

function waitForSocket(socketPath, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (fs.existsSync(socketPath)) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error(`timed out waiting for ${socketPath}`));
      setTimeout(poll, 100);
    };
    poll();
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { file, speed, keys } = parseArgs(process.argv.slice(2));

  const example = EXAMPLES.find((e) => e.file === file);
  if (!example) {
    throw new Error(`"${file}" is not a registered example (see ci/lib/examples.js)`);
  }

  const sourcePath = path.join(REPO_ROOT, "src", example.file);
  const basename = path.basename(example.file, ".pas");

  console.log(`compiling ${example.file} ...`);
  const { name, sentinelFound, compileLog, exeBytes } = await compileProgram(sourcePath, { backend: "dosbox" });
  if (!sentinelFound || exeBytes === null) {
    console.error(`--- COMPILE.LOG (${example.file}) ---`);
    console.error(compileLog);
    if (!sentinelFound) {
      throw new Error(`${sourcePath}: DOS session did not finish within the timeout (hung or crashed)`);
    }
    throw new Error(`${sourcePath} did not produce an .EXE (compile error)`);
  }

  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-record-"));
  let xvfb;
  let dosbox;
  try {
    fs.writeFileSync(path.join(stageDir, `${name}.EXE`), exeBytes);
    fs.copyFileSync(path.join(TP7_DIR, "EGAVGA.BGI"), path.join(stageDir, "EGAVGA.BGI"));

    const confPath = path.join(stageDir, "dosbox.conf");
    fs.writeFileSync(
      confPath,
      [
        "[cpu]",
        "cycles=3000",
        "",
        "[sdl]",
        "fullscreen=true",
        "output=surface",
        `fullresolution=${SCREEN_SIZE}`,
        `title=${WINDOW_TITLE}`,
        "",
      ].join("\n")
    );

    console.log("starting Xvfb ...");
    xvfb = spawn("Xvfb", [DISPLAY, "-screen", "0", `${SCREEN_SIZE}x${SCREEN_DEPTH}`], { stdio: "ignore" });
    const displayNum = DISPLAY.replace(":", "");
    await waitForSocket(`/tmp/.X11-unix/X${displayNum}`, 10000);

    console.log(`starting dosbox (${name}.EXE) ...`);
    const dosboxBin = process.env.DOSBOX_BIN || "dosbox";
    dosbox = spawn(
      dosboxBin,
      [
        "-conf", confPath,
        "-c", `MOUNT C ${stageDir}`,
        "-c", "C:",
        "-c", `${name}.EXE`,
        "-noautoexec",
      ],
      // No "-c exit": a fast-exiting program (e.g. hello.pas) would hand
      // control back to the DOS prompt in milliseconds, and "exit" would
      // then quit dosbox itself long before the boot buffer elapses,
      // leaving nothing on screen to record. We kill dosbox ourselves
      // once recording is done instead (see below).
      //
      // SDL_VIDEO_WINDOW_POS=0,0: with no window manager running under
      // Xvfb, dosbox's window otherwise lands at +0+40 instead of +0+0 -
      // its bottom 40px (e.g. the bottom of clock.pas's face) falls off
      // the bottom of the screen and never gets captured.
      { env: { ...process.env, DISPLAY, SDL_VIDEO_WINDOW_POS: "0,0" }, stdio: "ignore" }
    );

    await sleep(BOOT_BUFFER_MS);

    for (const { name: keyName, atMs } of keys) {
      setTimeout(() => {
        try {
          execFileSync("xdotool", ["search", "--name", WINDOW_TITLE, "windowactivate", "key", keyName], {
            env: { ...process.env, DISPLAY },
          });
        } catch (e) {
          console.error(`failed to send key "${keyName}" at ${atMs}ms:`, e.message);
        }
      }, atMs);
    }

    const rawVideoPath = path.join(stageDir, "raw.mp4");
    console.log(`recording ${RECORD_S}s ...`);
    execFileSync(
      "ffmpeg",
      [
        "-y", "-f", "x11grab", "-framerate", "30", "-draw_mouse", "0",
        "-video_size", SCREEN_SIZE, "-i", `${DISPLAY}.0`,
        "-t", String(RECORD_S),
        rawVideoPath,
      ],
      { env: { ...process.env, DISPLAY }, stdio: "inherit" }
    );

    dosbox.kill("SIGTERM");
    xvfb.kill("SIGTERM");
    dosbox = null;
    xvfb = null;

    fs.mkdirSync(SITE_OUT_DIR, { recursive: true });
    const outputGif = path.join(SITE_OUT_DIR, `demo-${basename}.gif`);
    const palettePath = path.join(stageDir, "palette.png");
    const speedFilter = `setpts=PTS/${speed}`;

    console.log("converting to GIF ...");
    execFileSync(
      "ffmpeg",
      [
        "-y", "-i", rawVideoPath,
        "-vf", `${speedFilter},fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,palettegen`,
        palettePath,
      ],
      { stdio: "inherit" }
    );
    execFileSync(
      "ffmpeg",
      [
        "-y", "-i", rawVideoPath, "-i", palettePath,
        "-filter_complex", `${speedFilter},fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse`,
        "-loop", "0",
        outputGif,
      ],
      { stdio: "inherit" }
    );

    console.log(`demo-${basename}.gif`);
  } finally {
    if (dosbox) dosbox.kill("SIGTERM");
    if (xvfb) xvfb.kill("SIGTERM");
    fs.rmSync(stageDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
