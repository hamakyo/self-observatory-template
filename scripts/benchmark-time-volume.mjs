// Synthetic data only. Run `pnpm build` before this measurement.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const server = spawn(
  "uv",
  ["run", "python", "scripts/benchmark_time_volume.py", "--serve"],
  {
    stdio: ["ignore", "pipe", "inherit"],
  },
);
let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk;
  process.stdout.write(chunk);
});
let browser;
try {
  const base = "http://127.0.0.1:8018";
  const deadline = Date.now() + 180000;
  while (true) {
    if (server.exitCode !== null)
      throw new Error("Synthetic server exited before serving");
    if (output.includes('"source": "synthetic-only"')) {
      try {
        const repo = await fetch(`${base}/api/repository`);
        const metrics = JSON.parse(
          output
            .trim()
            .split("\n")
            .find((line) => line.startsWith("{")),
        );
        if (repo.ok && (await repo.json()).indexed_sha === metrics.head_sha)
          break;
      } catch {}
    }
    if (Date.now() > deadline)
      throw new Error("Synthetic server did not become ready");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const history = await (await fetch(`${base}/api/snapshots?limit=1`)).json();
  const path = `${base}/?view=volume&volume_from=${history.items[0].sha}`;
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const paint = () =>
    page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  const load = [],
    orbit = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    await page.goto(path);
    await page.locator(".time-volume").waitFor();
    await paint();
    load.push(performance.now() - start);
  }
  await page.getByLabel("空間の回転").focus();
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    await page.keyboard.press("ArrowRight");
    await paint();
    orbit.push(performance.now() - start);
  }
  const stats = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samples: values.length,
      median_ms: Math.round(sorted[Math.floor(sorted.length / 2)]),
      p95_ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    };
  };
  const results = {
    api: JSON.parse(
      output
        .trim()
        .split("\n")
        .find((line) => line.startsWith("{")),
    ),
    browser: browser.version(),
    viewport: [1440, 1000],
    navigation_to_paint: stats(load),
    keyboard_rotation_to_paint: stats(orbit),
    svg_elements: await page.locator(".time-volume *").count(),
    rendered_points: await page.locator(".volume-point").count(),
  };
  await mkdir("_local", { recursive: true });
  await writeFile(
    "_local/time-volume-benchmark.json",
    JSON.stringify(results, null, 2) + "\n",
  );
  await page.screenshot({
    path: "_local/time-volume-benchmark.png",
    fullPage: true,
  });
  console.log(JSON.stringify(results, null, 2));
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
