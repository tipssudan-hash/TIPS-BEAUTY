import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  define: {
    __DEV__: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "react-native": "react-native-web",
      "expo-constants": path.resolve(__dirname, "./tests/mocks/expo-constants.ts"),
      "@react-native-async-storage/async-storage": path.resolve(__dirname, "./tests/mocks/async-storage.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/drug-index/**"],
  },
});
