// 创建初始管理员账号
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataFile = path.join(__dirname, 'database', 'data.json');

async function seedAdmin() {
  const phone = process.argv[2] || '15874818550';
  const password = process.argv[3] || '123456';

  let data;
  try {
    const content = fs.readFileSync(dataFile, 'utf8');
    data = JSON.parse(content);
  } catch (e) {
    data = {
      _incrementalId: 1,
      admins: [],
      ai_config: { model: 'qwen', apiKey: '' },
      chat_logs: [],
      properties: [],
      communities: [],
      content: []
    };
  }

  // 检查是否已存在
  const exists = data.admins.some(a => a.phone === phone);
  if (exists) {
    console.log(`管理员 ${phone} 已存在`);
    return;
  }

  // 使用 bcrypt 哈希密码
  const bcrypt = require('bcrypt');
  const hashed = await bcrypt.hash(password, 10);

  data.admins.push({ phone, password: hashed });
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`管理员创建成功:`);
  console.log(`  手机号: ${phone}`);
  console.log(`  密码: ${password}`);
  console.log(`  哈希: ${hashed.substring(0, 20)}...`);
}

seedAdmin().catch(console.error);
