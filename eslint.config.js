import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        WORKER_PATH: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { 
        "vars": "all", 
        "args": "after-used", 
        "ignoreRestSiblings": false 
      }],
      "no-unreachable": "error",
      "no-undef": "error",
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    }
  },
  {
    // Ignore build artifacts or vendor folders if any
    ignores: ["dist/**", "node_modules/**", ".gemini/tmp/**"],
  },
  {
    files: ["tests/**"],
    languageOptions: {
      globals: {
        ...globals.vitest,
      },
    },
  }
];
