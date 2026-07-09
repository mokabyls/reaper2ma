import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outDir = new URL("../.test-build", import.meta.url);

rmSync(outDir, { recursive: true, force: true });

const compile = spawnSync("pnpm", ["exec", "tsc", "-p", "tsconfig.tests.json"], {
    stdio: "inherit",
    shell: false,
});

if (compile.status !== 0) {
    process.exit(compile.status ?? 1);
}

const run = spawnSync("node", ["--test", ".test-build/tests/reaper2ma.test.js"], {
    stdio: "inherit",
    shell: false,
});

process.exit(run.status ?? 1);
