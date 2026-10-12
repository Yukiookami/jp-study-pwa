<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Smartphone } from 'lucide-vue-next';
const dialog = ref<HTMLDialogElement>();
function updateOrientation() {
  // Screen orientation stays stable when a portrait phone opens its keyboard.
  const legacyAngle = (window as Window & { orientation?: number }).orientation;
  const landscape = screen.orientation?.type
    ? screen.orientation.type.startsWith('landscape')
    : typeof legacyAngle === 'number'
      ? Math.abs(legacyAngle) === 90
      : screen.width > screen.height;
  const blocked = matchMedia('(pointer: coarse)').matches && landscape;
  if (blocked && !dialog.value?.open) dialog.value?.showModal();
  else if (!blocked && dialog.value?.open) dialog.value.close();
}
onMounted(() => {
  updateOrientation();
  screen.orientation?.addEventListener('change', updateOrientation);
  window.addEventListener('orientationchange', updateOrientation);
  window.addEventListener('resize', updateOrientation);
});
onUnmounted(() => {
  screen.orientation?.removeEventListener('change', updateOrientation);
  window.removeEventListener('orientationchange', updateOrientation);
  window.removeEventListener('resize', updateOrientation);
  dialog.value?.close();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="portrait-guard"
    aria-labelledby="portrait-title"
    aria-describedby="portrait-description"
    @cancel.prevent
  >
    <div class="portrait-message">
      <Smartphone :size="48" aria-hidden="true" />
      <h2 id="portrait-title">把手机竖起来，继续整两句</h2>
      <p id="portrait-description">刚才的卡片还在，转回来就能接着看。</p>
    </div>
  </dialog>
</template>
