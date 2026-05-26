// 猩伙伴民宿官网 - Express服务器
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// 环境变量配置
const AI_API_KEY = process.env.AI_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || (process.env.DEEPSEEK_API_KEY ? 'deepseek' : 'qwen');
const PORT = process.env.PORT || 4000;

// 知识库目录
const knowledgeDir = path.join(__dirname, '..', 'knowledge');
const KNOWLEDGE_FILES = ['index.md', 'location.md', 'pricing.md', 'booking.md', 'amenities.md', 'rooms.md'];
const KNOWLEDGE_CACHE_TTL = 60000; // 60秒
const WIKI_CONTEXT_LIMIT = 3; // 最多加载3个相关文件

const app = express();

// ==================== Token 存储（带过期时间，按账号索引）====================
const activeTokens = new Map(); // Map<phone, Map<token, expiresAt>>

// ==================== 简单内存缓存 ====================
const cache = new Map();
const CACHE_TTL = 30000; // 30秒

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL });
}

function clearCache() {
  cache.clear();
}

// ==================== 中间件 ====================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));

// 静态资源 - 提供前端页面和 uploads（API 路由在前面）
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// 文件上传配置
const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${safeBase}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpeg|jpg|png|gif|webp)$/i;
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.test(file.originalname) && allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传图片文件（jpeg/jpg/png/gif/webp）'));
    }
  }
});

// ==================== 数据文件路径 ====================
const dataFile = path.join(__dirname, 'database', 'data.json');
const dbDir = path.join(__dirname, 'database');
fs.mkdir(dbDir, { recursive: true }).catch(() => {});

// 初始默认数据
const defaultData = {
  _incrementalId: 1,
  admins: [],
  chat_logs: [],
  properties: [],
  communities: [],
  knowledge: []
};

async function loadData() {
  try {
    const content = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.error('读取 data.json 失败，回退到默认数据:', e.message);
    return { ...defaultData };
  }
}

async function saveData(data) {
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
  clearCache();
}

// ==================== 登录速率限制 ====================
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 5次
  message: { success: false, message: '登录尝试过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});

// ==================== 清理过期数据 ====================
const MAX_CHAT_LOGS = 1000;
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24小时

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [phone, tokens] of activeTokens) {
    for (const [token, expiresAt] of tokens) {
      if (now > expiresAt) tokens.delete(token);
    }
    if (tokens.size === 0) activeTokens.delete(phone);
  }
}

function cleanupChatLogs(data) {
  if (data.chat_logs && data.chat_logs.length > MAX_CHAT_LOGS) {
    data.chat_logs = data.chat_logs.slice(-MAX_CHAT_LOGS);
  }
}

// 定期清理过期 token（每小时）
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

// ==================== 统一响应格式 ====================
function successRes(res, data, message) {
  res.json({ success: true, data, message });
}

function errorRes(res, status, message) {
  res.status(status).json({ success: false, message });
}

// ==================== 鉴权中间件 ====================
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();

  if (!token) {
    return errorRes(res, 401, '未授权，请先登录管理后台');
  }

  // 检查 token 是否存在且未过期
  for (const [phone, tokens] of activeTokens) {
    if (tokens.has(token)) {
      if (Date.now() > tokens.get(token)) {
        tokens.delete(token);
        return errorRes(res, 401, '登录已过期，请重新登录');
      }
      req.auth = { phone, token };
      return next();
    }
  }

  return errorRes(res, 401, '无效的登录凭证');
}

// ==================== API ====================

