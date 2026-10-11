<script setup lang="ts">
import { newEventId } from './uuid';
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
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
  type Item,
  type LessonSummary,
  type LessonDetail,
  type Queue,
  type Rating,
} from '@jp-study/shared';
import ItemCard from './components/ItemCard.vue';
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
const secureContext = window.isSecureContext;
const view = computed(() => route.path.split('/')[1] || 'today');
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
const courseFilter = ref(''),
  reviewLesson = ref('');
const card = computed(() => queue.value?.cards[0]);
const list = computed(() =>
  detail.value
    ? (type.value === 'expression' ? detail.value.expressions : detail.value.vocabulary).filter(
        (i) => matches(i, lessonQuery.value),
      )
    : items.value,
);
const availableTags = computed(() => [
  ...new Set(
    (detail.value
      ? [...detail.value.expressions, ...detail.value.vocabulary]
      : items.value
    ).flatMap((i) => i.tags),
  ),
]);
const { needRefresh, updateServiceWorker } = useRegisterSW();
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
}
async function loadSearch() {
  const generation = ++searchGeneration;
  const params = new URLSearchParams({
    q: query.value,
    type: type.value,
    page: String(page.value),
    page_size: '20',
    ...(favorites.value ? { favorite: 'true' } : {}),
    ...(tags.value ? { tag: tags.value } : {}),
    ...(courseFilter.value ? { lesson_id: courseFilter.value } : {}),
  });
  try {
    const { data } = await http.get('/items?' + params);
    if (generation !== searchGeneration) return;
    items.value = data.data;
    total.value = data.meta.total;
    offlineSearch.value = false;
  } catch (e) {
    const cached = (await cachedItems()).filter(
      (i) =>
        i.item_type === type.value &&
        (!courseFilter.value || i.lesson_sources.some((l) => l.id === courseFilter.value)) &&
        matches(i, query.value) &&
        (!favorites.value || i.favorited) &&
        (!tags.value || i.tags.includes(tags.value)),
    );
    if (generation !== searchGeneration) return;
    items.value = cached.slice((page.value - 1) * 20, page.value * 20);
    total.value = cached.length;
    offlineSearch.value = true;
    if (!savedIds.value.length) throw e;
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
      reviewStarted.value = !!queue.value?.cards.length;
      reviewFinished.value = false;
      flipped.value = false;
    }
  } catch (e) {
    notice.value = message(e);
  }
}
watch(() => route.path, load);
watch([query, type, favorites, tags, courseFilter], () => {
  page.value = 1;
  if (view.value === 'library') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadSearch().catch((e) => (notice.value = message(e))), 250);
  }
});
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
    if (view.value === 'library' && favorites.value) await loadSearch();
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
    await synchronize();
    if (pendingCount.value > 0) throw new Error('请先同步已保存的答题；现有队列仍可继续。');
    const { data } = await http.post('/review/queue', {
      limit: 20,
      ...(reviewFilter.value === 'all' ? {} : { card_types: [reviewFilter.value] }),
      ...(reviewLesson.value ? { lesson_id: reviewLesson.value } : {}),
    });
    await session(data.data);
    queue.value = data.data;
    reviewStarted.value = true;
    reviewFinished.value = !queue.value!.cards.length;
    flipped.value = false;
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
onMounted(async () => {
  await updatePending();
  await load();
  void synchronize();
  window.addEventListener('online', refreshConnection);
  window.addEventListener('offline', refreshConnection);
});
onUnmounted(() => {
  clearTimeout(searchTimer);
  window.removeEventListener('online', refreshConnection);
  window.removeEventListener('offline', refreshConnection);
});
</script>
<template>
  <div class="app-shell">
    <header class="brand">
      <RouterLink to="/today"
        ><span class="brand-mark">語</span><span>日语手帖<small>JP STUDY</small></span></RouterLink
      ><RouterLink to="/settings" class="icon" aria-label="设置"
        ><Settings :size="21"
      /></RouterLink>
    </header>
    <div v-if="!online" class="connection">
      <WifiOff :size="15" /> 离线模式 · 已下载内容仍可查看
    </div>
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
            >{{ home?.today?.replaceAll('-', ' / ') || '今日' }} · 学一点，记久一点</span
          >
          <h1>把今天的日语，<br />变成自己的话。</h1>
          <p>从课堂里学到的表达开始。</p>
        </div>
        <section class="hero">
          <div>
            <span class="eyebrow">今日复习</span>
            <h2>
              {{
                home && home.due_count + home.new_available + home.pending_count === 0
                  ? '今天的复习已完成'
                  : '温故，而知新。'
              }}
            </h2>
            <p>每一次回想，都是一次进步。</p>
            <RouterLink class="button cream" to="/review"
              >开始复习 <ArrowRight :size="17"
            /></RouterLink>
          </div>
          <div class="hero-flower">
            <Flower2 :size="100" :stroke-width="0.8" /><span>日々</span>
          </div>
        </section>
        <p v-if="home?.pending_count" class="small">
          还有 {{ home.pending_count }} 张已领取卡片待完成，可继续复习。
        </p>
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
            ><span>已完成</span>
          </div>
        </div>
        <div class="list-title">
          <h2>最近的课堂</h2>
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
          <span>ことばの積み重ね</span>
          <p>不必一次记住全部，<br />只要每天多会说一点。</p>
        </div>
      </template>
      <template v-else-if="view === 'lessons'">
        <div class="section-title">
          <span class="eyebrow">LESSONS</span>
          <h1>我的课堂</h1>
          <p>每一堂课，都是一页新的手帖。</p>
        </div>
        <div class="toolbar">
          <span>{{ lessons.length }} 堂课</span
          ><button class="subtle" :disabled="busy || !online" @click="importLessons">
            <RefreshCw :size="16" /> 更新课程
          </button>
        </div>
        <RouterLink
          v-for="(l, index) in lessons"
          :key="l.id"
          :to="'/lesson/' + l.id"
          class="course-card"
          ><span class="eyebrow"
            >LESSON {{ String(index + 1).padStart(2, '0') }} · {{ l.lesson_date }}</span
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
        <p v-if="!lessons.length" class="empty">
          还没有课程。把 lesson.json 放入 lessons 后，点击更新课程。
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
            已保存，可离线查看；课程更新后请重新下载。
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
        <ItemCard v-for="item in list" :key="item.id" :item="item" @favorite="favorite" />
        <p v-if="!list.length" class="empty">没有找到相关内容。</p>
      </template>
      <template v-else-if="view === 'library'">
        <div class="section-title">
          <span class="eyebrow">COLLECTION</span>
          <h1>表达与单词</h1>
          <p>想说的话，从这里找。</p>
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
        <div class="toolbar">
          <button class="subtle" :class="{ selected: favorites }" @click="favorites = !favorites">
            <Bookmark :size="15" /> {{ favorites ? '只看收藏' : '全部内容' }}</button
          ><select v-model="tags" aria-label="标签筛选">
            <option value="">全部标签</option>
            <option v-for="tag in availableTags" :key="tag">{{ tag }}</option>
          </select>
        </div>
        <select v-model="courseFilter" aria-label="课程筛选">
          <option value="">全部课程</option>
          <option v-for="l in lessons" :key="l.id" :value="l.id">{{ l.title }}</option>
        </select>
        <p class="small">
          {{ total }} 个条目 <span v-if="offlineSearch"> · 当前仅搜索已下载课程</span>
        </p>
        <ItemCard v-for="item in list" :key="item.id" :item="item" @favorite="favorite" />
        <p v-if="!list.length" class="empty">没有找到相关内容。试试中文意思或日语原说法。</p>
        <div v-if="total > 20" class="pagination">
          <button
            :disabled="page === 1"
            @click="
              page--;
              task(loadSearch);
            "
          >
            上一页</button
          ><span>{{ page }} / {{ Math.ceil(total / 20) }}</span
          ><button
            :disabled="page * 20 >= total"
            @click="
              page++;
              task(loadSearch);
            "
          >
            下一页
          </button>
        </div>
      </template>
      <template v-else-if="view === 'review'">
        <RouterLink to="/today" class="back"><ArrowLeft :size="16" /> 今日</RouterLink>
        <div class="section-title">
          <span class="eyebrow">REVIEW</span>
          <h1>{{ reviewFinished ? '今天又进步了一点。' : '让日语留在记忆里。' }}</h1>
          <p>先试着回想，再翻开答案。</p>
        </div>
        <template v-if="card"
          ><div class="toolbar">
            <span>{{
              card.card_type === 'correction'
                ? '纠错练习'
                : card.card_type === 'word'
                  ? '单词回想'
                  : '表达回想'
            }}</span
            ><span>剩余 {{ queue?.cards.length }} 张</span>
          </div>
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
            <p v-if="!flipped" class="small">给自己一点时间，想一想。</p>
            <button v-if="!flipped" class="button" @click="flipped = true">查看答案</button>
            <div v-else class="answer">
              <span class="label">推荐答案</span>
              <h3 lang="ja">{{ card.answer.japanese }}</h3>
              <p v-if="'reading' in card.answer" class="reading">{{ card.answer.reading }}</p>
              <p>{{ card.answer.meaning_zh }}</p>
              <ItemCard :key="card.id" :item="card.answer" expanded @favorite="favorite" />
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
                ? '这一组已完成；答题已保存在设备上。'
                : '每天回想一点，比一次背完更轻松。'
            }}
          </p>
          <select v-model="reviewFilter" aria-label="复习类型">
            <option value="all">混合复习</option>
            <option value="word">单词</option>
            <option value="expression">表达方式</option>
            <option value="correction">纠错</option></select
          ><select v-model="reviewLesson" aria-label="复习课程">
            <option value="">全部课程</option>
            <option v-for="l in lessons" :key="l.id" :value="l.id">{{ l.title }}</option>
          </select>
          <button class="button wide" :disabled="busy || !online" @click="start">
            {{ reviewFinished ? '再取一组' : '领取今日卡片' }} <ArrowRight :size="17" />
          </button>
          <p class="small">新卡需要在线领取；领取后可以离线继续。</p></template
        >
      </template>
      <template v-else-if="view === 'settings'">
        <div class="section-title">
          <span class="eyebrow">SETTINGS</span>
          <h1>按自己的节奏。</h1>
          <p>把学习变成一件轻松的日常。</p>
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
          ><button
            class="button"
            :disabled="busy || !online"
            @click="
              task(async () => {
                await http.put('/settings', { daily_new_limit: quota });
                await cache('/settings', { daily_new_limit: quota });
                notice = '设置已保存';
              })
            "
          >
            保存设置
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
    <nav v-if="view !== 'review'" class="bottom-nav" aria-label="主导航">
      <RouterLink to="/today" :class="{ active: view === 'today' }"
        ><Home :size="21" /><span>今日</span></RouterLink
      ><RouterLink to="/lessons" :class="{ active: ['lessons', 'lesson'].includes(view) }"
        ><BookOpen :size="21" /><span>课堂</span></RouterLink
      ><RouterLink to="/library" :class="{ active: view === 'library' }"
        ><Search :size="21" /><span>查表达</span></RouterLink
      >
    </nav>
  </div>
</template>
