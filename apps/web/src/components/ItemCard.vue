<script setup lang="ts">
import { ref } from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const md = new MarkdownIt({ html: false, linkify: false });
const render = (text: string) => DOMPurify.sanitize(md.render(text));
import { Star, ChevronDown } from 'lucide-vue-next';
import { pitchAccentLabel, type Item, type Expression, type Vocabulary } from '@jp-study/shared';
const props = defineProps<{ item: Item; expanded?: boolean }>();
const emit = defineEmits<{ favorite: [item: Item]; topic: [tag: string] }>();
const open = ref(props.expanded ?? false);
function beforeEnter(element: Element) {
  const panel = element as HTMLElement;
  panel.style.height = '0px';
  panel.style.opacity = '0';
}
function enter(element: Element) {
  const panel = element as HTMLElement;
  panel.style.height = panel.scrollHeight + 'px';
  panel.style.opacity = '1';
}
function afterEnter(element: Element) {
  const panel = element as HTMLElement;
  panel.style.height = 'auto';
  panel.style.opacity = '';
}
function beforeLeave(element: Element) {
  const panel = element as HTMLElement;
  panel.style.height = panel.getBoundingClientRect().height + 'px';
  panel.style.opacity = '1';
  // Commit the measured height before transitioning to zero.
  void panel.offsetHeight;
}
function leave(element: Element) {
  const panel = element as HTMLElement;
  panel.style.height = '0px';
  panel.style.opacity = '0';
}
const origins = {
  teacher_correction: '课堂纠正',
  lesson_material: '课堂内容',
  assistant_supplement: '补充整理',
};
</script>
<template>
  <article class="item-card" :class="{ expanded: open }">
    <div class="item-top">
      <span class="eyebrow"
        >{{ origins[item.origin]
        }}<span v-if="item.verification === 'needs_review'" class="uncertain"> · 待确认</span></span
      ><button
        class="icon"
        :aria-label="item.favorited ? '取消收藏' : '收藏'"
        :aria-pressed="item.favorited"
        @click="emit('favorite', item)"
      >
        <Star :size="20" :fill="item.favorited ? 'currentColor' : 'none'" />
      </button>
    </div>
    <button class="item-heading" :aria-expanded="open" @click="open = !open">
      <span
        ><span v-if="item.item_type === 'vocabulary'" class="reading"
          >{{ (item as Vocabulary).reading
          }}<span
            v-for="pattern in (item as Vocabulary).pitch_accent?.patterns"
            :key="pattern"
            class="pitch-badge"
          >
            {{ pitchAccentLabel(pattern) }}
          </span></span
        ><strong lang="ja">{{ item.japanese }}</strong
        ><span class="meaning">{{ item.meaning_zh }}</span></span
      ><ChevronDown :size="18" :class="{ rotated: open }" />
    </button>
    <Transition
      name="card-expand"
      @before-enter="beforeEnter"
      @enter="enter"
      @after-enter="afterEnter"
      @enter-cancelled="afterEnter"
      @before-leave="beforeLeave"
      @leave="leave"
    >
      <div v-if="open" class="card-reveal">
        <div class="item-body">
          <template v-if="item.item_type === 'expression'"
            ><p v-if="(item as Expression).original_context_zh" class="original-context">
              <span class="label">场景与表达意图</span><br />{{
                (item as Expression).original_context_zh
              }}
            </p>
            <div
              v-if="
                (item as Expression).original_japanese ||
                (item as Expression).error_example_japanese
              "
              class="correction"
            >
              <span class="label">{{
                (item as Expression).original_japanese ? '课堂原说法' : '反推错误示例'
              }}</span>
              <p lang="ja" class="wrong">
                {{
                  (item as Expression).original_japanese ||
                  (item as Expression).error_example_japanese
                }}
              </p>
              <span class="label">推荐说法</span>
              <p lang="ja">{{ (item as Expression).corrected_japanese || item.japanese }}</p>
            </div>
            <!-- Markdown HTML is disabled; DOMPurify sanitizes the rendered output. -->
            <!-- eslint-disable vue/no-v-html -->
            <div
              class="explanation markdown"
              v-html="render((item as Expression).explanation_zh)"
            ></div>
            <!-- eslint-enable vue/no-v-html -->
            <div v-if="(item as Expression).contexts.length" class="contexts">
              <span class="label">什么时候用</span>
              <p>{{ (item as Expression).contexts.join('；') }}</p>
            </div></template
          >
          <template v-else
            ><p class="label">{{ (item as Vocabulary).part_of_speech }}</p>
            <p class="explanation">{{ (item as Vocabulary).collocations.join(' · ') }}</p>
            <details v-if="(item as Vocabulary).pitch_accent" class="pitch-guide">
              <summary>音调怎么看？</summary>
              <p>
                东京式音调。⓪ 表示没有下降；其他数字表示在第几拍之后由高变低。①
                为头高型；下降点在词中是中高型，在最后一拍是尾高型。尾高型后接助词时会下降，平板型不会。
              </p>
              <p>
                按拍数计，不是汉字数：「きょ」算一拍，长音「ー」、促音「っ」、拨音「ん」各算一拍。这里记录当前词形的音调，活用或接其他词时可能变化。
              </p>
              <p v-if="(item as Vocabulary).pitch_accent?.note">
                {{ (item as Vocabulary).pitch_accent?.note }}
              </p>
              <a
                :href="(item as Vocabulary).pitch_accent?.source.url"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ (item as Vocabulary).pitch_accent?.source.title }} · 查看来源
              </a>
            </details>
          </template>
          <div v-for="(example, index) in item.examples" :key="index" class="example">
            <span class="label">{{ example.origin === 'source' ? '课堂例句' : '补充例句' }}</span>
            <p lang="ja">{{ example.japanese }}</p>
            <p class="translation">{{ example.meaning_zh }}</p>
          </div>
          <div class="tags">
            <template v-for="tag in item.tags" :key="tag">
              <button
                v-if="tag.startsWith('主题：')"
                class="topic-link"
                @click="emit('topic', tag)"
              >
                {{ tag.replace('主题：', '') }} · 看相关表达 →
              </button>
              <span v-else>{{ tag }}</span>
            </template>
          </div>
          <div class="source">
            来自
            <RouterLink v-for="l in item.lesson_sources" :key="l.id" :to="'/lesson/' + l.id"
              >{{ l.title }}
            </RouterLink>
          </div>
        </div>
      </div>
    </Transition>
  </article>
</template>
