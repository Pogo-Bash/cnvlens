import { createRouter, createWebHistory } from 'vue-router'

// For the standalone /splice/ build (VITE_SPLICE_HOME=1) the home route is the
// SpliceQL page, so `/splice` serves it directly; the normal /cnvlens/ build
// keeps the Dashboard as home.
const homeComponent = import.meta.env.VITE_SPLICE_HOME
  ? () => import('../views/Splice.vue')
  : () => import('../views/Dashboard.vue')

const router = createRouter({
  // Pull the base from Vite (set in vite.config.js: base: '/cnvlens/').
  // Falls back to '/' when BASE_URL isn't defined.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: homeComponent
    },
    {
      path: '/data-browser',
      name: 'DataBrowser',
      component: () => import('../views/DataBrowser.vue')
    },
    {
      path: '/variant-calling',
      name: 'VariantCalling',
      component: () => import('../views/VariantCalling.vue')
    },
    {
      path: '/cnv-analysis',
      name: 'CNVAnalysis',
      component: () => import('../views/CNVAnalysis.vue')
    },
    {
      path: '/visualization',
      name: 'Visualization',
      component: () => import('../views/Visualization.vue')
    },
    {
      path: '/diagnostics',
      name: 'Diagnostics',
      component: () => import('../views/Diagnostics.vue')
    },
    {
      path: '/docs',
      name: 'Documentation',
      component: () => import('../views/Documentation.vue')
    },
    {
      path: '/splice',
      name: 'Splice',
      component: () => import('../views/Splice.vue')
    },
  ]
})

export default router
