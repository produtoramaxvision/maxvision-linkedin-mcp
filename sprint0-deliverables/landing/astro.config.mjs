import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: "https://linkedin.produtoramaxvision.com.br",
  output: "server",
  adapter: cloudflare({
    platformProxy: { enabled: true },
    imageService: "compile",
  }),
  integrations: [tailwind()],
  vite: {
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
  },
});
