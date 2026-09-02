import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],

    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },

    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./src/test/setup.ts"],
        include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
        exclude: [
            "tests/e2e/**",
            "**/node_modules/**",
            "**/.git/**",
            "**/.cache/**",
            "**/coverage/**",
            "**/dist/**",
            "**/build/**",
            "**/.next/**",
            "**/playwright-report/**",
            "**/test-results/**",
        ],

        coverage: {
            provider: "v8",
            reporter: ["text", "html", "lcov"],
        },
    },
});