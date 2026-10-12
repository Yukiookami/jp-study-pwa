<script setup lang="ts">
import { connectContent, refreshDownloaded } from './content-sync';
import type { ContentStatus } from '@jp-study/shared';
import { newEventId } from './uuid';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import {
  BookOpen,
  Home,
  Search,
  Settings,
  ArrowLeft,
  ArrowRight,
  Download,
  RefreshCw,
  WifiOff,
  Check,
  Flower2,
  Bookmark,
} from 'lucide-vue-next';
import { useRegisterSW } from 'virtual:pwa-register/vue';
import {
  matches,
  learningTopic,
  groupLearningItems,
  type Item,
  type LessonSummary,
  type LessonDetail,
  type Queue,
  type Rating,
} from '@jp-study/shared';
import ItemCard from './components/ItemCard.vue';
import RelatedExpressions from './components/RelatedExpressions.vue';
import PortraitGuard from './components/PortraitGuard.vue';
import { get, http, message, sync } from './api';
import {
  cache,
  cachedItems,
  downloaded,
  saveLesson,
  removeLesson,
  pending,
  session,
  recordAnswer,
  deviceId,
} from './storage';
const route = useRoute();
const relatedTopics = ref<string[]>([]);
const appToast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(text: string) {
  appToast.value = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    appToast.value = '';
  }, 2400);
}
const contentState = ref<ContentStatus>();
const contentError = ref('');
const group = ref<'all' | 'lesson' | 'life'>('all');
let contentConnection: ReturnType<typeof connectContent> | undefined;
const visibleLessons = computed(() =>
  lessons.value.filter((l) => group.value === 'all' || (l.kind ?? 'lesson') === group.value),
);
const secureContext = window.isSecureContext;
const view = computed(() => route.path.split('/')[1] || 'today');
watch(view, () => {
  relatedTopics.value = [];
  void nextTick(() => {
    document.body.style.overflow = '';
  });
});
const lessonId = computed(() => decodeURIComponent(route.path.split('/')[2] ?? ''));
const online = ref(navigator.onLine),
  busy = ref(false),
  notice = ref(''),
  pendingCount = ref(0),
  syncError = ref('');
const home = ref<{
  today: string;
  due_count: number;
  pending_count: number;
  new_available: number;
  completed_today: number;
  recent_lessons: LessonSummary[];
  server_time: string;
}>();
const lessons = ref<LessonSummary[]>([]),
  detail = ref<LessonDetail>(),
  items = ref<Item[]>([]),
  savedIds = ref<string[]>([]);
const lessonQuery = ref('');
const query = ref(''),
  type = ref<'expression' | 'vocabulary'>('expression'),
  favorites = ref(false),
  page = ref(1),
  total = ref(0),
  offlineSearch = ref(false),
  tags = ref('');
const quota = ref(10),
  queue = ref<Queue>(),
  flipped = ref(false),
  reviewStarted = ref(false),
  reviewFinished = ref(false),
  reviewFilter = ref('all');
const reviewLesson = ref('');
const queueNotice = ref('');
const otherCardsAvailable = ref(false);
watch([reviewFilter, reviewLesson], () => {
  queueNotice.value = '';
  otherCardsAvailable.value = false;
});
const card = computed(() => queue.value?.cards[0]);
const reviewTotal = computed(() => queue.value?.initial_count ?? queue.value?.cards.length ?? 0);
const reviewDone = computed(() =>
  Math.max(0, reviewTotal.value - (queue.value?.cards.length ?? 0)),
);
const homeRemaining = computed(() =>
  online.value
    ? (home.value?.pending_count ?? 0)
    : (queue.value?.cards.length ?? home.value?.pending_count ?? 0),
);
const mascotMood = computed(() => {
  if (view.value === 'review')
    return queueNotice.value
      ? 'ready'
      : reviewFinished.value
        ? 'happy'
        : card.value
          ? 'thinking'
          : 'ready';
  if (!home.value) return 'ready';
  if (homeRemaining.value > 0) return 'thinking';
  if (home.value.completed_today > 0 && home.value.due_count + home.value.new_available === 0)
    return 'happy';
  return home.value.completed_today > 0 ? 'thinking' : 'ready';
});
const mascotSrc = computed(() =>
  mascotMood.value === 'happy' ? '/icons/mark.svg' : `/icons/mark-${mascotMood.value}.svg`,
);

