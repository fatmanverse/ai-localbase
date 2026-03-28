# Demo 演示说明

## 1. 启动后端

```bash
cd backend
go run .
```

## 2. 启动前端

```bash
cd frontend
npm ci
npm run dev
```

## 3. 打开演示页

```text
http://localhost:5173/?mode=service-desk-demo
```

---

## 4. 演示路径

建议演示以下场景：

1. 创建带工单上下文的会话
2. 发送工单问题
3. 观察机器人回答与知识来源
4. 点赞一条高质量回答
5. 点踩一条低质量回答并选择原因
6. 调用运营接口查看 FAQ / 知识缺口 / 低质量回答

---

## 5. 知识库上传演示

上传面板已支持以下能力：

1. 显示支持文件类型：`TXT / MD / PDF / DOCX / HTML / HTM / PNG / JPG / JPEG / WEBP / GIF`
2. 展示文件传输进度
3. 展示服务端解析阶段进度：正文抽取、图片 OCR、切片、向量化、入库
4. 支持取消、重试、批量总进度与拖拽上传

---

## 6. 运营接口演示

```bash
curl -s http://localhost:8080/api/service-desk/analytics/summary | jq .
```

---

## 7. 自动化验证

已补充后端 e2e：

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
