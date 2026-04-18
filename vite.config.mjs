import path from "node:path";
import fs from "node:fs";
import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const projectRoot = path.resolve(__dirname);
const sourceRoot = path.resolve(projectRoot, "src/site");
const DEV_CDN_HOST = "https://media.bustarefrigeration.co.ke";

const inputPages = {
  index: path.resolve(sourceRoot, "index.html"),
  "projects-clients/index": path.resolve(sourceRoot, "projects-clients/index.html"),
  "spares-components/index": path.resolve(sourceRoot, "spares-components/index.html"),
  "privacy/index": path.resolve(sourceRoot, "privacy/index.html"),
  "legal-notice/index": path.resolve(sourceRoot, "legal-notice/index.html"),
  "404": path.resolve(sourceRoot, "404.html")
};

const staticTargets = [
  ".htaccess",
  "api.php",
  "sitemap.xml",
  "bundles",
  "cgi-bin",
  "g",
  "images",
  "webcard",
  "vendor"
]
  .map((entry) => path.resolve(projectRoot, entry))
  .filter((absolutePath) => fs.existsSync(absolutePath))
  .map((absolutePath) => ({
    src: absolutePath,
    dest: "."
  }));

// Copy section/page CSS files that are served as runtime @import urls
staticTargets.push({
  src: path.resolve(sourceRoot, "styles"),
  dest: "."
});

// Copy custom JavaScript module
staticTargets.push({
  src: path.resolve(sourceRoot, "scripts"),
  dest: "."
});

function devRouteAndAssetParityPlugin() {
  const extensionlessPageRoutes = new Set([
    "/projects-clients",
    "/spares-components",
    "/privacy",
    "/legal-notice"
  ]);

  return {
    name: "dev-route-and-asset-parity",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url || "/";
        const pathname = rawUrl.split("?")[0];

        if (extensionlessPageRoutes.has(pathname)) {
          res.statusCode = 302;
          res.setHeader("Location", `${pathname}/`);
          res.end();
          return;
        }

        next();
      });
    },
    transformIndexHtml(html) {
      return html.replaceAll(`${DEV_CDN_HOST}/images/`, "/images/");
    }
  };
}

export default defineConfig({
  root: sourceRoot,
  css: {
    devSourcemap: true,
    postcss: path.resolve(projectRoot, "postcss.config.cjs")
  },
  build: {
    outDir: path.resolve(projectRoot, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    cssMinify: false,
    rollupOptions: {
      output: {
        sourcemapExcludeSources: false
      },
      input: inputPages
    }
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: false
  },
  plugins: [
    devRouteAndAssetParityPlugin(),
    viteStaticCopy({
      targets: staticTargets
    })
  ]
});
