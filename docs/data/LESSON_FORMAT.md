# 学习数据格式 v1

## 文件与稳定标识

每节课的 `lesson.json` 使用 UTF-8 标准 JSON，不带注释或 Markdown 围栏。顶层字段固定为：

| 字段 | 类型 | 说明 |
|---|---|---|
| schema_version | 整数 | 固定为 1 |
| lesson | 对象 | 本课元数据 |
| expressions | 对象数组 | 表达方式 |
| vocabulary | 对象数组 | 单词／固定搭配 |
| unresolved | 对象数组 | 未确认的学习内容，没疑点时为空数组 |

`lesson` 包含：`id`（字符串）、`title`（字符串）、`lesson_date`（YYYY-MM-DD 或 null）、`created_date`（整理日期）、`source_files`（文件名数组）、`tags`（字符串数组）。日期按用户时区。原始文件只记文件名，不嵌入本机绝对路径。

首次创建时给 lesson 与 expression 生成带前缀的 UUID，分别为 `lesson_`、`expr_`；以后修订保留原 ID。不要根据表格行号命名。

词条第一次出现时按其“词形＋读音＋义项”生成 `vocab_` UUID；先查当前项目既有 `lesson.json`，相同词、读音、义项复用 ID。重复出现可以在每课导出该词条的本课实例，PWA 以后按 ID 合并。词形相同但义项不同分别建词条。已经确认的 ID 不因标题或措辞修改而重算。

## 表达方式字段

| 字段 | 类型 | 说明 |
|---|---|---|
| id | 字符串 | 稳定表达 ID |
| japanese | 字符串 | 推荐表达，不放错误句 |
| meaning_zh | 字符串 | 中文意思 |
| original_japanese | 字符串或 null | 用户原说法；无可靠纠错依据用 null |
| corrected_japanese | 可选：字符串或 null | 原错误的明确正确形式；japanese为句型标题时纠错卡必须提供此字段 |
| error_example_japanese | 可选：字符串或 null | 无法还原原错误时构造的反推错误示例，不是用户原话；与 original_japanese 分开存放 |
| explanation_zh | 字符串 | 接续、意义、区别与注意事项 |
| contexts | 字符串数组 | 适用场景，例如职场、日常 |
| examples | 对象数组 | 至少一个可靠例句；不确定原句不凑数 |
| vocabulary_ids | 字符串数组 | 关联本文件 vocabulary 中的词条 ID |
| origin | 枚举 | teacher_correction / lesson_material / assistant_supplement |
| verification | 枚举 | source_supported / user_confirmed / needs_review |
| tags | 字符串数组 | 语法、委婉请求等分类 |

## 单词字段

`id`、`japanese`、`reading`、`part_of_speech`、`meaning_zh` 均为字符串；`collocations`、`tags` 为字符串数组；`examples` 为例句对象数组；`origin`、`verification` 使用与表达方式相同的枚举。

例句对象：`japanese`、`meaning_zh` 为字符串，`origin` 为 `source` 或 `assistant_supplement`。例句中不加入自动识别错误、乱码或未经确认的个人事实。

## 确认状态与背诵卡片

- `source_supported`：输入文字、画面或可信的课堂记录支持；不代表自动转写已经人工逐字核验。
- `user_confirmed`：用户明确核对过该内容，或明确确认了一批条目。
- `needs_review`：关键学习内容有歧义，暂不进入默认背诵卡片。

疑点能确定一个候选表达时可以保留条目，设 `needs_review`。无法确定表达时只加入 `unresolved`，不要填一个猜测词条。`unresolved` 对象字段为 `description_zh`（问题描述）、`related_item_ids`（关联 ID 数组，可空）、`source_excerpt`（原始片段或 null）。

用户已授权：中日混合片段仅原错误不清、目标用法明确时，直接整理正确形式，`original_japanese` 为 null。需要错误对照可填写可选字段 `error_example_japanese`，Memo 标为“反推错误示例”，不要写成课堂原话；该示例不是推荐例句。若正确形式是助手整理的自然表达而非可确认的课堂纠正，`origin` 用 `assistant_supplement`。不因原错误未知将可靠的目标用法标为 `needs_review`；无法辨认的出题题干本身可省略。

不要只因用户要求“省略核对说明”就把所有条目变为 `user_confirmed`。确认后修改状态、更新同一条目的内容，并清除已解决的疑点。

内容可更新，但应用的复习次数、掌握程度、下次复习日期应存在独立的数据表，以 item ID 关联；本文件不生成这些字段。

## 示例

以下是格式示例，实际输出应使用新 ID 或既有稳定 ID。

```json
{
  "schema_version": 1,
  "lesson": {
    "id": "lesson_0c0dc5a0-15e3-4ca7-9a87-87f5084a6878",
    "title": "日本生活与自然表达",
    "lesson_date": null,
    "created_date": "2026-10-11",
    "source_files": ["课堂笔记.md"],
    "tags": ["日本生活", "职场"]
  },
  "expressions": [
    {
      "id": "expr_1b23bd3a-a3af-4bcd-96c9-62d0bf593576",
      "japanese": "質にこだわる",
      "meaning_zh": "讲究质量",
      "original_japanese": "質を注意しながら",
      "explanation_zh": "对品质有追求时用「にこだわる」，助词为「に」。",
      "contexts": ["编程", "工作"],
      "examples": [
        {
          "japanese": "趣味でコードを書くときは、質にこだわっています。",
          "meaning_zh": "作为兴趣写代码时，我很讲究质量。",
          "origin": "assistant_supplement"
        }
      ],
      "vocabulary_ids": ["vocab_95b6e0b3-0f41-43c9-82f7-878c61f7f625"],
      "origin": "teacher_correction",
      "verification": "source_supported",
      "tags": ["词语搭配"]
    }
  ],
  "vocabulary": [
    {
      "id": "vocab_95b6e0b3-0f41-43c9-82f7-878c61f7f625",
      "japanese": "質",
      "reading": "しつ",
      "part_of_speech": "名词",
      "meaning_zh": "质量、品质",
      "collocations": ["質にこだわる"],
      "examples": [
        {
          "japanese": "質にこだわっています。",
          "meaning_zh": "很讲究质量。",
          "origin": "assistant_supplement"
        }
      ],
      "origin": "teacher_correction",
      "verification": "source_supported",
      "tags": ["工作"]
    }
  ],
  "unresolved": []
}
```

生成后核对：格式版本为 1；所有字段类型正确；单个文件中 ID 不重复；`vocabulary_ids` 与疑点关联均可解析；日期有效；例句与原说法分开；Memo 与 JSON 的条目及推荐表达一致。批量生成时用当前可用的 JSON 校验工具实施这些检查。

## 纠错卡适配

现有第一课部分 japanese 字段为句型标题，如「動詞のば形」，不是「伝えば」对应的完整正确形式。S02导入实施前按已核对Memo补可选 corrected_japanese，保持所有ID；这是待做的数据适配，本次不改原课程。不能在运行时猜答案。纠错卡若无 corrected_japanese，只有 japanese 本身明确为实际正确形式时才可生成；标题为总称或模板且无明确正确形式时跳过该纠错卡。
