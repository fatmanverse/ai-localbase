# iframe / Embed 部署说明

## 1. 推荐访问方式

部署完成后，推荐把外部接入地址统一收敛成：

```text
https://your-ai-localbase.example.com/embed/知识库ID
```

例如：

```text
https://your-ai-localbase.example.com/embed/kb-it-support
```

如果需要带标题或业务上下文参数：

```text
https://your-ai-localbase.example.com/embed/kb-it-support?title=IT服务台机器人&ticket=INC-2025-0001&tenant=tenant-a&uid=u-001&src=portal-react-host&cat=账号与访问&p=P2
```

---

## 2. docker compose 部署后的前端访问路径

默认 `docker-compose.yml` 启动后，前端容器对外暴露：

```text
http://服务器IP:4173
```

因此可直接访问：

```text
http://服务器IP:4173/embed/kb-it-support
```

如果只想走 query 兼容方式，也可以使用：

```text
http://服务器IP:4173/?embed=1&kb=kb-it-support
```

### 最简命令

```bash
docker compose up --build -d
```

### 访问示例

- 前端首页：
  ```text
  http://服务器IP:4173
  ```
- 工单机器人 Demo：
  ```text
  http://服务器IP:4173/?mode=service-desk-demo
  ```
- 固定知识库嵌入页：
  ```text
  http://服务器IP:4173/embed/kb-it-support
  ```

---

## 3. Nginx 反向代理推荐配置

如果你希望对外统一成一个域名，例如：

```text
https://ai.example.com
```

最简单方式是让宿主 Nginx 只代理前端容器端口 `4173`，由前端容器内部再转发 `/api`、`/v1`、`/upload`、`/health` 到后端。

### 推荐配置

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

这样外部访问：

```text
https://ai.example.com/embed/kb-it-support
```

即可直接工作。

---

## 4. 为什么 `/embed/...` 可以工作

前端镜像内置的 `docker/nginx.conf` 已经包含 SPA 路由回退：

```nginx
location / {
    root /usr/share/nginx/html;
    index index.html;
    try_files $uri $uri/ /index.html;
}
```

因此：

- `/embed/kb-it-support`
- `/embed/kb-hr`
- `/embed/kb-network`

都会回落到前端入口页，再由前端读取路径中的知识库 ID。

---

## 5. 如果你的前置代理没有做 SPA 路由回退

如果你不是直接代理到本项目前端容器，而是把前端静态文件自行部署到其他 Web 服务上，需要确保也有类似回退规则。

例如静态站点 Nginx：

```nginx
server {
    listen 80;
    server_name ai.example.com;

    root /srv/ai-localbase/frontend-dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /v1/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /upload {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果暂时不方便加回退规则，请改用兼容写法：

```text
https://ai.example.com/?embed=1&kb=kb-it-support
```

---

## 6. 第三方系统接入时建议提供的标准地址

建议统一只给业务方这一条：

```text
https://ai.example.com/embed/{knowledgeBaseId}
```

例如：

```text
https://ai.example.com/embed/kb-it-support
```

如果某个系统需要固定标题：

```text
https://ai.example.com/embed/kb-it-support?title=IT服务台机器人
```

如果某个系统要带工单上下文：

```text
https://ai.example.com/embed/kb-it-support?title=IT服务台机器人&ticket={ticketId}&uid={userId}&tenant={tenantId}&src=itsm-portal
```

---

## 7. 建议的上线检查项

1. 确认前端地址可访问：
   ```text
   https://ai.example.com
   ```
2. 确认嵌入地址可访问：
   ```text
   https://ai.example.com/embed/kb-it-support
   ```
3. 确认 query 兼容地址可访问：
   ```text
   https://ai.example.com/?embed=1&kb=kb-it-support
   ```
4. 确认 `/api/config` 正常返回
5. 确认上传文档与问答链路正常
6. 确认 iframe 中终端用户无法切换知识库

---

## 8. 相关文档

- `docs/chat-integration/frontend-widget.md`
- `docs/chat-integration/demo-guide.md`
- `docs/chat-integration/embed-handoff-template.md`
