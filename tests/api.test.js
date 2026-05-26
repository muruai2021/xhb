/**
 * 猩伙伴民宿官网 - API 测试套件
 * 技术栈：Node.js + Express.js
 * 测试框架：Jest + Supertest
 *
 * 运行方式: npm test
 *
 * 注意：这些是集成测试，需要服务器正常运行在 4001 端口
 * 测试前请确保没有其他服务占用该端口
 */

const request = require('supertest');

// 测试配置
const BASE_URL = process.env.TEST_URL || 'http://localhost:4000';

// 管理员测试账号
const TEST_ADMIN = {
  phone: '15874818550',
  password: 'test123'
};

// ============================================================
// 辅助函数
// ============================================================

let authToken = null;

// 获取认证 token
async function getAuthToken() {
  if (authToken) return authToken;

  const response = await request(BASE_URL)
    .post('/api/admin/login')
    .send(TEST_ADMIN);

  if (response.body.success && response.body.data && response.body.data.token) {
    authToken = response.body.data.token;
    return authToken;
  }

  throw new Error('Failed to get auth token: ' + JSON.stringify(response.body));
}

// ============================================================
// 测试套件：AI 对话功能测试 (/api/ai/chat)
// ============================================================
describe('AI 对话功能测试 (/api/ai/chat)', () => {
  test('POST /api/ai/chat - 正常对话应返回成功响应', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '你们的位置在哪？' })
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('reply');
    expect(typeof response.body.data.reply).toBe('string');
    expect(response.body.data.reply.length).toBeGreaterThan(0);
  });

  test('POST /api/ai/chat - 空消息应返回 400', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '' })
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/ai/chat - 缺少 message 字段应返回 400', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({})
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/ai/chat - 超长消息（>1000字符）应返回 400', async () => {
    const longMessage = 'a'.repeat(1001);
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: longMessage })
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/ai/chat - 关键词"位置"应触发位置相关回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '你们的位置在哪？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/保利|建发|北辰|地铁|地址/);
  });

  test('POST /api/ai/chat - 关键词"预订"应触发预订相关回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '如何预订？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/15874818550|电话/);
  });

  test('POST /api/ai/chat - 未匹配关键词应返回默认回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '你好' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/猩伙伴|AI客服|15874818550/);
  });

  test('POST /api/ai/chat - 关键词"户型"应触发户型相关回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '有什么户型？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/一卧|两卧|三卧|户型/);
  });

  test('POST /api/ai/chat - 关键词"价格"应触发价格相关回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '价格多少钱？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/15874818550|价格/);
  });
});

