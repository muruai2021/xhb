# 猩伙伴民宿官网

## 项目概述

- **项目名称**：猩伙伴民宿官网
- **描述**：长沙城市精品美宿官网，提供房源展示、在线预订、AI客服功能
- **技术栈**：Node.js + Express.js / Vanilla JS 前端 / JSON 文件存储
- **服务端口**：4000
- **HTTPS**：生产环境需配置（宝塔面板）

---

## 项目结构

```
xinghuoban/
├── server/
│   ├── index.js              # Express 主服务器
│   ├── seed-admin.js         # 管理员初始化工具
│   └── database/
│       └── data.json         # JSON 数据存储
├── knowledge/               # Wiki 知识库（Markdown 文件）
│   ├── index.md             # 猩伙伴民宿介绍
│   ├── location.md          # 位置交通指引
│   ├── pricing.md           # 价格咨询
│   ├── booking.md           # 预订方式
│   ├── amenities.md          # 设施介绍
│   └── rooms.md             # 房源房间
├── js/
│   ├── data.js              # 前端静态数据
│   ├── main.js              # 首页逻辑
│   ├── property.js          # 房源详情页逻辑
│   └── icons.js             # SVG 图标库
├── css/
│   └── style.css            # 全局样式
├── images/                  # 图片资源
├── uploads/                  # 上传文件目录
├── tests/                    # 测试文件
├── admin.html               # 管理后台
├── index.html               # 官网首页
├── property.html            # 房源详情页
├── package.json
├── README.md               # 中文说明文档
└── README_EN.md            # English documentation
```

---

## 开发指南

### 启动开发服务器

```bash
npm start
# 访问 http://localhost:4000
```

### 安装依赖

```bash
npm install
```

### 运行测试

```bash
npm test
```

### 依赖说明

| 包 | 用途 |
|-----|------|
| express | Web 框架 |
| bcrypt | 密码哈希 |
| express-rate-limit | 登录速率限制 |
| helmet | 安全响应头 |
| multer | 文件上传 |
| cors | 跨域资源共享 |
| jest + supertest | 测试框架 |

---

## 环境变量

**注意**：AI API Key 通过环境变量注入，**严禁**写入代码或 data.json。

| 变量 | 必需 | 说明 |
|------|------|------|
| `PORT` | 否 | 服务器端口，默认 4000 |
| `AI_API_KEY` | 否 | AI 模型 API Key，无则规则引擎降级 |
| `AI_MODEL` | 否 | 模型名，默认 `qwen`，可选 `glm`、`kimi`、`deepseek` |
| `DEEPSEEK_API_KEY` | 否 | DeepSeek API Key（自动检测） |
| `DEEPSEEK_BASE_URL` | 否 | DeepSeek API 地址（默认官方） |

### 生产环境注入方式

```bash
# PM2 启动时注入
AI_API_KEY=sk-xxx AI_MODEL=qwen pm2 start server/index.js --name xinghuoban
```

---

## API 路由

### 公开接口

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/communities` | GET | 获取小区列表 |
| `/api/properties` | GET | 获取房源列表 |
| `/api/properties/:id` | GET | 获取房源详情 |
| `/api/ai/chat` | POST | AI 对话（非流式）|
| `/api/ai/chat/stream` | POST | AI 对话（流式 SSE）|
| `/api/chat-logs` | GET | 获取对话记录 |
| `/api/knowledge/files` | GET | 获取知识库文件列表 |
| `/api/knowledge/files/:filename` | GET | 获取知识库文件内容 |
| `/api/upload` | POST | 单图上传 |
| `/api/upload/multiple` | POST | 多图上传 |
| `/health` | GET | 健康检查 |

### 鉴权接口（需登录）

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/admin/login` | POST | 管理员登录 |
| `/api/admin/logout` | POST | 登出 |
| `/api/admin/password` | PUT | 修改密码 |
| `/api/admin/register` | POST | 新增管理员 |
| `/api/communities` | POST | 添加/更新小区 |
| `/api/communities/:id` | DELETE | 删除小区 |
| `/api/properties` | POST | 添加/更新房源 |
| `/api/properties/:id` | DELETE | 删除房源 |
| `/api/knowledge/files/:filename` | PUT | 保存知识库文件 |

### 管理后台鉴权

