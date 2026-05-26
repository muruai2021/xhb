// 猩伙伴民宿官网 - 首页交互逻辑

// 模块级变量：存储从服务端 fetch 到的最新数据，供弹窗等函数复用
let fetchedCommunities = [];
let fetchedProperties  = [];

document.addEventListener('DOMContentLoaded', async function() {
  initNavbar();
  initModal();
  initChat();
  initAdminLoginModal();
  initTelConsult();
  initContactModalEvents();

  // 等待两个异步渲染完成后再绑定滚动动画，确保卡片已插入 DOM（修复 Bug#3）
  await Promise.all([
    initCommunities(),
    initPropertyScroll()
  ]);
  initScrollAnimations();
});

// 电话咨询弹窗
function initTelConsult() {
  const telConsultBtn = document.getElementById('telConsultBtn');
  if (telConsultBtn) {
    telConsultBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openContactModal();
    });
  }
}

function openContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// 修复 Bug#7： initContactModalEvents 不再注册 ESC，已并入 initModal。
// 仅保留不能用 id 监听的外层点击关闭逻辑
function initContactModalEvents() {
  // ESC 已统一在 initModal 内处理，此处无需重复注册
}

// 导航栏滚动效果
function initNavbar() {
  const navbar    = document.getElementById('navbar');
  const navToggle = document.getElementById('navToggle');
  const navMenu   = document.getElementById('navMenu');

  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // 修复 Bug#10：添加空值判断，防止元素缺失时 TypeError
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });
    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
      });
    });
  }
}

// 小区背景图片映射
const communityImages = {
  'baoli': 'images/baoli.jpg',
  'jianfayangyun': 'images/jianfa.jpg',
  'beichen': 'images/beichen.jpg'
};

// 房源图片映射 - 从Word文档提取的真实图片
const propertyImages = {
  1: 'images/properties/1-fuxing.jpg',      // 复兴基地
  2: 'images/properties/2-shikong.jpg',     // 时空胶囊
  3: 'images/properties/3-runzhi.jpg',     // 润之江阁
  4: 'images/properties/4-tongqu.jpg',      // 童趣江境
  5: 'images/properties/5-lujiang.jpg',     // 麓江别苑
  6: 'images/properties/6-fangao.jpg',      // 梵高小窝
  7: 'images/properties/7-moden.jpg',        // 摩登剧场
  8: 'images/properties/8-jiangyuan.jpg',   // 江鸢小筑
  9: 'images/properties/9-xuanfu.jpg',      // 悬浮星宫
  10: 'images/properties/10-tiankong.jpg',  // 天空牧场
  11: 'images/properties/11-jiangtian.jpg',  // 江天木舍
  12: 'images/properties/12-fenmo.jpg',      // 粉墨
  13: 'images/properties/13-heyin.jpg',      // 鹤隐
  14: 'images/properties/14-songyun.jpg',    // 宋韵璟庭
  15: 'images/properties/15-moka.jpg',       // 摩卡
  16: 'images/properties/16-xingguang.jpg',  // 星光
  17: 'images/properties/17-jiangtan.jpg',   // 江檀谧屿
  18: 'images/properties/18-kongzhong.jpg',  // 空中楼阁
  19: 'images/properties/19-huajian.jpg',    // 花间
  20: 'images/properties/20-chanyi.jpg',     // 禅意町屋
  21: 'images/properties/21-mimi.jpg'        // 秘密基地
};

