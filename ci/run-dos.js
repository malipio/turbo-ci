const { compileProgram } = require("./lib/tp-bundle");

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    console.error("usage: node ci/run-dos.js <path/to/file.pas>");
    process.exit(1);
  }

  console.log(`compiling ${sourceArg}...`);
  const { sentinelFound, compileLog, exeBytes } = await compileProgram(sourceArg);

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
