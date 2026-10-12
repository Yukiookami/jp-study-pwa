<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { groupLearningItems, type Item } from '@jp-study/shared';
import { http, message } from '../api';
import { cachedItems } from '../storage';
import ItemCard from './ItemCard.vue';
const props = defineProps<{ topic?: string }>();
const emit = defineEmits<{ close: []; topic: [tag: string]; favorite: [item: Item] }>();
const dialog = ref<HTMLDialogElement>();
const items = ref<Item[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');
const offline = ref(false);
const topicNotice = ref(false);
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function openTopic(tag: string) {
  if (tag !== props.topic) {
    emit('topic', tag);
    return;
  }
  topicNotice.value = true;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    topicNotice.value = false;
  }, 1800);
}
let generation = 0;
let controller: AbortController | undefined;
let previousOverflow: string | undefined;
async function load(append = false) {
  const topic = props.topic;
  if (!topic || loading.value) return;
  const current = ++generation;
  const requestedPage = append ? page.value + 1 : 1;
  controller?.abort();
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    if (!navigator.onLine) throw new Error('当前离线');
    const { data } = await http.get('/items', {
      params: { type: 'expression', tag: topic, page: requestedPage, page_size: 20 },
      signal: controller.signal,
    });
    if (current !== generation) return;
    items.value = groupLearningItems(append ? [...items.value, ...data.data] : data.data);
    total.value = data.meta.total;
    page.value = requestedPage;
    offline.value = false;
  } catch (cause) {
    if (current !== generation) return;
    const cached = await cachedItems();
    if (current !== generation) return;
    if (cached.length) {
      const related = groupLearningItems(
        cached.filter((item) => item.item_type === 'expression' && item.tags.includes(topic)),
      );
      items.value = related.slice(0, requestedPage * 20);
      total.value = related.length;
      page.value = requestedPage;
      offline.value = true;
    } else error.value = message(cause);
  } finally {
    if (current === generation) loading.value = false;
  }
}
function restoreScroll() {
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = undefined;
  }
}
function close() {
  dialog.value?.close();
  emit('close');
}
function backdrop(event: MouseEvent) {
  if (event.target !== dialog.value) return;
  const rect = dialog.value.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    close();
}
watch(
  () => props.topic,
  async (topic) => {
    generation++;
    controller?.abort();
    loading.value = false;
    if (!topic) {
      items.value = [];
      total.value = 0;
      dialog.value?.close();
      restoreScroll();
      return;
    }
    items.value = [];
    total.value = 0;
    page.value = 1;
    offline.value = false;
    error.value = '';
    await nextTick();
    if (!dialog.value?.open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.value?.showModal();
    }
    dialog.value?.querySelector('.related-body')?.scrollTo(0, 0);
    void load();
  },
  { immediate: true },
);
onUnmounted(() => {
  generation++;
  controller?.abort();
  clearTimeout(noticeTimer);
  restoreScroll();
});
</script>
<template>
  <dialog
    ref="dialog"
    class="related-dialog"
    aria-labelledby="related-title"
    @cancel.prevent="close"
    @click="backdrop"
    @close="restoreScroll"
  >
    <header class="related-header">
      <div>
        <span class="eyebrow">翻翻相关表达</span>
        <h2 id="related-title">{{ topic?.replace('主题：', '') }}</h2>
      </div>
      <button class="icon" aria-label="关闭相关表达" autofocus @click="close">
        <X :size="22" />
      </button>
    </header>
    <p v-if="topicNotice" class="related-toast" role="status">已经在看这个主题啦</p>
    <div class="related-body" :aria-busy="loading">
      <p class="small">关掉就回到刚才的卡片。<span v-if="offline">当前仅查看已下载内容。</span></p>
      <p v-if="loading && !items.length" class="empty" role="status">相关表达马上来…</p>
      <ItemCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        @favorite="emit('favorite', $event)"
        @topic="openTopic"
      />
      <p v-if="!loading && !error && !items.length" class="empty">
        {{ offline ? '已下载内容里还没有相关表达。' : '还没有收录相关表达。' }}
      </p>
      <div v-if="error" class="alert" role="alert">
        <p>{{ error }}</p>
        <button class="subtle" @click="load(items.length > 0)">再试一次</button>
      </div>
      <button
        v-if="items.length && items.length < total && !error"
        class="subtle"
        :disabled="loading"
        @click="load(true)"
      >
        {{ loading ? '正在加载…' : '再看一些' }}
      </button>
    </div>
  </dialog>
</template>