const list = computed(() =>
  groupLearningItems(
    detail.value
      ? (type.value === 'expression' ? detail.value.expressions : detail.value.vocabulary).filter(
          (i) => matches(i, lessonQuery.value),
        )
      : items.value,
  ),
);
const catalogTags = ref<string[]>([]);
const availableTags = computed(() => [
  ...new Set([
    ...catalogTags.value,
    ...(tags.value ? [tags.value] : []),
    ...(detail.value
      ? [...detail.value.expressions, ...detail.value.vocabulary]
      : items.value
    ).flatMap((i) => i.tags),
  ]),
]);
const { needRefresh, updateServiceWorker } = useRegisterSW();
const searchLoading = ref(false);
const loadMoreFailed = ref(false);
const loadTarget = ref<HTMLElement>();
const hasMore = computed(() => items.value.length < total.value && page.value * 20 < total.value);
let listObserver: IntersectionObserver | undefined;
watch(
  loadTarget,
  (target) => {
    listObserver?.disconnect();
    if (!target) return;
    listObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: '240px' },
    );
    listObserver.observe(target);
  },
  { flush: 'post' },
);
function receiveItems(batch: Item[], requestedPage: number) {
  items.value =
    requestedPage === 1
      ? batch
      : [
          ...new Map(
            [...items.value, ...batch].map((item) => [item.item_type + ':' + item.id, item]),
          ).values(),
        ];
}
async function loadMore() {
  if (view.value !== 'library' || searchLoading.value || loadMoreFailed.value || !hasMore.value)
    return;
  const requestedPage = page.value + 1;
  page.value = requestedPage;
  try {
    await loadSearch();
  } catch (error) {
    if (page.value === requestedPage) {
      page.value--;
      loadMoreFailed.value = true;
      notice.value = message(error);
    }
  }
}
let searchGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
async function task(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true;
  notice.value = '';
  try {
    await action();
  } catch (e) {
    notice.value = message(e);
  } finally {
    busy.value = false;
  }
}
async function updatePending() {
  pendingCount.value = (await pending()).length;
  savedIds.value = (await downloaded()).map((l) => l.lesson.id);
}
async function synchronize() {
  await updatePending();
  if (!navigator.onLine) return;
  try {
    syncError.value = (await sync()).join('；');
    await updatePending();
  } catch (e) {
    syncError.value = message(e);
  }
}
async function loadHome() {
  home.value = await get('/home');
  queue.value = await session();
}
async function loadSearch() {
  const generation = ++searchGeneration;
  const requestedPage = page.value;
  searchLoading.value = true;
  let success = false;
  const params = new URLSearchParams({
    q: query.value,
    type: type.value,
    page: String(page.value),
    page_size: '20',
    ...(favorites.value ? { favorite: 'true' } : {}),
    ...(tags.value ? { tag: tags.value } : {}),
  });
  try {
    const { data } = await http.get('/items?' + params);
    if (generation !== searchGeneration) return;
    receiveItems(data.data, requestedPage);
    success = true;
    // Older servers may omit the catalog: keep known options through list resets.
    catalogTags.value = data.meta.available_tags ?? [
      ...new Set([...catalogTags.value, ...data.data.flatMap((item: Item) => item.tags)]),
    ];
    total.value = data.meta.total;
    offlineSearch.value = false;
  } catch (e) {
    if (!savedIds.value.length) throw e;
    const allCached = groupLearningItems(await cachedItems());
    catalogTags.value = [...new Set(allCached.flatMap((i) => i.tags))];
    const cached = allCached.filter(
      (i) =>
        i.item_type === type.value &&
        matches(i, query.value) &&
        (!favorites.value || i.favorited) &&
        (!tags.value || i.tags.includes(tags.value)),
    );
    if (generation !== searchGeneration) return;
    receiveItems(cached.slice((requestedPage - 1) * 20, requestedPage * 20), requestedPage);
    success = true;
    total.value = cached.length;
    offlineSearch.value = true;
  } finally {
    if (generation === searchGeneration) {
      searchLoading.value = false;
      if (success)
        void nextTick(() => {
          if (loadTarget.value && loadTarget.value.getBoundingClientRect().top < innerHeight + 240)
            void loadMore();
        });
    }
  }
}
async function load() {
  notice.value = '';
  detail.value = undefined;
  if (view.value === 'lesson') lessonQuery.value = '';
  try {
    if (view.value === 'today') {
      await loadHome();
    } else if (view.value === 'lessons') lessons.value = await get('/lessons?page_size=100');
    else if (view.value === 'lesson') {
      try {
        detail.value = await get('/lessons/' + lessonId.value);
      } catch (e) {
        detail.value = (await downloaded()).find((l) => l.lesson.id === lessonId.value);
        if (!detail.value) throw e;
      }
    } else if (view.value === 'library') {
      searchLoading.value = true;
      page.value = 1;
      loadMoreFailed.value = false;
      lessons.value = await get('/lessons?page_size=100');
      await loadSearch();
    } else if (view.value === 'settings')
      quota.value = (await get<{ daily_new_limit: number }>('/settings')).daily_new_limit;
    else if (view.value === 'review') {
      lessons.value = await get<LessonSummary[]>('/lessons?page_size=100').catch(
        () => [] as LessonSummary[],
      );
      reviewLesson.value = typeof route.query.lesson === 'string' ? route.query.lesson : '';
      queue.value = await session();
      if (queue.value && queue.value.initial_count === undefined) {
        queue.value.initial_count = queue.value.cards.length;
        await session(queue.value);
      }
      reviewStarted.value = !!queue.value?.cards.length;
      reviewFinished.value = false;
      flipped.value = false;
    }
  } catch (e) {
    notice.value = message(e);
    if (view.value === 'library') searchLoading.value = false;
  }
}
watch(() => route.fullPath, load);
watch([query, type, favorites, tags], () => {
  page.value = 1;
  if (view.value === 'library') {
    searchGeneration++;
    searchLoading.value = true;
    loadMoreFailed.value = false;
    items.value = [];
    total.value = 0;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadSearch().catch((e) => (notice.value = message(e))), 250);
  }
});
function showTopic(tag: string) {
  relatedTopics.value.push(tag);
}