登录后获取 Token，之后请求 Header 携带：
```
Authorization: Bearer <token>
```

**初始账号**：手机号 `15874818550` / 密码 `123456`

---

## AI 客服功能

### 架构

```
用户提问 → 关键词提取 + 知识库文件匹配（tag 检索，最多 3 个文件）
    ↓
构建 Prompt（知识库内容 + 最近 10 条对话历史）
    ↓
有 AI_API_KEY → 调用 LLM 流式返回
无 AI_API_KEY → 规则引擎降级（本地关键词匹配）
    ↓
存储对话记录到 data.json
```

### 知识库文件

每个 .md 文件顶部带 tags 用于匹配：

```md
---
tags: [位置, 地址, 在哪, 交通, 地铁]
---
# 标题

内容...
```

### 支持的模型

| 模型 | 环境变量值 |
|------|------------|
| 千问 (Qwen) | `qwen`（默认） |
| 智谱 (GLM) | `glm` |
| Kimi | `kimi` |
| DeepSeek | `deepseek`（自动检测 DEEPSEEK_API_KEY）|

### 缓存策略

| 数据 | TTL | 说明 |
|------|-----|------|
| Wiki 文件索引 | 60秒 | 避免每次请求读文件系统 |
| Wiki 文件内容 | 60秒 | 缓存已读取的文件内容 |
| 对话历史 | 内存中 | 最近 10 条用于构建 Prompt |

---

## 管理后台

- **URL**：`http://localhost:4000/admin.html`
- **功能模块**：小区管理、房源管理、知识库设置、客服咨询记录
- **初始账号**：手机号 `15874818550` / 密码 `123456`

---

## 安全规范

### 密钥安全

1. **API Key 环境变量注入**：生产环境通过 PM2/systemd 注入
2. **不提交到 Git**：.env 和任何含密钥的文件必须在 .gitignore 中

### 密码安全

- 使用 bcrypt 哈希（自动升级旧版 SHA256）
- 登录接口有速率限制（5次/分钟）

### 安全头

- 使用 helmet 设置 CSP、安全头
- 文件上传有扩展名白名单和大小限制（5MB）

---

## 部署指南

### 腾讯轻量服务器 + PM2

```bash
# 1. 安装 Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 安装 PM2
sudo npm install -g pm2

# 3. 上传项目到 /www/wwwroot/xinghuoban/

# 4. 安装依赖
cd /www/wwwroot/xinghuoban
npm install

# 5. 启动（注入环境变量）
AI_API_KEY=sk-xxx AI_MODEL=qwen pm2 start server/index.js --name xinghuoban
pm2 save
pm2 startup

# 6. 宝塔配置反向代理 + SSL
```

### 宝塔面板配置

1. 「软件商店」→ Node.js 版本管理器 → 添加项目
2. 「网站」→ 添加站点 → 反向代理到 localhost:4000
3. 申请 Let's Encrypt SSL 证书

---

## 数据说明

### data.json 结构

```json
{
  "_incrementalId": 1,
  "admins": [{ "phone": "15874818550", "password": "$2b$10$..." }],
  "communities": [{ "id": "baoli", "name": "保利国际广场", ... }],
  "properties": [{ "id": 1, "name": "复兴基地", "community": "baoli", ... }],
  "chat_logs": [{ "type": "user", "message": "...", "time": "..." }]
}
```

### 注意事项

1. **data.json 是单文件存储**，高并发写入可能冲突（当前架构适合 < 100 QPS）
2. **知识库目录** `knowledge/` 需设置权限 755
3. **上传目录** `uploads/` 需设置权限 755
4. **定期备份** `server/database/data.json` 和 `knowledge/` 目录
5. **AI API Key** 只通过环境变量注入，不存磁盘

---

## 工作流程

### 修复 Bug

1. 复现问题
2. 定位相关文件
3. 修改代码
4. 验证修复

### 添加功能

1. 理解需求
2. 确认 API 设计
3. 后端实现（server/index.js）
4. 前端实现（js/*.js + html）
5. 测试验证

---

## 目录权限

| 目录 | 最低权限 | 说明 |
|------|---------|------|
| knowledge/ | 755 | Wiki Markdown 文件 |
| uploads/ | 755 | 上传的图片文件 |
| server/database/ | 755 | data.json 所在目录 |