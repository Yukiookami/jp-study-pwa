<script setup lang="ts">
import { ref } from 'vue';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const md = new MarkdownIt({ html: false, linkify: false });
const render = (text: string) => DOMPurify.sanitize(md.render(text));
import { Star, ChevronDown } from 'lucide-vue-next';
import type { Item, Expression, Vocabulary } from '@jp-study/shared';
const props = defineProps<{ item: Item; expanded?: boolean }>();
const emit = defineEmits<{ favorite: [item: Item] }>();
const open = ref(props.expanded ?? false);
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
        ><span v-if="item.item_type === 'vocabulary'" class="reading">{{
          (item as Vocabulary).reading
        }}</span
        ><strong lang="ja">{{ item.japanese }}</strong
        ><span class="meaning">{{ item.meaning_zh }}</span></span
      ><ChevronDown :size="18" :class="{ rotated: open }" />
    </button>
    <div v-if="open" class="item-body">
      <template v-if="item.item_type === 'expression'"
        ><div
          v-if="
            (item as Expression).original_japanese || (item as Expression).error_example_japanese
          "
          class="correction"
        >
          <span class="label">{{
            (item as Expression).original_japanese ? '课堂原说法' : '反推错误示例'
          }}</span>
          <p lang="ja" class="wrong">
            {{
              (item as Expression).original_japanese || (item as Expression).error_example_japanese
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
        <p class="explanation">{{ (item as Vocabulary).collocations.join(' · ') }}</p></template
      >
      <div v-for="(example, index) in item.examples" :key="index" class="example">
        <span class="label">{{ example.origin === 'source' ? '课堂例句' : '补充例句' }}</span>
        <p lang="ja">{{ example.japanese }}</p>
        <p class="translation">{{ example.meaning_zh }}</p>
      </div>
      <div class="tags">
        <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
      </div>
      <div class="source">
        来自
        <RouterLink v-for="l in item.lesson_sources" :key="l.id" :to="'/lesson/' + l.id"
          >{{ l.title }}
        </RouterLink>
      </div>
    </div>
  </article>
</template>