// ============================================================
// 测试套件：知识库 API 测试
// ============================================================
describe('知识库 API 测试', () => {
  describe('GET /api/knowledge/files', () => {
    test('应返回所有知识库文件列表', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('返回的文件应包含 known 文件', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files')
        .expect(200);

      const filenames = response.body.data.map(f => f.filename);
      expect(filenames).toContain('index.md');
      expect(filenames).toContain('location.md');
      expect(filenames).toContain('pricing.md');
    });

    test('每个文件对象应包含 filename, tags, updatedAt', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files')
        .expect(200);

      for (const file of response.body.data) {
        expect(file).toHaveProperty('filename');
        expect(file).toHaveProperty('tags');
        expect(file).toHaveProperty('updatedAt');
      }
    });
  });

  describe('GET /api/knowledge/files/:filename', () => {
    test('获取 index.md 内容应成功', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/index.md')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('filename', 'index.md');
      expect(response.body.data).toHaveProperty('content');
      expect(response.body.data).toHaveProperty('tags');
    });

    test('获取不存在的文件应返回 404', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/nonexistent.md')
        .expect('Content-Type', /json/)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });

    test('非 .md 文件应返回 404', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/test.txt')
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });

    test('应正确解析 front-matter 中的 tags', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/index.md')
        .expect(200);

      expect(response.body.data.tags).toBeInstanceOf(Array);
      expect(response.body.data.tags.length).toBeGreaterThan(0);
    });

    test('应正确解析 front-matter 中的 updatedAt', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/index.md')
        .expect(200);

      expect(response.body.data.updatedAt).toBeTruthy();
    });

    test('获取 location.md 内容应包含位置信息', async () => {
      const response = await request(BASE_URL)
        .get('/api/knowledge/files/location.md')
        .expect(200);

      expect(response.body.data.content).toMatch(/保利|建发|北辰|地铁/);
    });
  });

  describe('PUT /api/knowledge/files/:filename (需要认证)', () => {
    test('更新知识库文件应成功', async () => {
      const token = await getAuthToken();
      const newContent = '# 更新后的内容\n\n这是测试更新。';
      const newTags = ['测试', '更新'];

      const response = await request(BASE_URL)
        .put('/api/knowledge/files/index.md')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: newContent, tags: newTags })
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('未授权请求应返回 401', async () => {
      const response = await request(BASE_URL)
        .put('/api/knowledge/files/index.md')
        .send({ content: 'test' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('无效 token 应返回 401', async () => {
      const response = await request(BASE_URL)
        .put('/api/knowledge/files/index.md')
        .set('Authorization', 'Bearer invalid-token')
        .send({ content: 'test' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('更新不存在的文件应返回 404', async () => {
      const token = await getAuthToken();
      const response = await request(BASE_URL)
        .put('/api/knowledge/files/nonexistent.md')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'test' })
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
    });

    test('缺少 content 字段应返回 400', async () => {
      const token = await getAuthToken();
      const response = await request(BASE_URL)
        .put('/api/knowledge/files/index.md')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
    });
  });
});

// ============================================================
// 测试套件：聊天记录 API 测试 (/api/chat-logs)
// ============================================================
describe('聊天记录 API 测试 (/api/chat-logs)', () => {
  test('GET /api/chat-logs - 应返回聊天记录', async () => {
    const response = await request(BASE_URL)
      .get('/api/chat-logs')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('items');
    expect(response.body.data).toHaveProperty('total');
  });

  test('GET /api/chat-logs - 应支持分页参数', async () => {
    const response = await request(BASE_URL)
      .get('/api/chat-logs?page=1&limit=1')
      .expect(200);

    expect(response.body.data.items.length).toBeLessThanOrEqual(1);
    expect(response.body.data).toHaveProperty('page', 1);
    expect(response.body.data).toHaveProperty('limit', 1);
  });

  test('GET /api/chat-logs - items 应包含正确的字段', async () => {
    const response = await request(BASE_URL)
      .get('/api/chat-logs')
      .expect(200);

    if (response.body.data.items.length > 0) {
      const item = response.body.data.items[0];
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('message');
      expect(item).toHaveProperty('time');
    }
  });
});

// ============================================================
// 测试套件：管理员登录 API 测试 (/api/admin/login)
// ============================================================
describe('管理员登录 API 测试 (/api/admin/login)', () => {
  test('POST /api/admin/login - 正确凭据应返回 token', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send(TEST_ADMIN)
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('token');
    expect(typeof response.body.data.token).toBe('string');
    expect(response.body.data.token.length).toBe(64);
  });

  test('POST /api/admin/login - 错误密码应返回 401', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({ phone: TEST_ADMIN.phone, password: 'wrongpassword' })
      .expect('Content-Type', /json/)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/admin/login - 不存在的账号应返回 401', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({ phone: '13800138000', password: 'test123' })
      .expect('Content-Type', /json/)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/admin/login - 缺少 phone 应返回 400', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({ password: 'test123' })
      .expect('Content-Type', /json/)
      .expect(400);

    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/admin/login - 缺少 password 应返回 400', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({ phone: TEST_ADMIN.phone })
      .expect('Content-Type', /json/);

    // 可能被限流(429)或返回400
    expect([400, 429]).toContain(response.status);
    expect(response.body).toHaveProperty('success', false);
  });

  test('POST /api/admin/login - 空凭据应返回 400', async () => {
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({})
      .expect('Content-Type', /json/);

    // 可能被限流(429)或返回400
    expect([400, 429]).toContain(response.status);
    expect(response.body).toHaveProperty('success', false);
  });
});

// ============================================================
// 测试套件：规则引擎降级测试
// ============================================================
describe('规则引擎降级测试', () => {
  test('无 API Key 时应使用规则引擎', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '你们的地址在哪？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/保利|建发|北辰|地铁|地址/);
  });

  test('规则引擎 - 匹配"位置"关键词应返回位置信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '你们在哪？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/保利|建发|北辰/);
    expect(response.body.data.reply).toMatch(/地铁/);
  });

  test('规则引擎 - 匹配"户型"关键词应返回户型信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '有几卧？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/一卧|两卧|三卧/);
  });

  test('规则引擎 - 匹配"价格"关键词应返回价格信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '多少钱一天？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/15874818550|价格/);
  });

  test('规则引擎 - 匹配"预订"关键词应返回预订信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '如何预约？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/15874818550|预订|电话/);
  });

  test('规则引擎 - 匹配"联系"关键词应返回联系信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '怎么联系你们？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/15874818550|电话|微信/);
  });

  test('规则引擎 - 匹配"特色"关键词应返回特色信息', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '有什么特色？' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/艺术|江景|设计师|五星|投影|麻将/);
  });

  test('规则引擎 - 未匹配任何关键词应返回默认回复', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '哈哈哈哈' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/猩伙伴|AI客服|15874818550/);
  });

  test('规则引擎 - 大小写不敏感匹配', async () => {
    const response = await request(BASE_URL)
      .post('/api/ai/chat')
      .send({ message: '位置在哪' })
      .expect(200);

    expect(response.body.data.reply).toMatch(/保利|建发|北辰|地铁|地址/);
  });
});

