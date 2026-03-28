# Demo 演示说明

## 1. 前端接入演示模式

当前前端已提供两种演示 / 接入模式：

### 普通组件演示页

```text
?mode=service-desk-demo
```

用途：

- 演示 ServiceDeskWidget 组件效果
- 适合研发 / 产品查看工单机器人样式与交互

### 前端地址嵌入页

```text
/embed/kb-1
```

用途：

- 通过已部署的 AI LocalBase 前端访问地址直接接入
- 适合 iframe / 外链嵌入其他系统
- 固定使用指定知识库，不提供切换能力
- 路径中的 `kb-1` 可直接替换为目标知识库 ID

兼容方式：

```text
/?embed=1&kb=kb-1
```

旧写法仍可用：

```text
/?mode=service-desk-embed&knowledgeBaseId=kb-1
```

---

## 2. URL 嵌入示例

最简方式：

```text
https://your-ai-localbase.example.com/embed/kb-it-support
```

带标题与上下文参数的方式：

```text
https://your-ai-localbase.example.com/embed/kb-it-support?title=IT服务台机器人&ticket=INC-2025-0001&tenant=tenant-a&uid=u-001&src=portal-react-host&cat=账号与访问&p=P2
```

iframe 示例：

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support?title=IT%E6%9C%8D%E5%8A%A1%E5%8F%B0%E6%9C%BA%E5%99%A8%E4%BA%BA"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

如果部署环境未配置 SPA 路由重写，请改用：

```text
https://your-ai-localbase.example.com/?embed=1&kb=kb-it-support
```

---

## 3. 演示路径建议

建议演示以下场景：

1. 创建带工单上下文的会话
2. 发送工单问题
3. 观察机器人回答与知识来源
4. 点赞一条高质量回答
5. 点踩一条低质量回答并选择原因
6. 调用运营接口查看 FAQ / 知识缺口 / 低质量回答
7. 用 iframe 方式把嵌入页挂到外部系统中

---

## 4. 知识库上传演示

上传面板已支持以下能力：

1. 显示支持文件类型：`TXT / MD / PDF / DOCX / HTML / HTM / PNG / JPG / JPEG / WEBP / GIF`
2. 展示文件传输进度
3. 展示服务端解析阶段进度：正文抽取、图片 OCR、切片、向量化、入库
4. 支持取消、重试、批量总进度与拖拽上传

---

## 5. 运营接口演示

```bash
curl -s http://localhost:8080/api/service-desk/analytics/summary | jq .
```

---

## 6. 自动化验证

已补充后端测试：

```bash
cd backend
go test ./...
```

前端构建验证：

```bash
cd frontend
npm ci
npm run build
```

---

## 额外部署参考

- `docs/chat-integration/embed-final.md`
- `docs/chat-integration/embed-deployment.md`
- `docs/chat-integration/embed-handoff-template.md`

---

## 7. 本轮验证边界

本轮交付仅做：

- 静态代码审查
- 前端构建验证
- 后端测试验证
- 路由 / 文档 / 组件引用链检查

未做：

- 本地前端 / 后端启动验证
- 浏览器运行态联调
- 真实宿主系统 iframe 联调
