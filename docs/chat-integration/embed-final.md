# iframe 接入最终版

## 1. 最终推荐接入方式

**推荐把所有外部接入统一成这一种格式：**

```text
https://your-ai-localbase.example.com/embed/{knowledgeBaseId}
```

例如：

```text
https://your-ai-localbase.example.com/embed/kb-it-support
```

这条地址已经满足以下要求：

- **知识库可参数化**
- **接入地址足够短**
- **适合 iframe / 外部系统 / 门户系统 / 工单系统**
- **终端用户不能在嵌入页内切换知识库**

---

## 2. 最简 iframe 代码

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

---

## 3. 带业务上下文的 iframe 代码

如果要带工单号、用户 ID、租户、来源系统等上下文，直接在 query 中追加：

```html
<iframe
  src="https://your-ai-localbase.example.com/embed/kb-it-support?title=IT服务台机器人&ticket=INC-2025-0001&uid=u-001&tenant=tenant-a&src=itsm-portal&cat=账号与访问&p=P2"
  style="width:100%;height:820px;border:0;"
  loading="lazy"
></iframe>
```

---

## 4. 参数说明

### 必填参数

- 路径中的 `{knowledgeBaseId}`
  - 指定固定使用的知识库 ID
  - 示例：`kb-it-support`

### 可选参数

- `title` / `t`
  - 机器人标题
- `ticket` / `ticketId`
  - 工单号
- `uid` / `userId`
  - 用户 ID
- `tenant` / `tenantId`
  - 租户 ID
- `src` / `sourcePlatform`
  - 来源系统
- `cat` / `category`
  - 问题分类
- `p` / `priority`
  - 优先级
- `q` / `quickPrompts`
  - 快捷问题，多个值用 `|` 或 `,` 分隔
- `tag` / `tags`
  - 标签，多个值用 `|` 或 `,` 分隔
- `cid` / `conversationId`
  - 复用已有会话
- `stream` / `s`
  - 是否开启流式返回，默认 `true`
- `host` / `hostPage`
  - 宿主页面标识
- `api` / `apiBaseUrl`
  - 后端地址，默认同源

---

## 5. docker compose 部署后的访问方式

默认 `docker compose up --build -d` 启动后，可直接访问：

```text
http://服务器IP:4173/embed/kb-it-support
```

如果你只是本机访问：

```text
http://localhost:4173/embed/kb-it-support
```

---

## 6. Nginx 最简生产接入方式

如果你有自己的域名，推荐宿主机 Nginx 直接代理前端容器端口 `4173`：

```nginx
server {
    listen 80;
    server_name ai.example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

然后外部统一访问：

```text
https://ai.example.com/embed/kb-it-support
```

---

## 7. 为什么 `/embed/...` 可以直接访问

因为前端镜像内置了 SPA 路由回退规则：

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

所以：

- `/embed/kb-it-support`
- `/embed/kb-hr`
- `/embed/kb-network`

都会正确回落到前端入口页，再读取路径中的知识库 ID。

---

## 8. 如果你的部署环境不支持 SPA 路由回退

请使用兼容写法：

```text
https://your-ai-localbase.example.com/?embed=1&kb=kb-it-support
```

这条地址功能等价，只是 URL 稍长。

同时仍兼容旧写法：

```text
https://your-ai-localbase.example.com/?mode=service-desk-embed&knowledgeBaseId=kb-it-support
```

---

## 9. 给第三方系统的最终交付话术

可以直接把下面这段发给对方：

```md
请使用以下地址嵌入 AI LocalBase 聊天组件：

`https://your-ai-localbase.example.com/embed/{knowledgeBaseId}`

例如：

`https://your-ai-localbase.example.com/embed/kb-it-support`

如需透传工单号、用户 ID、租户信息，可在地址后追加 query 参数，例如：

`https://your-ai-localbase.example.com/embed/kb-it-support?title=IT服务台机器人&ticket={ticketId}&uid={userId}&tenant={tenantId}&src=itsm-portal`

说明：
- 每个嵌入实例固定绑定一个知识库
- 终端用户不能在组件内部切换知识库
- 如果贵方环境不支持 SPA 路由回退，请改用兼容地址：
  `https://your-ai-localbase.example.com/?embed=1&kb=kb-it-support`
```

---

## 10. 最终建议

### 对内统一规则

建议以后内部所有文档、对外交付、客户接入、实施说明，全部统一写成：

```text
/embed/{knowledgeBaseId}
```

### 对外只保留两种说法

1. **推荐写法**
   ```text
   /embed/{knowledgeBaseId}
   ```
2. **兼容写法**
   ```text
   /?embed=1&kb={knowledgeBaseId}
   ```

这样不会再出现多套路径规则混乱的问题。

---

## 11. 相关文档

- `docs/chat-integration/frontend-widget.md`
- `docs/chat-integration/embed-deployment.md`
- `docs/chat-integration/embed-handoff-template.md`
- `docs/chat-integration/demo-guide.md`