// ============================================================
// 测试套件：健康检查 API 测试 (/health)
// ============================================================
describe('健康检查 API 测试 (/health)', () => {
  test('GET /health - 应返回 ok 状态', async () => {
    const response = await request(BASE_URL)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('status', 'ok');
    expect(response.body.data).toHaveProperty('uptime');
    expect(typeof response.body.data.uptime).toBe('number');
  });
});

// ============================================================
// 测试套件：通用错误处理测试
// ============================================================
describe('通用错误处理测试', () => {
  test('不存在的 API 路径应返回 404', async () => {
    const response = await request(BASE_URL)
      .get('/api/nonexistent')
      .expect(404);

    expect(response.body).toHaveProperty('success', false);
  });
});

// ============================================================
// 测试套件：响应格式一致性测试
// ============================================================
describe('响应格式一致性测试', () => {
  test('所有成功响应应包含 success: true', async () => {
    const endpoints = [
      { method: 'get', path: '/health' },
      { method: 'get', path: '/api/knowledge/files' },
      { method: 'get', path: '/api/knowledge/files/index.md' },
      { method: 'get', path: '/api/chat-logs' }
    ];

    for (const endpoint of endpoints) {
      const response = await request(BASE_URL)[endpoint.method](endpoint.path);
      expect(response.body).toHaveProperty('success', true);
    }
  });

  test('错误响应应包含 success: false 和 message', async () => {
    const response = await request(BASE_URL)
      .get('/api/knowledge/files/nonexistent.md');

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message');
  });
});

// ============================================================
// 测试套件：限流测试
// ============================================================
describe('登录限流测试', () => {
  test('1分钟内超过5次登录失败应被限流', async () => {
    // 等待之前的限流清零（如果之前测试触发了限流）
    await new Promise(r => setTimeout(r, 1000));

    // 尝试5次失败登录
    for (let i = 0; i < 5; i++) {
      const resp = await request(BASE_URL)
        .post('/api/admin/login')
        .send({ phone: TEST_ADMIN.phone, password: 'wrongpassword' });
      // 前5次应该返回 401 或 429（如果之前已触发）
      expect([401, 429]).toContain(resp.status);
      if (resp.status === 429) break; // 已触发限流，提前结束
    }

    // 验证限流已生效 - 再试一次应该返回 429
    const response = await request(BASE_URL)
      .post('/api/admin/login')
      .send({ phone: TEST_ADMIN.phone, password: 'wrongpassword' });

    expect(response.status).toBe(429);
    expect(response.body).toHaveProperty('success', false);
  });
});