# FAQ 与持续优化机制

## 已实现对象

系统已新增以下优化对象：

- `faq_candidates`
- `knowledge_gaps`
- `low_quality_answers`

---

## FAQ 候选沉淀逻辑

当前规则：

1. 用户对同类问题持续点赞
2. 点赞计数累积到阈值（当前接口返回时已过滤 `like_count >= 2`）
3. 自动进入 `faq_candidates`

FAQ 候选记录字段：

- `questionNormalized`
- `questionText`
- `answerText`
- `knowledgeBaseId`
- `sourceMessageId`
- `conversationId`
- `likeCount`
- `status`

---

## 低质量回答识别逻辑

满足以下任一条件会沉淀为低质量回答候选：

- 被点踩
- 点踩数持续增长
- 失败原因集中出现

记录对象：

- `sourceMessageId`
- `questionText`
- `answerText`
- `knowledgeBaseId`
- `primaryReason`
- `dislikeCount`
- `status`

---

## 知识缺口识别逻辑

系统会把点踩原因自动映射到知识缺口建议：

- `答非所问` / `检索结果不相关`
  - 建议优化检索召回、TopK、提示词
- `内容不准确` / `内容不完整`
  - 建议补充知识文档、修正 FAQ
- `内容过时`
  - 建议更新文档版本与制度说明
- `没有解决问题`
  - 建议增加升级人工与标准处理步骤
- `图片文字未识别` / `图片内容未召回` / `图文理解不完整` / `图片描述不准确`
  - 建议检查图片提取、OCR、图文关联与图片召回策略
- `图片信息过时`
  - 建议替换过时截图 / 流程图并重新索引

---

## 建议的运营节奏

### 每周例行

1. 查看总反馈趋势
2. 排序点踩最高的问题
3. 把 like_count 高的答案转 FAQ 草稿
4. 补知识文档并重新验证
5. 观察次周点踩率是否下降

### 效果指标

- 点赞率提升
- 点踩率下降
- FAQ 候选转正数量
- 知识缺口关闭数量
- 同类问题重复投诉量下降