// 渲染小区卡片（横向滚动）
async function initCommunities() {
  const track = document.getElementById('communitiesTrack');
  const scrollContainer = document.getElementById('communitiesScroll');
  const prevBtn = document.getElementById('communityScrollPrev');
  const nextBtn = document.getElementById('communityScrollNext');

  if (!track) return;

  // Fetch latest community data from server
  let communityList = [];
  try {
    const res = await fetch('/api/communities');
    const json = await res.json();
    communityList = json.data?.items || json.data || [];
  } catch (e) {
    console.error('Failed to load communities', e);
    if (typeof communities !== 'undefined') communityList = communities;
  }

  // 保存到模块变量，供 openCommunityModal 使用（修复 Bug#2）
  fetchedCommunities = communityList;

  const iconKeys = ['home', 'building', 'city'];
  const iconSvgs = [icons.home, icons.building, icons.city];

  track.innerHTML = communityList.map((community, index) => {
    // 优先用服务端数据的房源列表（fetchedProperties 若已加载则使用）
    const communityProperties = fetchedProperties.length > 0
      ? fetchedProperties.filter(p => p.community === community.id)
      : (typeof properties !== 'undefined' ? properties : []).filter(p => p.community === community.id);
    const bgImage = communityImages[community.id] || '';
    return `
      <div class="community-card" data-community="${community.id}">
        <div class="community-bg" style="background-image: url('${bgImage}'); background-size: cover; background-position: center;"></div>
        <div class="community-overlay">
          <div class="community-icon">${iconSvgs[index % iconSvgs.length]}</div>
          <h3 class="community-name">${community.name}</h3>
          <p class="community-area">${community.area} · ${community.metro}</p>
          <span class="community-count">${community.propertyCount || communityProperties.length}套房源</span>
          <div class="community-action">
            <button class="btn btn-small btn-outline">点击查看</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Click handler for community cards
  track.querySelectorAll('.community-card').forEach(card => {
    card.addEventListener('click', () => {
      const communityId = card.dataset.community;
      openCommunityModal(communityId);
    });
  });

  // Horizontal scroll button events
  if (prevBtn && nextBtn && scrollContainer) {
    prevBtn.addEventListener('click', () => {
      scrollContainer.scrollBy({ left: -340, behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', () => {
      scrollContainer.scrollBy({ left: 340, behavior: 'smooth' });
    });
    scrollContainer.addEventListener('scroll', () => {
      updateScrollButtons(scrollContainer, prevBtn, nextBtn);
    });
    updateScrollButtons(scrollContainer, prevBtn, nextBtn);
  }
}

// 更新滚动按钮状态
function updateScrollButtons(scrollContainer, prevBtn, nextBtn) {
  if (!scrollContainer || !prevBtn || !nextBtn) return;
  const maxScroll = scrollContainer.scrollWidth - scrollContainer.clientWidth;
  prevBtn.style.opacity = scrollContainer.scrollLeft <= 10 ? '0.5' : '1';
  nextBtn.style.opacity = scrollContainer.scrollLeft >= maxScroll - 10 ? '0.5' : '1';
}

// 渲染精选房源滚动
async function initPropertyScroll() {
  const track = document.getElementById('propertyTrack');
  const prevBtn = document.getElementById('scrollPrev');
  const nextBtn = document.getElementById('scrollNext');
  const scrollContainer = document.getElementById('propertyScroll');

  if (!track) return;

  // Fetch latest property data from server
  let propertyList = [];
  try {
    const res = await fetch('/api/properties');
    const json = await res.json();
    propertyList = json.data?.items || json.data || [];
  } catch (e) {
    console.error('Failed to load properties', e);
    if (typeof properties !== 'undefined') propertyList = properties;
  }
  // 保存到模块变量，供 openCommunityModal 使用（修复 Bug#2）
  fetchedProperties = propertyList;

  track.innerHTML = propertyList.map(property => {
    const tagClass = property.isLuxury ? '' : (property.tags.includes('江景') ? 'river' : (property.tags.includes('艺术设计') ? 'art' : ''));
    const tagText = property.isLuxury ? '顶奢' : (property.tags[0] || '');
    // 截断特色文字到 60 字，与源项目保持一致（过长文本会被 overflow 裁剪）
    const featurePreview = property.features ? property.features.substring(0, 60) + '…' : '';
    const realImage = property.image || propertyImages[property.id] || '';
    return `
      <div class="property-card" data-id="${property.id}">
        <div class="property-image">
          <img src="${realImage}" alt="${property.name}" loading="lazy">
          <span class="property-tag ${tagClass}">${tagText}</span>
        </div>
        <div class="property-info">
          <h3 class="property-name">猩伙伴·${property.name}</h3>
          <div class="property-meta">
            <span class="property-community">${property.communityName}</span>
            <span>${property.type}</span>
          </div>
          <div class="property-hover">
            <p class="property-feature">${featurePreview}</p>
            <div class="property-actions">
              <button class="btn-detail" onclick="window.location.href='property.html?id=${property.id}'">查看详情</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Scroll button events
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      scrollContainer.scrollBy({ left: -320, behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', () => {
      scrollContainer.scrollBy({ left: 320, behavior: 'smooth' });
    });
  }

  // Card click navigation (excluding button)
  track.querySelectorAll('.property-card').forEach(card => {
    card.addEventListener('click', e => {
      if (!e.target.closest('.btn-detail')) {
        const id = card.dataset.id;
        window.location.href = `property.html?id=${id}`;
      }
    });
  });
}

// 小区弹窗
function initModal() {
  const modal     = document.getElementById('communityModal');
  const overlay   = document.getElementById('modalOverlay');
  const closeBtn  = document.getElementById('modalClose');

  if (closeBtn) closeBtn.addEventListener('click', closeCommunityModal);
  if (overlay)  overlay.addEventListener('click',  closeCommunityModal);

  // 修复 Bug#7：合并三个弹窗的 ESC 关闭，只注册一个全局监听器
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCommunityModal();
      closeAdminLoginModal();
      closeContactModal();   // 同时处理联系弹窗
    }
  });
}

