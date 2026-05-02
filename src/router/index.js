import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  // Pull the base from Vite (set in vite.config.js: base: '/cnvlens/').
  // Falls back to '/' when BASE_URL isn't defined.
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('../views/Dashboard.vue')
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
  ]
})

export default router
