module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    quotes: ["error", "double"],
  },
  parserOptions: {
    sourceType: "module",
    project: './tsconfig.json'
  },
  ignorePatterns: ["/node_modules/", "/lib/"],
  parser: "@typescript-eslint/parser",
};
