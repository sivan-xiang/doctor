# 内容字段规范（content-schema）

本文件对应 PRD 第 7 章。所有内容以 Markdown + frontmatter 形式存放在 `/content` 下，构建时由
`scripts/build-content.mjs` 解析、校验并生成索引。**校验失败即阻断发布。**

## 1. 目录结构

```
/content
  /emergency          急救场景
  /daily-medicine     日常医药
  /medicine-kit       家庭药箱
  /seek-care          就医指引
  /misconceptions     常见误区
```

## 2. 字段说明

| 字段 | 必填 | 类型 | 约束 |
| --- | --- | --- | --- |
| title | 是 | string | ≤20 字 |
| slug | 是 | string | 英文小写 + 短横线，全局唯一 |
| category | 是 | enum | emergency / daily-medicine / medicine-kit / seek-care / misconceptions |
| scenario | 是 | string | 场景名，如「烫伤」 |
| summary | 是 | string | ≤40 字 |
| priority | 否 | number | 首页排序，越小越靠前 |
| keywords | 否 | string[] | 含同义词、俗称 |
| steps | 是 | string[] | 3–6 条，每条 ≤50 字 |
| donts | 是 | string[] | 每条 ≤30 字 |
| when_to_seek_help | 是 | string | 何时必须就医 / 拨 120 |
| special_groups | 否 | string | 儿童 / 孕妇 / 老人 / 慢病人群注意 |
| source | 是 | string | 内容来源 |
| reviewer | 是 | string | 审核医生 / 药师 |
| reviewed_at | 是 | date | YYYY-MM-DD |
| updated_at | 是 | date | YYYY-MM-DD |
| version | 是 | string | 如 1.0 |
| disclaimer | 是 | string | 免责声明，可用默认值 |
| status | 是 | enum | draft / reviewed / published / archived |

## 3. 硬规则

1. `status: published` 时，`source`、`reviewer`、`reviewed_at`、`updated_at`、`version` 缺一不可。
2. `steps` 必须 3–6 条，`donts` 至少 1 条，`when_to_seek_help` 非空。
3. `slug` 全局唯一，`category` 与所在目录一致。
4. 禁止出现「确诊」「治愈」「替代就医」「保证有效」「包治」等表述。
5. 日期格式统一为 `YYYY-MM-DD`，`updated_at` 不早于 `reviewed_at`。

## 4. 正文规范

frontmatter 已承载结构化字段（步骤 / 禁忌 / 就医指引），**正文只写补充说明、常见误区解释与来源说明**，
不得重复 steps / donts。免责声明由构建脚本统一补全，正文无需手写。

## 5. 示例

```markdown
---
title: 烫伤后先做什么
slug: burns
category: emergency
scenario: 烫伤
summary: 立即用流动冷水冲洗，不要涂牙膏、酱油。
priority: 1
keywords: [烫伤, 烧伤, 开水烫伤]
steps:
  - 迅速远离热源，确保环境安全
  - 用流动冷水冲洗伤处 15–20 分钟
donts:
  - 不要涂牙膏、酱油、香油
when_to_seek_help: 面积较大、起大水泡、特殊部位烫伤，立即就医。
source: 公开急救指南整理
reviewer: 审核医生
reviewed_at: 2026-10-01
updated_at: 2026-10-20
version: "1.0"
status: published
disclaimer: 本内容仅用于健康科普，不构成诊断、处方或治疗建议，紧急情况请拨打 120。
---
```
