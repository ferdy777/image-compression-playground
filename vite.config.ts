import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __RELEASE__: JSON.stringify(process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? "local"),
  },
});