// 管理员登录弹窗
function initAdminLoginModal() {
  const loginBtn = document.getElementById('adminLoginBtn');
  const modal = document.getElementById('adminLoginModal');
  const overlay = document.getElementById('adminModalOverlay');
  const closeBtn = document.getElementById('adminLoginClose');
  const loginForm = document.getElementById('adminLoginForm');

  if (!loginBtn || !modal) return;

  // 打开弹窗
  loginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  // 关闭弹窗
  if (closeBtn) {
    closeBtn.addEventListener('click', closeAdminLoginModal);
  }

  if (overlay) {
    overlay.addEventListener('click', closeAdminLoginModal);
  }

  // 登录表单提交（修复 Bug#4：改用 API 验证，不在前端硬编码凭证）
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone    = document.getElementById('adminPhone').value.trim();
      const password = document.getElementById('adminPassword').value;
      const submitBtn = loginForm.querySelector('[type="submit"]');

      if (!phone || !password) {
        alert('请填写手机号和密码');
        return;
      }

      try {
        submitBtn.disabled    = true;
        submitBtn.textContent = '登录中…';

        const res  = await fetch('/api/admin/login', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ phone, password })
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem('xinghuoban_admin', phone);
          localStorage.setItem('xinghuoban_token', data.token); // 存储 token
          closeAdminLoginModal();
          window.location.href = 'admin.html';
        } else {
          alert(data.message || '手机号或密码错误');
        }
      } catch (err) {
        console.error('登录失败:', err);
        alert('登录请求失败，请检查服务器是否运行');
      } finally {
        submitBtn.disabled    = false;
        submitBtn.textContent = '登录';
      }
    });
  }
}

