import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist", "renderer"), { recursive: true });
cpSync(join(root, "src", "renderer"), join(root, "dist", "renderer"), { recursive: true });
console.log("renderer assets copied");
