# 猩伙伴民宿官网

> 长沙城市精品美宿官网 | 房源展示 · 在线预订 · AI 客服

## 项目简介

猩伙伴民宿是一家专注长沙城市精品美宿的品牌官网。精选长沙核心地段高品质房源，由国际设计师打造独特居住空间，提供房源展示、在线预订、AI 客服咨询等功能。

**技术栈**：Node.js + Express.js / Vanilla JS 前端 / JSON 文件存储

---

## 功能特性

### 房源展示
- 三大小区入口（保利国际广场、建发养云、北辰三角洲）
- 21 套精选房源横向滚动展示
- 房源详情页：图片画廊、基础设施、交通信息

### AI 客服
- 基于 Wiki 知识库检索 + LLM 对话
- 支持多模型：千问、智谱 GLM、Kimi、DeepSeek
- 无 API Key 时自动降级到规则引擎（关键词匹配）

### 管理后台
- 小区管理：增删改查
- 房源管理：增删改查 + 多图上传
- 知识库设置：在线编辑 Markdown 文件
- 客服消息记录查看

---

## 项目结构

```
xinghuoban/
├── server/
│   ├── index.js              # Express 主服务器（约1100行）
│   ├── seed-admin.js         # 管理员初始化工具
│   └── database/
│       └── data.json         # JSON 数据存储（房源、小区、管理员）
├── knowledge/                # Wiki 知识库（Markdown）
│   ├── index.md              # 品牌介绍
│   ├── location.md           # 位置交通
│   ├── pricing.md            # 价格咨询
│   ├── booking.md            # 预订方式
│   ├── amenities.md          # 设施介绍
│   └── rooms.md              # 房源房间
├── js/
│   ├── data.js               # 前端静态数据（21套房源、3个小区）
│   ├── main.js              # 首页交互逻辑
│   ├── property.js          # 房源详情页逻辑
│   └── icons.js             # SVG 图标库
├── css/
│   └── style.css            # 全局样式
├── images/                   # 图片资源
│   ├── baoli.jpg            # 保利国际广场背景
│   ├── jianfa.jpg           # 建发养云背景
│   ├── beichen.jpg          # 北辰三角洲背景
│   ├── hero.jpg             # 首页 Hero 背景
│   ├── logo.jpg             # Logo
│   └── properties/           # 21套房源图片（每套6张）
├── uploads/                  # 上传文件目录
├── tests/                    # 测试文件
│   ├── api.test.js          # API 集成测试
│   ├── test-data.json       # 测试数据
│   └── test-knowledge/      # 测试用知识库
├── index.html               # 官网首页
├── property.html            # 房源详情页
├── admin.html               # 管理后台
├── package.json
└── CLAUDE.md                # 开发文档
```

---

## 快速开始

### 环境要求
- Node.js 18+

### 安装依赖

```bash
npm install
```

### 启动服务

```bash
npm start
# 访问 http://localhost:4000
```

### 运行测试

```bash
npm test
```

---

## 环境变量

| 变量 | 必需 | 默认值 | 说明 |
|------|------|--------|------|
| `PORT` | 否 | 4000 | 服务端口 |
| `AI_API_KEY` | 否 | - | AI 模型 API Key（无则降级到规则引擎）|
| `AI_MODEL` | 否 | qwen | 模型名：`qwen`/`glm`/`kimi`/`deepseek` |
| `DEEPSEEK_API_KEY` | 否 | - | DeepSeek API Key（自动优先使用）|
| `DEEPSEEK_BASE_URL` | 否 | 官方地址 | DeepSeek API 地址 |

### 生产环境启动示例

```bash
# 使用 PM2
AI_API_KEY=sk-xxx AI_MODEL=qwen pm2 start server/index.js --name xinghuoban

# 使用 DeepSeek
DEEPSEEK_API_KEY=sk-xxx DEEPSEEK_BASE_URL=https://api.deepseek.com npm start
```

---

## API 文档

### 公开接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/communities` | GET | 获取小区列表（分页）|
| `GET /api/properties` | GET | 获取房源列表（分页）|
| `GET /api/properties/:id` | GET | 获取房源详情 |
| `POST /api/ai/chat` | POST | AI 对话（非流式）|
| `POST /api/ai/chat/stream` | POST | AI 对话（流式 SSE）|
| `GET /api/chat-logs` | GET | 获取对话记录 |
| `GET /api/knowledge/files` | GET | 获取知识库文件列表 |
| `GET /api/knowledge/files/:filename` | GET | 获取知识库文件内容 |
| `POST /api/upload` | POST | 单图上传 |
| `GET /health` | GET | 健康检查 |

### 鉴权接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `POST /api/admin/login` | POST | 管理员登录 |
| `POST /api/admin/logout` | POST | 退出登录 |
| `PUT /api/admin/password` | PUT | 修改密码（需登录）|
| `POST /api/admin/register` | POST | 新增管理员（需登录）|
| `POST /api/communities` | POST | 添加/更新小区（需登录）|
| `DELETE /api/communities/:id` | DELETE | 删除小区（需登录）|
| `POST /api/properties` | POST | 添加/更新房源（需登录）|
| `DELETE /api/properties/:id` | DELETE | 删除房源（需登录）|
| `PUT /api/knowledge/files/:filename` | PUT | 保存知识库文件（需登录）|

### 鉴权方式

登录成功后，后端返回 token，之后请求 Header 携带：

```
Authorization: Bearer <token>
```

**默认管理员账号**：手机号和密码由管理员在种子数据中设置

---

## AI 客服架构

```
用户提问
    ↓
关键词提取 + 知识库文件匹配（tag 检索，最多加载 3 个相关文件）
    ↓
构建 Prompt（知识库内容 + 最近 10 条对话历史）
    ↓
有 AI_API_KEY → 调用 LLM 流式返回
无 AI_API_KEY → 规则引擎降级（本地关键词匹配回复）
    ↓
存储对话记录到 data.json
```

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
2. 「网站」→ 添加站点 → 反代到 `localhost:4000`
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
  "chat_logs": [{ "type": "user", "message": "...", "time": "2026-05-26T..." }]
}
```

### 注意事项

- **data.json** 是单文件存储，适合 < 100 QPS 的中小型站点
- **knowledge/** 目录需设置权限 755
- **uploads/** 目录需设置权限 755
- 定期备份 `server/database/data.json` 和 `knowledge/` 目录
- **API Key 只通过环境变量注入**，不写入磁盘

---

## 许可证

MIT License