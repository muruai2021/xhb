# Xinghuoban Homestay Official Website

> Changsha Urban Boutique Homestay — Property Showcase · Online Booking · AI Customer Service

## Overview

Xinghuoban is a boutique homestay brand specializing in high-quality urban accommodations in Changsha, China. The official website showcases curated properties, enables online bookings, and provides AI-powered customer service.

**Tech Stack**: Node.js + Express.js / Vanilla JS Frontend / JSON File Storage

---

## Features

### Property Showcase
- Three community entrances: Baoli International Plaza, Jianfa Yangyun, Beichen Delta
- 21 curated properties in horizontal scroll gallery
- Property detail pages: image gallery, amenities, transportation info

### AI Customer Service
- Wiki knowledge base retrieval + LLM dialogue
- Multi-model support: Qwen, Zhipu GLM, Kimi, DeepSeek
- Automatic fallback to rule-based engine when no API key is configured

### Admin Dashboard
- Community management (CRUD)
- Property management (CRUD + multi-image upload)
- Knowledge base settings (online Markdown editor)
- Chat log viewer

---

## Project Structure

```
xinghuoban/
├── server/
│   ├── index.js              # Express main server (~1100 lines)
│   ├── seed-admin.js         # Admin initialization utility
│   └── database/
│       └── data.json         # JSON data store (properties, communities, admins)
├── knowledge/                # Wiki knowledge base (Markdown files)
│   ├── index.md              # Brand introduction
│   ├── location.md           # Location & transport
│   ├── pricing.md            # Pricing inquiries
│   ├── booking.md            # Booking methods
│   ├── amenities.md          # Facilities & amenities
│   └── rooms.md              # Room listings
├── js/
│   ├── data.js               # Frontend static data (21 properties, 3 communities)
│   ├── main.js              # Homepage interaction logic
│   ├── property.js          # Property detail page logic
│   └── icons.js             # SVG icon library
├── css/
│   └── style.css            # Global styles
├── images/                   # Image assets
│   ├── baoli.jpg            # Baoli International Plaza banner
│   ├── jianfa.jpg           # Jianfa Yangyun banner
│   ├── beichen.jpg          # Beichen Delta banner
│   ├── hero.jpg             # Homepage hero background
│   ├── logo.jpg             # Logo
│   └── properties/           # 21 properties × 6 images each
├── uploads/                  # Uploaded files directory
├── tests/                    # Test files
│   ├── api.test.js          # API integration tests
│   ├── test-data.json       # Test data
│   └── test-knowledge/      # Test knowledge base
├── index.html               # Homepage
├── property.html            # Property detail page
├── admin.html               # Admin dashboard
├── package.json
└── CLAUDE.md                # Developer documentation
```

---

## Quick Start

### Requirements
- Node.js 18+

### Install Dependencies

```bash
npm install
```

### Start Server

```bash
npm start
# Visit http://localhost:4000
```

### Run Tests

```bash
npm test
```

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 4000 | Server port |
| `AI_API_KEY` | No | - | AI model API key (falls back to rule engine if unset) |
| `AI_MODEL` | No | qwen | Model name: `qwen`/`glm`/`kimi`/`deepseek` |
| `DEEPSEEK_API_KEY` | No | - | DeepSeek API key (auto-detected, takes priority) |
| `DEEPSEEK_BASE_URL` | No | official | DeepSeek API endpoint |

### Production Start Examples

```bash
# Using PM2
AI_API_KEY=sk-xxx AI_MODEL=qwen pm2 start server/index.js --name xinghuoban

# Using DeepSeek
DEEPSEEK_API_KEY=sk-xxx DEEPSEEK_BASE_URL=https://api.deepseek.com npm start
```

---

## API Reference

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/communities` | GET | List communities (paginated) |
| `GET /api/properties` | GET | List properties (paginated) |
| `GET /api/properties/:id` | GET | Get property details |
| `POST /api/ai/chat` | POST | AI chat (non-streaming) |
| `POST /api/ai/chat/stream` | POST | AI chat (streaming SSE) |
| `GET /api/chat-logs` | GET | Get chat logs |
| `GET /api/knowledge/files` | GET | List knowledge base files |
| `GET /api/knowledge/files/:filename` | GET | Get knowledge base file content |
| `POST /api/upload` | POST | Single image upload |
| `GET /health` | GET | Health check |

### Authenticated Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/admin/login` | POST | Admin login |
| `POST /api/admin/logout` | POST | Logout |
| `PUT /api/admin/password` | PUT | Change password (requires auth) |
| `POST /api/admin/register` | POST | Create admin account (requires auth) |
| `POST /api/communities` | POST | Add/update community (requires auth) |
| `DELETE /api/communities/:id` | DELETE | Delete community (requires auth) |
| `POST /api/properties` | POST | Add/update property (requires auth) |
| `DELETE /api/properties/:id` | DELETE | Delete property (requires auth) |
| `PUT /api/knowledge/files/:filename` | PUT | Save knowledge file (requires auth) |

### Authentication

After successful login, include the token in subsequent requests:

```
Authorization: Bearer <token>
```

**Default Admin**: Credentials are set during initial admin setup

---

## AI Customer Service Architecture

```
User Question
    ↓
Keyword Extraction + Knowledge Base Matching (tag-based, max 3 files)
    ↓
Build Prompt (knowledge content + last 10 chat messages)
    ↓
With AI_API_KEY → LLM streaming response
Without AI_API_KEY → Rule-based fallback (local keyword matching)
    ↓
Save chat log to data.json
```

---

## Deployment

### Tencent Cloud Server + PM2

```bash
# 1. Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Install PM2
sudo npm install -g pm2

# 3. Upload project to /www/wwwroot/xinghuoban/
# 4. Install dependencies
cd /www/wwwroot/xinghuoban
npm install

# 5. Start with environment variables
AI_API_KEY=sk-xxx AI_MODEL=qwen pm2 start server/index.js --name xinghuoban
pm2 save
pm2 startup

# 6. Configure reverse proxy + SSL with宝塔 panel
```

### 宝塔 Panel Configuration

1. 「Software Store」→ Node.js Version Manager → Add project
2. 「Website」→ Add site → Reverse proxy to `localhost:4000`
3. Apply for Let's Encrypt SSL certificate

---

## Data Notes

### data.json Structure

```json
{
  "_incrementalId": 1,
  "admins": [{ "phone": "15874818550", "password": "$2b$10$..." }],
  "communities": [{ "id": "baoli", "name": "Baoli International Plaza", ... }],
  "properties": [{ "id": 1, "name": "Fuxing Base", "community": "baoli", ... }],
  "chat_logs": [{ "type": "user", "message": "...", "time": "2026-05-26T..." }]
}
```

### Important Notes

- **data.json** uses single-file storage, suitable for sites < 100 QPS
- **knowledge/** directory requires permission 755
- **uploads/** directory requires permission 755
- Regularly back up `server/database/data.json` and `knowledge/` directory
- **API keys are injected via environment variables only**, never written to disk

---

## License

MIT License