async function favorite(item: Item) {
  await task(async () => {
    await http.request({
      method: item.favorited ? 'DELETE' : 'PUT',
      url: `/favorites/${item.item_type}/${item.id}`,
      data: {},
    });
    item.favorited = !item.favorited;
    const all = await downloaded();
    for (const l of all) {
      for (const i of [...l.expressions, ...l.vocabulary])
        if (i.id === item.id) i.favorited = item.favorited;
      await saveLesson(l);
      await cache('/lessons/' + l.lesson.id, l);
    }
    if (detail.value) await cache('/lessons/' + detail.value.lesson.id, detail.value);
    if (view.value === 'library' && favorites.value) {
      page.value = 1;
      await loadSearch();
    }
    notice.value = item.favorited ? '已加入收藏' : '已取消收藏';
  });
}
async function download() {
  await task(async () => {
    if (!detail.value) return;
    const latest = await http.get('/lessons/' + detail.value.lesson.id);
    await saveLesson(latest.data.data);
    await updatePending();
    notice.value = '这一课已下载，可以离线查看。';
  });
}
async function importLessons() {
  await task(async () => {
    const { data } = await http.post('/lessons/import', {});
    const failed = data.data.results.filter((r: { status: string }) => r.status === 'failed');
    notice.value = failed.length
      ? '部分课程未更新：' + failed.map((r: { message: string }) => r.message).join('；')
      : '课程已更新';
    lessons.value = await get('/lessons?page_size=100');
  });
}
async function start() {
  await task(async () => {
    queueNotice.value = '';
    otherCardsAvailable.value = false;
    try {
      await synchronize();
      if (pendingCount.value > 0) throw new Error('请先同步已保存的答题，再领取下一组。');
      const { data } = await http.post('/review/queue', {
        limit: 20,
        ...(reviewFilter.value === 'all' ? {} : { card_types: [reviewFilter.value] }),
        ...(reviewLesson.value ? { lesson_id: reviewLesson.value } : {}),
      });
      queue.value = { ...data.data, initial_count: data.data.cards.length };
      await session(queue.value!);
      reviewStarted.value = true;
      reviewFinished.value = !queue.value!.cards.length;
      flipped.value = false;
      if (!queue.value!.cards.length) {
        const status = await get<NonNullable<typeof home.value>>('/home').catch(() => undefined);
        otherCardsAvailable.value =
          !!status && status.due_count + status.new_available + status.pending_count > 0;
        queueNotice.value = otherCardsAvailable.value
          ? `当前筛选范围没有可领的卡片。${status?.pending_count ? `还有 ${status.pending_count} 张已领取卡片待完成，` : ''}可以切换到混合复习看看。`
          : status
            ? '目前没有到期卡片，也没有可领的新卡。可以稍后再来，或在设置里调整每天的新卡数量。'
            : '这次没有领到卡片，可能是当前筛选没有内容或今日新卡额度已用完。';
      }
    } catch (cause) {
      queueNotice.value = message(cause);
    }
  });
}
async function startMixed() {
  reviewFilter.value = 'all';
  reviewLesson.value = '';
  await nextTick();
  await start();
}

