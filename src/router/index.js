import { createRouter, createWebHistory } from 'vue-router'

// The standalone /splice/ build (VITE_SPLICE_HOME=1) is the SpliceQL/CodonSplice
// product. Its home route is the SpliceQL page and it carries NONE of the
// CNVLens routes. The normal /cnvlens/ build keeps the Dashboard as home, has
// the CNVLens routes, and has NO /splice route — the splice page is a separate
// product served from /splice, not a tab inside CNVLens.
const isSplice = !!import.meta.env.VITE_SPLICE_HOME

const homeComponent = isSplice
  ? () => import('../views/Splice.vue')
  : () => import('../views/Dashboard.vue')

const cnvlensRoutes = [
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
]

const router = createRouter({
  // Pull the base from Vite (set in vite.config.js: base: '/cnvlens/', or
  // VITE_BASE=/splice/ for the standalone build).
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: homeComponent
    },
    // CNVLens routes only exist in the CNVLens build, never in the splice build.
    ...(isSplice ? [] : cnvlensRoutes),
  ]
})

export default router
