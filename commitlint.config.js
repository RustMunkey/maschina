export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allow longer subject lines for detailed commits
    "header-max-length": [2, "always", 100],
    // Enforce conventional type list
    "type-enum": [
      2,
      "always",
      [
        "feat",     // new feature
        "fix",      // bug fix
        "docs",     // documentation only
        "style",    // formatting, no logic change
        "refactor", // code restructuring, no feature/fix
        "perf",     // performance improvement
        "test",     // adding or updating tests
        "build",    // build system or deps
        "ci",       // CI/CD changes
        "chore",    // maintenance
        "revert",   // revert a commit
        "wip",      // work in progress (squash before merge)
      ],
    ],
  },
};