function closeAdminLoginModal() {
  const modal = document.getElementById('adminLoginModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function openCommunityModal(communityId) {
  const modal = document.getElementById('communityModal');
  const title = document.getElementById('modalTitle');
  const subtitle = document.getElementById('modalSubtitle');
  const propertiesList = document.getElementById('modalProperties');

  // 优先使用服务端 fetch 到的最新数据，回退到静态全局变量（修复 Bug#2）
  const communitySource   = fetchedCommunities.length > 0 ? fetchedCommunities : (typeof communities !== 'undefined' ? communities : []);
  const propertiesSource  = fetchedProperties.length  > 0 ? fetchedProperties  : (typeof properties  !== 'undefined' ? properties  : []);

  const community         = communitySource.find(c => c.id === communityId);
  const communityProperties = propertiesSource.filter(p => p.community === communityId);

  if (!community) return;

  title.textContent = community.name;
  subtitle.textContent = `${community.area} · ${community.metro} · ${community.propertyCount}套房源`;

  propertiesList.innerHTML = communityProperties.map(property => {
    const tagClass = property.isLuxury ? '' : (property.tags.includes('江景') ? 'river' : '');
    const tagText = property.isLuxury ? '顶奢' : (property.tags[0] || '');
    // 使用从Word文档提取的真实图片
    const realImage = propertyImages[property.id] || property.image;

    return `
      <div class="modal-property" onclick="window.location.href='property.html?id=${property.id}'">
        <div class="modal-property-img">
          <img src="${realImage}" alt="${property.name}">
        </div>
        <div class="modal-property-info">
          <h4 class="modal-property-name">猩伙伴·${property.name}</h4>
          <p class="modal-property-meta">
            <span class="property-tag ${tagClass}" style="display: inline-block; margin-right: 5px;">${tagText}</span>
            ${property.type} · 可住${property.capacity}
          </p>
          <p class="modal-property-capacity">${property.area}</p>
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCommunityModal() {
  const modal = document.getElementById('communityModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// Markdown 格式化（支持列表、粗体、斜体、换行）
function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^• (.+)$/gm, '<span style="display:block;padding-left:1em;">• $1</span>')
    .replace(/^(\d+)\. (.+)$/gm, '<span style="display:block;padding-left:1em;">$1. $2</span>')
    .replace(/\n/g, '<br>');
}

// AI客服
function initChat() {
  const chatToggle = document.getElementById('chatToggle');
  const chatBox = document.getElementById('chatBox');
  const chatClose = document.getElementById('chatClose');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');
  const messagesContainer = document.getElementById('chatMessages');

  if (!chatToggle) return;

  chatToggle.addEventListener('click', () => {
    chatBox.classList.toggle('active');
  });

  if (chatClose) {
    chatClose.addEventListener('click', () => {
      chatBox.classList.remove('active');
    });
  }

  const sendMessage = async () => {
    const message = chatInput.value.trim();
    if (!message) return;

    addMessage(message, 'user', messagesContainer);
    chatInput.value = '';

    // 调用真实AI接口（流式）
    try {
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!res.ok) {
        addMessage('网络异常，请稍后重试', 'bot', messagesContainer);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let botDiv = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              if (!botDiv) {
                botDiv = document.createElement('div');
                botDiv.className = 'message bot';
                botDiv.innerHTML = '<p></p>';
                messagesContainer.appendChild(botDiv);
              }
              const text = parsed.content.replace(/\n/g, '<br>');
              botDiv.querySelector('p').innerHTML += text;
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          } catch (e) {
            console.error('Parse error:', e);
          }
        }
      }
    } catch (e) {
      console.error('Fetch error:', e);
      addMessage('网络异常，请稍后重试', 'bot', messagesContainer);
    }
  };

  if (chatSend) {
    chatSend.addEventListener('click', sendMessage);
  }

  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
}

function addMessage(text, type, container) {
  const messagesContainer = container || document.getElementById('chatMessages');
  if (!messagesContainer) return;

  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type}`;
  messageDiv.innerHTML = `<p>${text}</p>`;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function getAIResponse(message) {
  const lowerMessage = message.toLowerCase();

  // 房源位置
  if (lowerMessage.includes('位置') || lowerMessage.includes('在哪') || lowerMessage.includes('地址')) {
    return '我们的房源分布在长沙三个小区：<br>• 保利国际广场（天心区，碧沙湖地铁站）<br>• 建发养云（开福区，开福寺地铁站）<br>• 北辰三角洲（开福区，北辰三角洲地铁站）<br>距地铁站步行10分钟以内，一线江景。';
  }

  // 房源户型
  if (lowerMessage.includes('户型') || lowerMessage.includes('几卧') || lowerMessage.includes('多少人')) {
    return '我们有21套房源，户型从一卧到三卧不等：<br>• 一卧：可住2大人+1幼儿<br>• 两卧：可住4大人或4大人2小孩<br>• 三卧：可住6大人<br>适合情侣、家庭、闺蜜聚会。';
  }

  // 价格
  if (lowerMessage.includes('价格') || lowerMessage.includes('多少钱') || lowerMessage.includes('报价')) {
    return '价格根据房型和日期不同，请拨打 <strong>15874818550</strong> 咨询，我们会给您最优惠的报价！';
  }

  // 预订
  if (lowerMessage.includes('预订') || lowerMessage.includes('预定') || lowerMessage.includes('预约') || lowerMessage.includes('订房')) {
    return '预订请致电 <strong>15874818550</strong>（微信同号），我们会为您安排好一切！';
  }

  // 联系方式
  if (lowerMessage.includes('联系') || lowerMessage.includes('电话') || lowerMessage.includes('微信')) {
    return '客服电话：<strong>15874818550</strong><br>微信：同手机号<br>24小时在线为您服务！';
  }

  // 特色
  if (lowerMessage.includes('特色') || lowerMessage.includes('特点') || lowerMessage.includes('有什么')) {
    return '我们的房源由伦敦艺术大学、格拉斯哥大学等国际设计师打造，每间都有独特风格：<br>• 一线江景，可看橘子洲头<br>• 艺术风格设计，拍照超美<br>• 五星床品、极米投影、麻将机<br>• 步行可达地铁站和商圈';
  }

  // 顶奢
  if (lowerMessage.includes('顶奢') || lowerMessage.includes('高端')) {
    return '我们有9套顶奢系列房源，特点包括：<br>• 更大的空间（130-180㎡）<br>• 三卧配置，可住6人<br>• 独特设计风格（童趣、法式、中古等）<br>• 部分配备麻将机、按摩椅等';
  }

  // 默认回复
  return '您好！我是猩伙伴AI客服。<br>您可以问我：<br>• 房源位置分布<br>• 户型和人数<br>• 价格咨询<br>• 如何预订<br>• 房源特色介绍<br><br>或直接拨打 <strong>15874818550</strong> 人工服务~';
}

// 滚动动画
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  document.querySelectorAll('.feature-card, .community-card, .property-card').forEach(el => {
    observer.observe(el);
  });
}