async function saveSettings() {
  await task(async () => {
    try {
      const { data } = await http.put('/settings', { daily_new_limit: quota.value });
      quota.value = data.data.daily_new_limit;
      await cache('/settings', data.data);
      showToast(`记好了，每天 ${quota.value} 张新卡！`);
    } catch (cause) {
      showToast(message(cause));
    }
  });
}
async function cancelReview() {
  if (!queue.value?.cards.length) return;
  await task(async () => {
    try {
      await synchronize();
      if (pendingCount.value > 0) throw new Error('还有答题没同步，请先联网同步后再取消。');
      const { data } = await http.post('/review/cancel', {
        card_ids: queue.value!.cards.map((card) => card.id),
      });
      const empty = { ...queue.value!, cards: [], initial_count: 0 };
      await session(empty);
      queue.value = empty;
      flipped.value = false;
      reviewStarted.value = false;
      reviewFinished.value = false;
      queueNotice.value = '';
      relatedTopics.value = [];
      showToast(
        data.data.released_new_cards
          ? `本组已取消，退回 ${data.data.released_new_cards} 张未作答新卡。`
          : '本组已取消，已作答的进度照常保留。',
      );
    } catch (cause) {
      showToast(message(cause));
    }
  });
}
async function rate(rating: Rating) {
  await task(async () => {
    if (!card.value || !flipped.value) return;
    const rest = { ...queue.value!, cards: queue.value!.cards.slice(1) };
    await recordAnswer(
      {
        event_id: newEventId(),
        card_id: card.value.id,
        rating,
        answered_at: new Date().toISOString(),
        device_id: await deviceId(),
        algorithm_version: 1,
      },
      rest,
    );
    queue.value = rest;
    flipped.value = false;
    reviewFinished.value = !rest.cards.length;
    await updatePending();
    void synchronize();
  });
}
async function refreshConnection() {
  online.value = navigator.onLine;
  await synchronize();
  if (view.value === 'today') await loadHome().catch(() => {});
}
async function changedContent() {
  await synchronize();
  await refreshDownloaded();
  await updatePending();
  contentError.value = '';
  if (view.value === 'today') await loadHome();
  else if (view.value === 'lessons' || view.value === 'library') {
    lessons.value = await get('/lessons?page_size=100');
    if (view.value === 'library') {
      page.value = 1;
      await loadSearch();
    }
  } else if (view.value === 'lesson') {
    const id = lessonId.value;
    const latest = await http.get('/lessons/' + id);
    if (view.value === 'lesson' && lessonId.value === id) detail.value = latest.data.data;
  }
  // Keep the active review queue fixed; content refresh never replaces unsent answers.
}
onMounted(async () => {
  await updatePending();
  await load();
  void synchronize();
  contentConnection = connectContent({
    onChange: changedContent,
    onStatus: (value) => {
      contentState.value = value;
    },
    onError: (value) => {
      contentError.value = value;
    },
  });
  window.addEventListener('online', refreshConnection);
  window.addEventListener('offline', refreshConnection);
});
onUnmounted(() => {
  clearTimeout(toastTimer);
  contentConnection?.stop();
  listObserver?.disconnect();
  searchGeneration++;
  clearTimeout(searchTimer);
  window.removeEventListener('online', refreshConnection);
  window.removeEventListener('offline', refreshConnection);
});
</script>
<template>
  <div class="app-shell">
    <header class="brand">
      <RouterLink to="/today"
        ><img class="brand-mark" :src="mascotSrc" :data-mood="mascotMood" alt="" /><span
          >学什么语<small>今天也整两句日语。</small></span
        ></RouterLink
      ><RouterLink to="/settings" class="icon" aria-label="设置"
        ><Settings :size="21"
      /></RouterLink>
    </header>
    <div v-if="!online" class="connection">
      <WifiOff :size="15" /> 离线模式 · 已下载内容仍可查看
    </div>
    <div v-if="contentState?.error_count" class="alert" role="status">
      {{ contentState.message }}
    </div>
    <div v-if="contentError" class="alert" role="status">{{ contentError }}</div>
    <div v-if="pendingCount" class="connection">
      <RefreshCw :size="15" /> {{ pendingCount }} 条答题已保存，等待同步
      <button @click="task(synchronize)">同步</button>
    </div>
    <div v-if="syncError" class="alert" role="status">{{ syncError }}</div>
    <div v-if="notice" class="alert" role="status">{{ notice }}</div>
    <div v-if="needRefresh" class="connection">
      新版本已准备好 <button :disabled="busy" @click="updateServiceWorker()">更新应用</button>
    </div>
    <main>
      <template v-if="view === 'today'">
        <div class="section-title">
          <span class="eyebrow"
            >{{ home?.today?.replaceAll('-', ' / ') || '今日' }} · 不赶进度，整两句就行</span
          >
          <h1>今天也整两句，<br />说不定就记住了。</h1>
          <p>课堂学的、路上听的，都来这儿碰个头。</p>
        </div>
        <section class="hero">
          <div>
            <span class="eyebrow">记忆热个身</span>
            <h2>
              {{
                homeRemaining
                  ? `还剩 ${homeRemaining} 张`
                  : home && home.due_count + home.new_available + home.pending_count === 0
                    ? '今天这份，搞定啦！'
                    : '看看还记得不？'
              }}
            </h2>
            <p>
              {{
                homeRemaining
                  ? '刚才那组还在，接着来就好。'
                  : mascotMood === 'happy'
                    ? '今天也记住了几句，歇一会儿吧。'
                    : '忘了也没事，见多几次就熟了。'
              }}
            </p>
            <RouterLink class="button cream" to="/review"
              >{{ homeRemaining ? '继续复习' : '整两句' }} <ArrowRight :size="17"
            /></RouterLink>
          </div>
          <div class="hero-flower">
            <img :src="mascotSrc" :data-mood="mascotMood" alt="" /><span>{{
              mascotMood === 'happy' ? 'やった！' : mascotMood === 'thinking' ? 'うーん…' : 'あれ？'
            }}</span>
          </div>
        </section>
        <p v-if="!online && home" class="small">
          缓存状态 · {{ new Date(home.server_time).toLocaleString('zh-CN') }} 更新
        </p>
        <div class="stats">
          <div>
            <strong>{{ home?.due_count ?? '—' }}</strong
            ><span>到期复习</span>
          </div>
          <div>
            <strong>{{ home?.new_available ?? '—' }}</strong
            ><span>今日新卡</span>
          </div>
          <div>
            <strong>{{ home?.completed_today ?? '—' }}</strong
            ><span>今日已完成</span>
          </div>
        </div>
        <div class="list-title">
          <h2>最近捡到的日语</h2>
          <RouterLink to="/lessons">全部课程 <ArrowRight :size="15" /></RouterLink>
        </div>
        <RouterLink
          v-for="(l, index) in home?.recent_lessons"
          :key="l.id"
          :to="'/lesson/' + l.id"
          class="lesson-row"
          ><span class="lesson-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <div>
            <h3>{{ l.title }}</h3>
            <p>{{ l.expression_count }} 个表达 · {{ l.vocabulary_count }} 个单词</p>
          </div>
          <ArrowRight :size="19"
        /></RouterLink>
        <div class="daily-note">
          <span>会一句，算一句 ✦</span>
          <p>今天脑袋装不下？<br />没事，明天再来碰个面。</p>
        </div>
      </template>
      <template v-else-if="view === 'lessons'">
        <div class="section-title">
          <span class="eyebrow">日语收集站</span>
          <h1>都是在哪学的？</h1>
          <p>老师讲的、生活捡的，统统收好。</p>
        </div>
        <div class="toolbar">
          <span>{{ visibleLessons.length }} 份记录</span
          ><button class="subtle" :disabled="busy || !online" @click="importLessons">
            <RefreshCw :size="16" /> 更新课程
          </button>
        </div>
        <div class="segments">
          <button :class="{ active: group === 'all' }" @click="group = 'all'">全部</button
          ><button :class="{ active: group === 'lesson' }" @click="group = 'lesson'">课堂</button
          ><button :class="{ active: group === 'life' }" @click="group = 'life'">生活摘录</button>
        </div>
        <RouterLink
          v-for="(l, index) in visibleLessons"
          :key="l.id"
          :to="'/lesson/' + l.id"
          class="course-card"
          ><span class="eyebrow"
            >{{ l.kind === 'life' ? '生活摘录' : 'LESSON ' + String(index + 1).padStart(2, '0') }} ·
            {{ l.lesson_date }}</span
          >
          <h2>{{ l.title }}</h2>
          <div>
            <span>{{ l.expression_count }} 个表达 · {{ l.vocabulary_count }} 个单词</span
            ><ArrowRight :size="20" />
          </div>
          <span v-if="savedIds.includes(l.id)" class="download-label"
            ><Check :size="13" /> 已离线保存</span
          ></RouterLink
        >
        <p v-if="!visibleLessons.length" class="empty">
          这里还没有记录。在聊天里说“加入生活摘录”，整理保存后会自动更新。
        </p>
      </template>
      <template v-else-if="view === 'lesson'">
        <RouterLink to="/lessons" class="back"><ArrowLeft :size="16" /> 我的课堂</RouterLink>
        <div v-if="detail" class="section-title">
          <span class="eyebrow">{{ detail.lesson.lesson_date }} · 课堂复习</span>
          <h1>{{ detail.lesson.title }}</h1>
          <p>{{ detail.expressions.length }} 个表达 · {{ detail.vocabulary.length }} 个单词</p>
          <button class="subtle" :disabled="busy || !online" @click="download">
            <Download :size="16" />
            {{ savedIds.includes(detail.lesson.id) ? '更新离线内容' : '下载这一课' }}
          </button>
          <p v-if="savedIds.includes(detail.lesson.id)" class="small">
            已保存，可离线查看；联网时自动检查并更新下载内容。
          </p>
        </div>
        <RouterLink v-if="detail" class="subtle" :to="'/review?lesson=' + detail.lesson.id"
          >复习本课 <ArrowRight :size="15"
        /></RouterLink>
        <div class="segments">
          <button :class="{ active: type === 'expression' }" @click="type = 'expression'">
            表达方式</button
          ><button :class="{ active: type === 'vocabulary' }" @click="type = 'vocabulary'">
            单词
          </button>
        </div>
        <label class="search"
          ><Search :size="18" /><input
            v-model="lessonQuery"
            placeholder="搜索日语、中文或原说法"
            aria-label="搜索课程"
        /></label>
        <section v-if="detail?.unresolved.length" class="alert">
          <strong>待确认内容</strong>
          <p v-for="(u, index) in detail.unresolved" :key="index">{{ u.description_zh }}</p>
        </section>
        <template v-for="(item, index) in list" :key="item.id">
          <h2
            v-if="index === 0 || learningTopic(item) !== learningTopic(list[index - 1]!)"
            class="topic-heading"
          >
            {{ learningTopic(item).replace('主题：', '') }}
          </h2>
          <ItemCard :item="item" @favorite="favorite" @topic="showTopic" />
        </template>
        <p v-if="!list.length" class="empty">没有找到相关内容。</p>
      </template>
      <template v-else-if="view === 'library'">
        <div class="section-title">
          <span class="eyebrow">想说就来找</span>
          <h1>这句咋说？</h1>
          <p>脑子里有中文？来找找日语怎么说。</p>
        </div>
        <label class="search"
          ><Search :size="18" /><input
            v-model="query"
            placeholder="例如：伝えば、如果、复习"
            aria-label="搜索学习内容"
        /></label>
        <div class="segments">
          <button :class="{ active: type === 'expression' }" @click="type = 'expression'">
            表达方式</button
          ><button :class="{ active: type === 'vocabulary' }" @click="type = 'vocabulary'">
            单词
          </button>
        </div>
        <div class="toolbar library-filters">
          <button class="subtle" :class="{ selected: favorites }" @click="favorites = !favorites">
            <Bookmark :size="15" /> {{ favorites ? '只看收藏' : '全部内容' }}</button
          ><select v-model="tags" aria-label="主题与标签筛选">
            <option value="">全部主题</option>
            <option v-for="tag in availableTags" :key="tag">{{ tag }}</option>
          </select>
        </div>
        <p class="small">
          {{ searchLoading && !list.length ? '找找看…' : total + ' 个条目' }}
          <span v-if="offlineSearch"> · 当前仅搜索已下载课程</span>
        </p>
        <div class="library-results" :aria-busy="searchLoading">
          <template v-if="searchLoading && !list.length">
            <span class="sr-only" role="status">正在加载学习内容</span>
            <div class="list-skeleton" aria-hidden="true">
              <div class="skeleton-line skeleton-topic"></div>
              <div v-for="placeholder in 3" :key="placeholder" class="item-card skeleton-card">
                <div class="skeleton-line skeleton-label"></div>
                <div class="skeleton-line skeleton-title"></div>
                <div class="skeleton-line skeleton-meaning"></div>
              </div>
            </div>
          </template>
          <template v-else>
            <template v-for="(item, index) in list" :key="item.id">
              <h2
                v-if="index === 0 || learningTopic(item) !== learningTopic(list[index - 1]!)"
                class="topic-heading"
              >
                {{ learningTopic(item).replace('主题：', '') }}
              </h2>
              <ItemCard :item="item" @favorite="favorite" @topic="showTopic" />
            </template>
            <p v-if="!list.length && !searchLoading" class="empty">
              还没找到，换个中文意思或日语说法试试？
            </p>
            <div v-if="hasMore" ref="loadTarget" class="load-more" aria-live="polite">
              <span v-if="searchLoading">再捞几句，马上来…</span>
              <button
                v-else-if="loadMoreFailed"
                class="subtle"
                @click="
                  loadMoreFailed = false;
                  loadMore();
                "
              >
                没加载出来，再试一次
              </button>
              <span v-else>往下滑，还有呢</span>
            </div>
            <p v-else-if="searchLoading" class="small" role="status">找找看…</p>
            <p v-else-if="list.length" class="list-end">这一批都在这儿了 ✦</p>
          </template>
        </div>
      </template>
      <template v-else-if="view === 'review'">
        <RouterLink to="/today" class="back"><ArrowLeft :size="16" /> 今日</RouterLink>
        <div class="section-title">
          <span class="eyebrow">记忆碰碰车</span>
          <h1>
            {{
              queueNotice
                ? '这次没领到卡片'
                : reviewFinished
                  ? '这组拿下，歇会儿！'
                  : '来，跟日语碰个面。'
            }}
          </h1>
          <p>先猜猜，再看答案。忘了也不扣分。</p>
        </div>
        <template v-if="card"
          ><div class="review-progress" role="status">
            <div class="review-progress-top">
              <strong>还剩 {{ queue?.cards.length }} 张</strong
              ><span>本次已完成 {{ reviewDone }} / {{ reviewTotal }}</span>
            </div>
            <progress
              :value="reviewDone"
              :max="Math.max(1, reviewTotal)"
              aria-label="本次复习进度"
            ></progress>
          </div>
          <div class="toolbar">
            <span>{{
              card.card_type === 'correction'
                ? '纠错练习'
                : card.card_type === 'word'
                  ? '单词回想'
                  : '表达回想'
            }}</span>
            <button class="subtle cancel-review" :disabled="busy || !online" @click="cancelReview">
              取消本组
            </button>
          </div>
          <p v-if="!online" class="small">取消本组需要联网，已作答记录会继续保留。</p>
          <section class="review-card">
            <span class="eyebrow">{{
              card.card_type === 'correction'
                ? card.error_kind === 'original'
                  ? '课堂原说法 · 请改成自然表达'
                  : '反推错误示例 · 请改成自然表达'
                : card.card_type === 'word'
                  ? '这个词是什么意思？'
                  : '用日语怎么说？'
            }}</span>
            <h2 :lang="card.card_type === 'expression' ? 'zh' : 'ja'">{{ card.prompt }}</h2>
            <p v-if="!flipped" class="small">别急，让脑袋转一会儿。</p>
            <button v-if="!flipped" class="button" @click="flipped = true">查看答案</button>
            <div v-else class="answer">
              <span class="label">推荐答案</span>
              <h3 lang="ja">{{ card.answer.japanese }}</h3>
              <p v-if="'reading' in card.answer" class="reading">{{ card.answer.reading }}</p>
              <p>{{ card.answer.meaning_zh }}</p>
              <ItemCard
                :key="card.id"
                :item="card.answer"
                expanded
                @favorite="favorite"
                @topic="showTopic"
              />
            </div>
          </section>
          <div v-if="flipped" class="ratings">
            <button :disabled="busy" @click="rate('forgot')">忘了<small>10 分钟后</small></button
            ><button :disabled="busy" @click="rate('partial')">
              有点印象<small>明天再见</small></button
            ><button :disabled="busy" @click="rate('remembered')">
              记住了<small>间隔复习</small>
            </button>
          </div></template
        >
        <template v-else
          ><div class="empty-art"><Flower2 :size="80" :stroke-width="1" /></div>
          <p class="empty">
            {{
              reviewFinished
                ? '这组搞定啦！答题已经记在这台设备上。'
                : '不用一口气背完，今天先认识几张。'
            }}
          </p>
          <div class="review-filters">
            <label class="field-label"
              >练点什么
              <select v-model="reviewFilter" aria-label="复习类型">
                <option value="all">混合复习</option>
                <option value="word">单词</option>
                <option value="expression">表达方式</option>
                <option value="correction">纠错</option>
              </select>
            </label>
            <label class="field-label"
              >从哪儿挑
              <select v-model="reviewLesson" aria-label="复习课程">
                <option value="">全部课程</option>
                <option v-for="l in lessons" :key="l.id" :value="l.id">{{ l.title }}</option>
              </select>
            </label>
          </div>
          <button class="button wide" :disabled="busy || !online" @click="start">
            {{
              busy
                ? '正在领卡片…'
                : queueNotice
                  ? '再试一次'
                  : reviewFinished
                    ? '再取一组'
                    : '领取今日卡片'
            }}
            <ArrowRight :size="17" />
          </button>
          <div v-if="queueNotice" class="queue-notice" role="status">
            <p>{{ queueNotice }}</p>
            <button
              v-if="otherCardsAvailable"
              class="subtle"
              :disabled="busy || !online"
              @click="startMixed"
            >
              切换到混合复习
            </button>
          </div>
          <p class="small">新卡需要在线领取；领取后可以离线继续。</p></template
        >
      </template>
      <template v-else-if="view === 'settings'">
        <div class="section-title">
          <span class="eyebrow">按你的来</span>
          <h1>怎么舒服怎么学。</h1>
          <p>一天学几张，你说了算。</p>
        </div>
        <section class="settings-card">
          <h2>每天的新卡</h2>
          <p>已到期的卡片会优先安排。设为 0 可以只复习旧卡。</p>
          <label
            >每天
            <input
              v-model.number="quota"
              type="number"
              min="0"
              max="100"
              aria-label="每日新卡数量"
            />
            张</label
          ><button class="button" :disabled="busy || !online" @click="saveSettings">
            就这么定了
          </button>
        </section>
        <section class="settings-card">
          <h2>离线课程</h2>
          <p>已保存 {{ savedIds.length }} 堂课。删除下载仅移除本设备副本。</p>
          <div
            v-for="l in lessons.filter((l) => savedIds.includes(l.id))"
            :key="l.id"
            class="toolbar"
          >
            <span>{{ l.title }}</span
            ><button
              @click="
                task(async () => {
                  await removeLesson(l.id);
                  await updatePending();
                })
              "
            >
              移除下载
            </button>
          </div>
          <button
            class="subtle"
            @click="
              task(async () => {
                lessons = await get('/lessons?page_size=100');
              })
            "
          >
            查看下载列表
          </button>
        </section>
        <section class="settings-card">
          <h2>新日语，自己来报到</h2>
          <p>
            {{
              contentState?.watching
                ? '自动更新开着呢，保存后新内容就会来。'
                : '自动更新暂时没开，可以先手动更新课程。'
            }}
          </p>
          <p v-if="contentState?.last_checked_at" class="small">
            上次检查：{{ new Date(contentState.last_checked_at).toLocaleString('zh-CN') }}
          </p>
          <p>
            新内容保存好就会来报到。打开应用、回到前台或重新联网时，也会更新已经下载的内容。想随身带的记录，先点下载。
          </p>
        </section>
        <section class="settings-card">
          <h2>同步与安装</h2>
          <p v-if="!secureContext" class="small">
            当前为 HTTP 浏览模式，可以在线学习。完整离线启动与 PWA 安装需要
            HTTPS；添加桌面快捷方式以浏览器能力为准。
          </p>
          <p>{{ pendingCount }} 条答题待同步。进度按日本时间安排。</p>
          <button class="subtle" :disabled="busy || !online" @click="task(synchronize)">
            <RefreshCw :size="16" /> 立即同步
          </button>
          <p class="small">
            手机日常访问 http://shiro-mac-home:3001。读音以假名显示，第一版没有朗读。
          </p>
        </section>
      </template>
    </main>
    <p v-if="appToast" class="app-toast" role="status">{{ appToast }}</p>
    <RelatedExpressions
      v-for="(topic, index) in relatedTopics"
      :key="index"
      :topic="topic"
      @close="relatedTopics.pop()"
      @topic="showTopic"
      @favorite="favorite"
    />
    <PortraitGuard />
    <nav v-if="view !== 'review'" class="bottom-nav" aria-label="主导航">
      <RouterLink to="/today" :class="{ active: view === 'today' }"
        ><Home :size="21" /><span>整两句</span></RouterLink
      ><RouterLink to="/lessons" :class="{ active: ['lessons', 'lesson'].includes(view) }"
        ><BookOpen :size="21" /><span>收集站</span></RouterLink
      ><RouterLink to="/library" :class="{ active: view === 'library' }"
        ><Search :size="21" /><span>查表达</span></RouterLink
      >
    </nav>
  </div>
</template>
