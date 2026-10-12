import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
// Safari also exposes gesture events; cancel zoom without blocking one-finger scrolling.
for (const name of ['gesturestart', 'gesturechange']) {
  document.addEventListener(name, (event) => event.preventDefault(), { passive: false });
}
document.addEventListener(
  'touchmove',
  (event) => {
    if (event.touches.length > 1) event.preventDefault();
  },
  { passive: false },
);

// A refresh starts at home; filters remain in memory only. Saved review data stays in IndexedDB.
const navigation = performance.getEntriesByType('navigation')[0] as
  | PerformanceNavigationTiming
  | undefined;
if (navigation?.type === 'reload') history.replaceState(null, '', '/today');

// Keep existing bookmarked Hash links working after switching to History.
if (location.hash.startsWith('#/')) {
  history.replaceState(null, '', location.hash.slice(1));
}
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<span />' } }],
});
createApp(App).use(createPinia()).use(router).mount('#app');
