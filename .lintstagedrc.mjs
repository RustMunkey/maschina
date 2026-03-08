import { existsSync } from "node:fs";

// Filter helper — lint-staged 15 can temporarily drop newly-tracked files
// from disk during its stash/restore cycle. Filter to only existing files
// before passing to formatters/linters.
const existing = (files) => files.filter(existsSync);

export default {
  "*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc}": ["biome check --write --no-errors-on-unmatched"],

  "*.py": (files) => {
    const ex = existing(files);
    if (!ex.length) return [];
    const paths = ex.join(" ");
    return [`ruff check --fix ${paths}`, `ruff format ${paths}`];
  },

  "*.rs": (files) => {
    const ex = existing(files);
    if (!ex.length) return [];
    return [`rustfmt --edition 2021 ${ex.join(" ")}`];
  },
};
