import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './style.css';
// Keep existing bookmarked Hash links working after switching to History.
if (location.hash.startsWith('#/')) {
  history.replaceState(null, '', location.hash.slice(1));
}
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<span />' } }],
});
createApp(App).use(createPinia()).use(router).mount('#app');
