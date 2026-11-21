import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const target = "apps/observatory/src/generated";
await mkdir(target, { recursive: true });
const tokens = JSON.parse(await readFile("design/tokens.json", "utf8"));
await writeFile(
  `${target}/tokens.css`,
  `/* Generated from design/tokens.json. */\n:root {\n${Object.entries(
    tokens.color,
  )
    .map(([name, color]) => `  --${name}: ${color.value};`)
    .join(
      "\n",
    )}\n  --font-primary: ${tokens.typography.fontFamily.primary};\n}\n`,
);
const temporary = await mkdtemp(join(tmpdir(), "observatory-openapi-"));
try {
  const schema = execFileSync("uv", [
    "run",
    "python",
    "-c",
    "import json; from pathlib import Path; from self_observatory.api import create_app; print(json.dumps(create_app(Path.cwd()).openapi()))",
  ]);
  const file = join(temporary, "openapi.json");
  await writeFile(file, schema);
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("npm_execpath is not available; run this script through pnpm");
  }
  execFileSync(
    process.execPath,
    [pnpmCli, "exec", "openapi-typescript", file, "-o", `${target}/api.ts`],
    { stdio: "inherit" },
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
