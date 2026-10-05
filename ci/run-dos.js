const { compileProgram } = require("./lib/tp-bundle");

async function main() {
  const args = process.argv.slice(2);
  let backend;
  const positional = [];
  for (const arg of args) {
    const match = arg.match(/^--backend=(.+)$/);
    if (match) {
      backend = match[1];
    } else {
      positional.push(arg);
    }
  }

  const sourceArg = positional[0];
  if (!sourceArg) {
    console.error("usage: node ci/run-dos.js [--backend=wasm|dosbox] <path/to/file.pas>");
    process.exit(1);
  }

  console.log(`compiling ${sourceArg}...`);
  const { sentinelFound, compileLog, exeBytes } = await compileProgram(sourceArg, { backend });

  if (compileLog !== null) {
    console.log("--- COMPILE.LOG ---");
    console.log(compileLog);
  }

  if (!sentinelFound) {
    console.error(`FAIL: DOS session did not finish within the timeout (hung or crashed)`);
    process.exit(1);
  }

  if (exeBytes === null) {
    console.error(`FAIL: ${sourceArg} did not produce an .EXE (compile error)`);
    process.exit(1);
  }

  console.log(`PASS: ${sourceArg} compiled successfully`);
  process.exit(0);
}

main().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
