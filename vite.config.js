import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The standalone /splice/ build (VITE_SPLICE_HOME=1) is the SpliceQL/CodonSplice
// product. It must NOT inherit CNVLens's <head>, robots.txt, or sitemap.xml —
// otherwise crawlers/AI fetching /splice read CNVLens metadata and links.
const isSplice = !!process.env.VITE_SPLICE_HOME

// Replaces everything between the SEO:START / SEO:END markers in index.html.
const spliceSeoHead = `
    <link rel="icon" type="image/svg+xml" href="/splice/favicon.svg" />
    <title>SpliceQL / CodonSplice — a SQL-like query language for genomic files</title>
    <meta name="description" content="SpliceQL is a small, SQL-like query language for genomic files. Point a .spq query at a BAM, VCF, BED, or FASTA and get variants, coverage, or reads back — on the command line, compiled to a standalone binary, or in the browser via WebAssembly. CodonSplice is the engine that compiles SpliceQL to bytecode and runs it on a stack VM.">

    <link rel="canonical" href="https://swapdoesbioandis-a.dev/splice">

    <meta property="og:type" content="website">
    <meta property="og:title" content="SpliceQL / CodonSplice — a SQL-like query language for genomic files">
    <meta property="og:description" content="Write SpliceQL, point it at a BAM/VCF/BED/FASTA, and get variants, coverage, or reads back — on the CLI, compiled to a standalone binary, or in the browser via WebAssembly.">
    <meta property="og:url" content="https://swapdoesbioandis-a.dev/splice">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="SpliceQL / CodonSplice — a SQL-like query language for genomic files">
    <meta name="twitter:description" content="A small, SQL-like query language for genomic files. CodonSplice compiles it to bytecode and runs it on a stack VM.">

    <meta name="theme-color" content="#1e1e2e">

    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "SpliceQL / CodonSplice",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "macOS, Linux, Web Browser",
      "description": "SpliceQL is a small, SQL-like query language for genomic files (BAM, VCF, BED, FASTA). CodonSplice is the engine that compiles SpliceQL to bytecode and runs it on a stack VM, available as a CLI, a standalone binary, or in the browser via WebAssembly.",
      "url": "https://swapdoesbioandis-a.dev/splice",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "author": { "@type": "Person", "name": "Swap" }
    }
    </script>
`

const spliceRobots = `User-agent: *
Allow: /

Sitemap: https://swapdoesbioandis-a.dev/splice/sitemap.xml
`

const spliceSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://swapdoesbioandis-a.dev/splice</loc>
    <lastmod>2026-06-26</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`

export default defineConfig({
  // App is served from /cnvlens/ in production (nginx Docker image).
  // Set this here so Vite emits asset URLs with the right prefix.
  // VITE_BASE overrides it for the standalone /splice/ build (host nginx static).
  base: process.env.VITE_BASE || '/cnvlens/',

  plugins: [
    vue(),

    // Swap CNVLens SEO/robots/sitemap for SpliceQL ones in the /splice build.
    isSplice && {
      name: 'splice-seo',
      transformIndexHtml(html) {
        return html.replace(
          /<!-- SEO:START[\s\S]*?<!-- SEO:END -->/,
          `<!-- SEO:START -->${spliceSeoHead}    <!-- SEO:END -->`
        )
      },
      writeBundle(options) {
        const dir = options.dir || 'dist'
        writeFileSync(join(dir, 'robots.txt'), spliceRobots)
        writeFileSync(join(dir, 'sitemap.xml'), spliceSitemap)
      },
    },

    // Custom plugin to ensure CORS headers on all responses
    {
      name: 'configure-cors-headers',
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
          next()
        })
      },
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
          next()
        })
      }
    }
  ],

  server: {
    host: '0.0.0.0', // Bind to all interfaces for Render
    port: process.env.PORT || 3000, // Use Render's PORT env variable
    // Proxy for TCGA/ICGC APIs (avoid CORS)
    proxy: {
      '/api/gdc': {
        target: 'https://api.gdc.cancer.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gdc/, ''),
      },
      '/api/icgc': {
        target: 'https://dcc.icgc.org/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/icgc/, ''),
      },
    },
  },

  preview: {
    host: '0.0.0.0', // Also for production preview
    port: process.env.PORT || 3000,
    strictPort: true, // Exit if port is already in use
    // Allow Render and other hosting platforms
    allowedHosts: [
      '.onrender.com', // Render domains
      'localhost',
      '127.0.0.1',
    ],
  },

  build: {
    target: 'esnext',
    // Don't inline WASM files
    assetsInlineLimit: 0,
  },

  // Module workers so the worker can `import` the wasm-bindgen glue.
  worker: {
    format: 'es',
  },
})
