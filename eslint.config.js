import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", ".scratch/**", ".agents/**", ".claude/**", "**/fixtures/**"] },
  ...tseslint.configs.recommended,
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["electron", "electron/*"], message: "core must not import Electron." }] },
      ],
    },
  },
);
