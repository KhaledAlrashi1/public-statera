import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "JSXAttribute[name.name='className'][value.value=/(^|\\s)bg-white(\\s|$)/]",
          message:
            "Use bg-card or bg-background instead of bg-white (dark mode compatibility)",
        },
        {
          selector:
            "JSXAttribute[name.name='className'][value.value=/(^|\\s)bg-(blue|fuchsia|cyan|emerald|violet|sky|rose|amber|orange|pink|indigo|slate|gray|zinc)-\\d+(\\/\\d+)?(\\s|$)/]",
          message:
            "Use semantic token classes (bg-primary, bg-destructive, bg-success, etc.) instead of palette colors.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'][value.value=/(^|\\s)text-(blue|fuchsia|cyan|emerald|violet|sky|rose|amber|orange|pink|indigo|slate)-\\d{3}(\\/\\d+)?(\\s|$)/]",
          message:
            "Use semantic token classes instead of palette colors.",
        },
      ],
    },
  },
]
