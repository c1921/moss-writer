import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SEMVER_TAG_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, "..");

export function normalizeVersionTag(tag) {
  const normalized = tag.trim();

  if (!SEMVER_TAG_PATTERN.test(normalized)) {
    throw new Error(`Invalid version tag: ${tag}`);
  }

  return normalized.startsWith("v") ? normalized.slice(1) : normalized;
}

export function resolveVersionFromTag({
  cwd = repoRoot,
  env = process.env,
  exec = spawnSync,
} = {}) {
  if (env.GITHUB_REF_NAME?.trim()) {
    return normalizeVersionTag(env.GITHUB_REF_NAME);
  }

  const result = exec("git", ["describe", "--tags", "--exact-match"], {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const reason = result.stderr?.trim() || result.error?.message || "unknown error";
    throw new Error(`Unable to resolve Git tag for HEAD: ${reason}`);
  }

  return normalizeVersionTag(result.stdout.trim());
}

export function updatePackageJsonContent(raw, version) {
  const parsed = JSON.parse(raw);
  parsed.version = version;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

export function updateCargoTomlContent(raw, version) {
  let replaced = false;
  const next = raw.replace(
    /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
    (_, prefix, _current, suffix) => {
      replaced = true;
      return `${prefix}${version}${suffix}`;
    }
  );

  if (!replaced) {
    throw new Error("Unable to locate package version in src-tauri/Cargo.toml");
  }

  return next;
}

export async function syncVersionFromTag({
  cwd = repoRoot,
  env = process.env,
  exec = spawnSync,
} = {}) {
  const version = resolveVersionFromTag({ cwd, env, exec });
  const packageJsonPath = path.join(cwd, "package.json");
  const cargoTomlPath = path.join(cwd, "src-tauri", "Cargo.toml");

  const [packageJsonRaw, cargoTomlRaw] = await Promise.all([
    readFile(packageJsonPath, "utf8"),
    readFile(cargoTomlPath, "utf8"),
  ]);

  await Promise.all([
    writeFile(packageJsonPath, updatePackageJsonContent(packageJsonRaw, version)),
    writeFile(cargoTomlPath, updateCargoTomlContent(cargoTomlRaw, version)),
  ]);

  return version;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  syncVersionFromTag()
    .then((version) => {
      console.log(`Synced version from Git tag: ${version}`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