// 小区列表（支持分页）
app.get('/api/communities', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const data = getCached('communities') || await loadData();
    const communities = data.communities || [];
    const start = (page - 1) * limit;
    const paginated = communities.slice(start, start + parseInt(limit));
    setCache('communities', data);
    successRes(res, {
      items: paginated,
      total: communities.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (e) {
    console.error('GET /api/communities error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 添加 / 更新小区（需鉴权）
app.post('/api/communities', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const { id, name, area, metro, address, description } = req.body;

    if (!name) return errorRes(res, 400, '小区名称为必填字段');

    if (id) {
      const index = data.communities.findIndex(c => c.id === id);
      if (index !== -1) {
        data.communities[index] = { ...data.communities[index], name, area, metro, address, description };
      } else {
        return errorRes(res, 404, '小区未找到');
      }
    } else {
      const newId = 'community_' + Date.now();
      data.communities.push({ id: newId, name, area, metro, address, description, propertyCount: 0 });
    }
    await saveData(data);
    successRes(res, null, '保存成功');
  } catch (e) {
    console.error('POST /api/communities error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 删除小区（需鉴权）
app.delete('/api/communities/:id', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const before = data.communities.length;
    data.communities = data.communities.filter(c => c.id !== req.params.id);
    if (data.communities.length === before) {
      return errorRes(res, 404, '小区未找到');
    }
    await saveData(data);
    successRes(res, null, '小区已删除');
  } catch (e) {
    console.error('DELETE /api/communities error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 房源列表（支持分页）
app.get('/api/properties', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const data = getCached('properties') || await loadData();
    const properties = data.properties || [];
    const start = (page - 1) * limit;
    const paginated = properties.slice(start, start + parseInt(limit));
    setCache('properties', data);
    successRes(res, {
      items: paginated,
      total: properties.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (e) {
    console.error('GET /api/properties error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 单个房源详情
app.get('/api/properties/:id', async (req, res) => {
  try {
    const data = await loadData();
    const property = data.properties.find(p => p.id === parseInt(req.params.id, 10));
    if (!property) return errorRes(res, 404, '房源不存在');
    successRes(res, property);
  } catch (e) {
    console.error('GET /api/properties/:id error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 添加 / 更新房源（需鉴权）
app.post('/api/properties', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const { id, name, community, communityName, type, capacity, area, price, tags, isLuxury, features, address, image, images } = req.body;

    if (!name) return errorRes(res, 400, '房源名称为必填字段');

    if (id) {
      const index = data.properties.findIndex(p => p.id === parseInt(id, 10));
      if (index !== -1) {
        data.properties[index] = {
          ...data.properties[index],
          name, community, communityName, type, capacity, area, price, tags, isLuxury, features, address,
          ...(image !== undefined && { image }),
          ...(images !== undefined && { images })
        };
      } else {
        return errorRes(res, 404, '房源未找到');
      }
    } else {
      const newId = (data._incrementalId || 1);
      data._incrementalId = newId + 1;
      data.properties.push({
        id: newId,
        name, community, communityName, type, capacity, area, price, tags, isLuxury, features, address,
        image: image || '',
        images: images || []
      });
    }
    await saveData(data);
    successRes(res, null, '保存成功');
  } catch (e) {
    console.error('POST /api/properties error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 删除房源（需鉴权）
app.delete('/api/properties/:id', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const targetId = parseInt(req.params.id, 10);
    const before = data.properties.length;
    data.properties = data.properties.filter(p => p.id !== targetId);
    if (data.properties.length === before) {
      return errorRes(res, 404, '房源未找到');
    }
    await saveData(data);
    successRes(res, null, '房源已删除');
  } catch (e) {
    console.error('DELETE /api/properties error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 管理员登录
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  try {
    const data = await loadData();
    const { phone, password } = req.body;

    if (!phone || !password) {
      return errorRes(res, 400, '手机号和密码不能为空');
    }

    const admin = data.admins.find(a => a.phone === phone);
    if (!admin) {
      return errorRes(res, 401, '手机号或密码错误');
    }

    // 验证密码（支持 bcrypt 和旧版明文/SHA256 兼容）
    let isValid = false;
    if (admin.password.startsWith('$2')) {
      isValid = await bcrypt.compare(password, admin.password);
    } else if (admin.password.length === 64) {
      // 旧版 SHA256 哈希
      const hashed = crypto.createHash('sha256').update(password).digest('hex');
      if (hashed === admin.password) isValid = true;
    } else if (admin.password === password) {
      isValid = true;
    }

    if (!isValid) {
      return errorRes(res, 401, '手机号或密码错误');
    }

    // 自动升级旧版密码为 bcrypt
    if (!admin.password.startsWith('$2')) {
      const idx = data.admins.indexOf(admin);
      data.admins[idx].password = await bcrypt.hash(password, 10);
      await saveData(data);
    }

    // 生成安全 token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + TOKEN_EXPIRY;

    if (!activeTokens.has(phone)) {
      activeTokens.set(phone, new Map());
    }
    activeTokens.get(phone).set(token, expiresAt);

    successRes(res, { token }, '登录成功');
  } catch (e) {
    console.error('POST /api/admin/login error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 退出登录（清除当前 token）
app.post('/api/admin/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (token) {
      for (const [phone, tokens] of activeTokens) {
        if (tokens.has(token)) {
          tokens.delete(token);
          break;
        }
      }
    }
    successRes(res, null, '已退出登录');
  } catch (e) {
    console.error('POST /api/admin/logout error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 修改密码（需鉴权）
app.put('/api/admin/password', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const { phone, oldPassword, newPassword } = req.body;

    if (!phone || !oldPassword || !newPassword) {
      return errorRes(res, 400, '手机号、旧密码、新密码均不能为空');
    }
    if (newPassword.length < 6) {
      return errorRes(res, 400, '新密码不能少于 6 位');
    }

    const idx = data.admins.findIndex(a => a.phone === phone);
    if (idx === -1) {
      return errorRes(res, 401, '手机号或旧密码错误');
    }

    const admin = data.admins[idx];
    let isValid = false;

    // 验证旧密码
    if (admin.password.startsWith('$2')) {
      isValid = await bcrypt.compare(oldPassword, admin.password);
    } else if (admin.password.length === 64) {
      const hashed = crypto.createHash('sha256').update(oldPassword).digest('hex');
      if (hashed === admin.password) isValid = true;
    } else if (admin.password === oldPassword) {
      isValid = true;
    }

    if (!isValid) {
      return errorRes(res, 401, '手机号或旧密码错误');
    }

    // 更新为 bcrypt 哈希
    data.admins[idx].password = await bcrypt.hash(newPassword, 10);
    // 修改密码后清除该账号所有 token，下次需重新登录
    activeTokens.delete(phone);
    await saveData(data);

    successRes(res, null, '密码修改成功，请重新登录');
  } catch (e) {
    console.error('PUT /api/admin/password error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 新增管理员账号（需鉴权）
app.post('/api/admin/register', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const { phone, password } = req.body;

    if (!phone || !password) {
      return errorRes(res, 400, '手机号和密码不能为空');
    }
    if (password.length < 6) {
      return errorRes(res, 400, '密码不能少于 6 位');
    }
    if (data.admins.some(a => a.phone === phone)) {
      return errorRes(res, 409, '该手机号已注册');
    }

    const hashedPwd = await bcrypt.hash(password, 10);
    data.admins.push({ phone, password: hashedPwd });
    await saveData(data);
    successRes(res, null, '新管理员已添加');
  } catch (e) {
    console.error('POST /api/admin/register error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// AI 对话（Wiki 知识库 + LLM）
app.post('/api/ai/chat', async (req, res) => {
  try {
    const data = await loadData();
    const { message } = req.body;

    if (!message || message.length > 1000) {
      return errorRes(res, 400, '消息内容无效');
    }

    cleanupChatLogs(data);
    data.chat_logs.push({ type: 'user', message, time: new Date().toISOString() });

    // 生成回复
    const reply = await generateAIReply(message, data.chat_logs);

    data.chat_logs.push({ type: 'bot', message: reply, time: new Date().toISOString() });
    await saveData(data);
    successRes(res, { reply });
  } catch (e) {
    console.error('POST /api/ai/chat error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// AI 对话（流式）
app.post('/api/ai/chat/stream', async (req, res) => {
  try {
    const data = await loadData();
    const { message } = req.body;

    if (!message || message.length > 1000) {
      return errorRes(res, 400, '消息内容无效');
    }

    cleanupChatLogs(data);
    data.chat_logs.push({ type: 'user', message, time: new Date().toISOString() });

    // 查找相关 Wiki 文件
    const relevantFiles = await findRelevantWikiFiles(message);
    let wikiContents = '';
    if (relevantFiles.length > 0) {
      const contents = await Promise.all(relevantFiles.map(f => loadWikiFile(f.filename)));
      wikiContents = contents.map((c, i) => `【${relevantFiles[i].filename}】\n${c}`).join('\n\n');
    } else {
      wikiContents = await loadWikiFile('index.md');
    }
    const recentHistory = data.chat_logs.slice(-10);
    const prompt = buildPrompt(message, wikiContents, recentHistory);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullReply = '';
    for await (const chunk of callLLMStream(prompt)) {
      fullReply += chunk;
      res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
    }

    data.chat_logs.push({ type: 'bot', message: fullReply, time: new Date().toISOString() });
    await saveData(data);
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e) {
    console.error('POST /api/ai/chat/stream error:', e);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 从 knowledgeDir 读取并解析 .md 文件的 tags
async function getWikiIndex() {
  const cached = cache.get('wiki:index');
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const index = [];
  for (const filename of KNOWLEDGE_FILES) {
    try {
      const content = await fs.readFile(path.join(knowledgeDir, filename), 'utf8');
      const tagsMatch = content.match(/tags:\s*\[([^\]]*)\]/);
      const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];
      index.push({ filename, tags });
    } catch {
      index.push({ filename, tags: [] });
    }
  }
  cache.set('wiki:index', { data: index, expiresAt: Date.now() + KNOWLEDGE_CACHE_TTL });
  return index;
}

// 加载 Wiki 文件内容
async function loadWikiFile(filename) {
  const cacheKey = `wiki:file:${filename}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const filePath = path.join(knowledgeDir, filename);
  const content = await fs.readFile(filePath, 'utf8');
  const plainContent = content.replace(/^---\n[\s\S]*?\n---\n/, '');
  cache.set(cacheKey, { data: plainContent, expiresAt: Date.now() + KNOWLEDGE_CACHE_TTL });
  return plainContent;
}

// 提取关键词（支持中英文混合）
function extractKeywords(text) {
  const lower = text.toLowerCase();
  const keywords = [];

  // 提取英文单词
  const englishWords = lower
    .replace(/[^a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(k => k.length > 1);
  keywords.push(...englishWords);

  // 提取中文单字
  const chineseChars = lower.match(/[一-龥]/g) || [];
  keywords.push(...chineseChars);

  // 提取中文双字词（滑动窗口）
  for (let i = 0; i < lower.length - 1; i++) {
    const c1 = lower[i];
    const c2 = lower[i + 1];
    if (/[一-龥]/.test(c1) && /[一-龥]/.test(c2)) {
      keywords.push(c1 + c2);
    }
  }

  return [...new Set(keywords)];
}

// 查找相关 Wiki 文件（基于 tag 匹配）
async function findRelevantWikiFiles(message) {
  const index = await getWikiIndex();
  const keywords = extractKeywords(message);

  const scored = index.map(item => {
    let matchCount = 0;
    for (const tag of item.tags) {
      const tagLower = tag.toLowerCase();
      // 检查 tag 是否包含任意 keyword
      if (keywords.some(kw => tagLower.includes(kw))) {
        matchCount++;
      }
      // 检查 keyword 是否包含 tag
      else if (keywords.some(kw => kw.includes(tagLower))) {
        matchCount++;
      }
    }
    return { filename: item.filename, score: matchCount };
  });

  return scored
    .filter(f => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, WIKI_CONTEXT_LIMIT);
}

// 构建 LLM prompt
function buildPrompt(userMessage, wikiContents, chatHistory) {
  const systemPrompt = `你是猩伙伴民宿的AI客服。请根据以下知识库内容，准确回答用户的问题。

回答要求：
1. 基于提供的知识库内容回答，不要编造信息
2. 如果知识库中没有相关信息，可以说"这个问题我暂时无法解答，建议您电话咨询15874818550"
3. 回答要友好、专业
4. 使用纯文本格式回复，不要使用任何 Markdown 符号（如**、•、#等）
5. 重要信息用「15874818550」标注电话

知识库内容：
${wikiContents}

-----------
最近的对话历史：
${chatHistory.map(m => `${m.type === 'user' ? '用户' : '客服'}：${m.message}`).join('\n')}

-----------
用户：${userMessage}
客服：`;

  return systemPrompt;
}

// 移除 Markdown 格式符号
function stripMarkdown(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // 移除 **粗体**
    .replace(/\*(.+?)\*/g, '$1')      // 移除 *斜体*
    .replace(/^#{1,6}\s+/gm, '')       // 移除 # 标题
    .replace(/^[-*+]\s+/gm, '· ')     // 列表项 - * + 改为 ·
    .replace(/^\d+\.\s+/gm, '')       // 移除数字列表
    .replace(/`(.+?)`/g, '$1')        // 移除行内代码
    .replace(/```[\s\S]*?```/g, '')   // 移除代码块
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // 移除链接
    .replace(/^\s*>\s+/gm, '');       // 移除引用
}

// 调用 LLM API（流式）
async function* callLLMStream(prompt) {
  const endpoints = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    kimi: 'https://api.moonshot.cn/v1/chat/completions',
    deepseek: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com') + '/chat/completions'
  };

  const modelMap = {
    qwen: 'qwen-max',
    glm: 'glm-4',
    kimi: 'kimi-vision',
    deepseek: 'deepseek-chat'
  };

  const endpoint = endpoints[AI_MODEL] || endpoints.qwen;
  const model = modelMap[AI_MODEL] || AI_MODEL;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      stream: true
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API 调用失败: ${response.status} ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {}
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// 非流式调用 LLM
async function callLLM(prompt) {
  const endpoints = {
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    glm: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    kimi: 'https://api.moonshot.cn/v1/chat/completions',
    deepseek: (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com') + '/chat/completions'
  };

  const modelMap = {
    qwen: 'qwen-max',
    glm: 'glm-4',
    kimi: 'kimi-vision',
    deepseek: 'deepseek-chat'
  };

  const endpoint = endpoints[AI_MODEL] || endpoints.qwen;
  const model = modelMap[AI_MODEL] || AI_MODEL;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API 调用失败: ${response.status} ${err}`);
  }

  const result = await response.json();
  const rawReply = result.choices?.[0]?.message?.content || '抱歉，我暂时无法回答这个问题。';
  return stripMarkdown(rawReply);
}

// 规则引擎回复（降级用）
const aiRules = [
  { keywords: ['位置', '在哪', '地址'], reply: '我们的房源分布在长沙三个小区：<br>• 保利国际广场（天心区，碧沙湖地铁站）<br>• 建发养云（开福区，开福寺地铁站）<br>• 北辰三角洲（开福区，北辰三角洲地铁站）<br>距地铁步行10分钟以内，一线江景。' },
  { keywords: ['户型', '几卧', '多少人'], reply: '我们有21套房源，户型从一卧到三卧不等：<br>• 一卧：可住2大人+1幼儿<br>• 两卧：可住4大人或4大人2小孩<br>• 三卧：可住6大人<br>适合情侣、家庭、闺蜜聚会。' },
  { keywords: ['价格', '多少钱', '报价'], reply: '价格根据房型和日期不同，请拨打 <strong>15874818550</strong> 咨询！' },
  { keywords: ['预订', '预定', '预约', '订房'], reply: '预订请致电 <strong>15874818550</strong>（微信同号）！' },
  { keywords: ['联系', '电话', '微信'], reply: '客服电话：<strong>15874818550</strong><br>微信：同手机号<br>24小时在线为您服务！' },
  { keywords: ['特色', '特点'], reply: '我们的房源由伦敦艺术大学、格拉斯哥大学等国际设计师打造，每间都有独特风格：<br>• 一线江景，可看橘子洲头<br>• 艺术风格设计，拍照超美<br>• 五星床品、极米投影、麻将机' }
];

function generateRuleBasedReply(message) {
  const lower = message.toLowerCase();
  for (const rule of aiRules) {
    if (rule.keywords.some(kw => lower.includes(kw))) {
      return rule.reply;
    }
  }
  return '您好！我是猩伙伴AI客服。请问有什么可以帮助您的？如需了解房源详情或预订，请拨打 <strong>15874818550</strong>。';
}

// 生成回复（主函数）
async function generateAIReply(message, chatLogs) {
  // 无 API Key，降级到规则引擎
  if (!AI_API_KEY) {
    return generateRuleBasedReply(message);
  }

  try {
    // 1. 查找相关 Wiki 文件
    const relevantFiles = await findRelevantWikiFiles(message);

    // 2. 加载 Wiki 内容
    let wikiContents = '';
    if (relevantFiles.length > 0) {
      const contents = await Promise.all(relevantFiles.map(f => loadWikiFile(f.filename)));
      wikiContents = contents.map((c, i) => `【${relevantFiles[i].filename}】\n${c}`).join('\n\n');
    } else {
      // 没有匹配的文件，加载 index.md 作为默认
      wikiContents = await loadWikiFile('index.md');
    }

    // 3. 获取对话历史（最近10条）
    const recentHistory = chatLogs.slice(-10);

    // 4. 构建 Prompt
    const prompt = buildPrompt(message, wikiContents, recentHistory);

    // 5. 调用 LLM
    return await callLLM(prompt);

  } catch (e) {
    console.error('LLM 调用失败，降级到规则引擎:', e.message);
    return generateRuleBasedReply(message);
  }
}

// 最近 50 条聊天记录（支持分页）
app.get('/api/chat-logs', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const data = await loadData();
    const logs = data.chat_logs || [];
    const start = (page - 1) * limit;
    successRes(res, {
      items: logs.slice(start, start + parseInt(limit)),
      total: logs.length,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (e) {
    console.error('GET /api/chat-logs error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 图片上传
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return errorRes(res, 400, '没有上传文件');
  successRes(res, { url: '/uploads/' + req.file.filename });
});

// 多图上传
app.post('/api/upload/multiple', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) return errorRes(res, 400, '没有上传文件');
  const urls = req.files.map(f => '/uploads/' + f.filename);
  successRes(res, { urls });
});

// 内容管理
app.get('/api/content', async (req, res) => {
  try {
    const data = await loadData();
    successRes(res, data.content || []);
  } catch (e) {
    console.error('GET /api/content error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

app.post('/api/content', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const { id, platform, title, desc, publishTime, status, views } = req.body;

    if (!platform || !title) {
      return errorRes(res, 400, 'platform 与 title 为必填字段');
    }

    if (!data.content) data.content = [];

    if (id) {
      const idx = data.content.findIndex(c => c.id === parseInt(id, 10));
      if (idx !== -1) {
        data.content[idx] = { ...data.content[idx], platform, title, desc, publishTime, status, views };
      } else {
        return errorRes(res, 404, '内容未找到');
      }
    } else {
      const newId = (data._incrementalId || 1);
      data._incrementalId = newId + 1;
      data.content.push({ id: newId, platform, title, desc, publishTime, status, views: views || 0 });
    }
    await saveData(data);
    successRes(res, null, '保存成功');
  } catch (e) {
    console.error('POST /api/content error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

app.delete('/api/content/:id', requireAuth, async (req, res) => {
  try {
    const data = await loadData();
    const before = data.content ? data.content.length : 0;
    data.content = (data.content || []).filter(c => c.id !== parseInt(req.params.id, 10));
    if (data.content.length === before) {
      return errorRes(res, 404, '内容未找到');
    }
    await saveData(data);
    successRes(res, null, '删除成功');
  } catch (e) {
    console.error('DELETE /api/content error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// ==================== 知识库文件管理 ====================

// 解析 MD 文件顶部 tags
function parseFrontMatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { tags: [], content };
  const frontMatter = match[1];
  const tagsMatch = frontMatter.match(/tags:\s*\[([^\]]*)\]/);
  const tags = tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()) : [];
  const updatedMatch = frontMatter.match(/updatedAt:\s*(.+)/);
  return {
    tags,
    updatedAt: updatedMatch ? updatedMatch[1].trim() : null,
    content: content.replace(/^---\n[\s\S]*?\n---\n/, '')
  };
}

// 构建带 front-matter 的内容
function buildFrontMatter(tags, updatedAt) {
  return `---\ntags: [${tags.join(', ')}]\nupdatedAt: ${updatedAt}\n---\n`;
}

// 获取文件列表
app.get('/api/knowledge/files', async (req, res) => {
  try {
    const files = [];
    for (const filename of KNOWLEDGE_FILES) {
      const filePath = path.join(knowledgeDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const { tags, updatedAt } = parseFrontMatter(content);
        files.push({ filename, tags, updatedAt });
      } catch {
        files.push({ filename, tags: [], updatedAt: null });
      }
    }
    successRes(res, files);
  } catch (e) {
    console.error('GET /api/knowledge/files error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 获取文件内容
app.get('/api/knowledge/files/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename.endsWith('.md') || !KNOWLEDGE_FILES.includes(filename)) {
      return errorRes(res, 404, '文件不存在');
    }
    const filePath = path.join(knowledgeDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    const { tags, updatedAt } = parseFrontMatter(content);
    successRes(res, { filename, tags, updatedAt, content });
  } catch (e) {
    console.error('GET /api/knowledge/files/:filename error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 保存文件内容
app.put('/api/knowledge/files/:filename', requireAuth, async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename.endsWith('.md') || !KNOWLEDGE_FILES.includes(filename)) {
      return errorRes(res, 404, '文件不存在');
    }
    const { content, tags } = req.body;
    if (!content) {
      return errorRes(res, 400, 'content 为必填字段');
    }
    const filePath = path.join(knowledgeDir, filename);
    const now = new Date().toISOString().split('T')[0];
    const frontMatter = buildFrontMatter(tags || [], now);
    await fs.writeFile(filePath, frontMatter + content, 'utf8');
    // 清除缓存
    cache.delete(`wiki:file:${filename}`);
    successRes(res, null, '保存成功');
  } catch (e) {
    console.error('PUT /api/knowledge/files/:filename error:', e);
    errorRes(res, 500, '服务器内部错误');
  }
});

// 健康检查
app.get('/health', (req, res) => {
  successRes(res, { status: 'ok', uptime: process.uptime() });
});

// ==================== 404 处理（所有未知 API 路径）====================
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return errorRes(res, 404, '请求的接口不存在');
  }
  next();
});

// ==================== 全局错误处理 ====================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorRes(res, 400, '文件大小超过 5MB 限制');
    }
    return errorRes(res, 400, '文件上传错误');
  }

  if (err.message && err.message.includes('只允许上传图片')) {
    return errorRes(res, 400, err.message);
  }

  errorRes(res, 500, '服务器内部错误');
});

// ==================== 启动服务器 ====================
// 初始化：如果 data.json 不存在则创建
(async () => {
  try {
    await fs.access(dataFile);
  } catch {
    await saveData(defaultData);
    console.log('已创建默认 data.json');
  }
})();

const server = app.listen(PORT, () => {
  console.log(`猩伙伴民宿官网服务已启动: http://localhost:${PORT}`);
  console.log(`管理后台: http://localhost:${PORT}/admin.html`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
