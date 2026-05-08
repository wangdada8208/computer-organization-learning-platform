import { SIMULATORS, mountSimulator } from './simulators.js';
import { POINT_ILLUSTRATIONS } from './illustrations.js';

const AUTH_STORAGE_KEY = 'coa.v2.auth';
const LEGACY_PROGRESS_KEY = 'coa_p';
const LEGACY_WRONG_KEY = 'coa_wrong';

const appShellEl = document.querySelector('.app-shell');
const sidebarEl = document.getElementById('sidebar');
const topbarEl = document.getElementById('topbar');
const pageEl = document.getElementById('page');
const authLayerEl = document.createElement('div');
authLayerEl.className = 'auth-layer';
document.body.appendChild(authLayerEl);

const PRIMARY_VIEWS = ['dashboard', 'chapter', 'practice'];
const PRACTICE_MODES = ['passline', 'section', 'test', 'wrongbook', 'simulator', 'teacher'];
const SIMULATOR_GROUPS = [
  { label: '数值与编码', ids: ['sim-base', 'sim-complement', 'sim-float'] },
  { label: '处理器执行', ids: ['sim-pipeline', 'sim-fetch'] },
  { label: '存储层次', ids: ['sim-cache'] },
  { label: '中断与控制', ids: ['sim-fetch', 'sim-pipeline'] },
];

const app = {
  data: null,
  state: null,
  auth: {
    token: null,
    user: null,
    syncStatus: 'local-only',
    lastSyncedAt: null,
    pendingChanges: false,
    modalOpen: false,
    modalMode: 'login',
    error: '',
    generated: null,
  },
  syncMeta: {
    pending: false,
    lastSuccessfulStateAt: null,
    lastAttemptAt: null,
  },
  runtime: {
    syncTimer: null,
    syncReady: false,
  },
  session: {
    practiceAnswers: {},
    practiceFeedback: {},
    testAnswers: {},
    testSubmitted: false,
    authDraft: {
      username: '',
      password: '',
    },
  },
  parts: {
    p1: '概论',
    p2: '硬件结构',
    p3: 'CPU 核心',
    p4: '控制单元',
  },
};

document.addEventListener('click', handleClick);
document.addEventListener('change', handleChange);
document.addEventListener('input', handleInput);

boot();

async function boot() {
  try {
    const [rawChapters, rawQuizzes, rawTeacherQuizzes] = await Promise.all([
      fetchJson('./data/chapters.json'),
      fetchJson('./data/quizzes.json'),
      fetchJson('./data/teacher_quizzes.json'),
    ]);
    const chapters = normalizeChapters(rawChapters);
    const quizzes = normalizeQuizzes(rawQuizzes, chapters);
    const teacherQuizzes = normalizeTeacherQuizzes(rawTeacherQuizzes.questions || [], chapters);
    app.data = { chapters, quizzes, teacherQuizzes, teacherSources: rawTeacherQuizzes.sources || [] };
    app.state = buildInitialState(chapters, quizzes);
    loadAuthState();
    await restoreRemoteSession();
    app.runtime.syncReady = true;
    renderView();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    window.addEventListener('beforeunload', flushSyncOnLeave);
  } catch (error) {
    console.error(error);
    renderBootError(error);
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Failed to load ' + url);
  return response.json();
}

function normalizeChapters(chapters) {
  return chapters.map((chapter, chapterIndex) => {
    const orderedPointIds = chapter.sections.flatMap((section) => section.points.map((point) => point.id));
    const passlineTopics = orderedPointIds.slice(0, Math.min(5, orderedPointIds.length));
    const commonMistakes = chapter.confusions.map(([a, b]) => `${a} 和 ${b} 容易混在一起`).slice(0, 3);
    if (!commonMistakes.length && chapter.highFrequency.length) {
      commonMistakes.push(`先把 ${chapter.highFrequency[0]} 的条件和适用场景记牢。`);
    }
    return {
      ...chapter,
      difficulty: chapterIndex < 2 ? '基础' : chapterIndex < 6 ? '中等' : '进阶',
      isEssentialChapter: chapterIndex < 6,
      recommendedOrder: chapter.sections.map((section) => section.id),
      passlineTopics,
      commonMistakes,
      sections: chapter.sections.map((section) => ({
        ...section,
        mustFirstIds: section.points.slice(0, Math.min(2, section.points.length)).map((point) => point.id),
        overview: cleanLeadText(section.overview || chapter.summary || section.title),
        points: section.points.map((point, pointIndex) => normalizePoint(point, chapter, section, pointIndex, passlineTopics)),
      })),
    };
  });
}

function normalizePoint(point, chapter, section, pointIndex, passlineTopics) {
  const conclusion = derivePointConclusion(point);
  const preview = derivePointPreview(point, conclusion);
  const pitfall = derivePointPitfall(point, chapter);
  const importance = passlineTopics.includes(point.id) ? 'essential' : pointIndex === section.points.length - 1 ? 'advanced' : 'standard';
  return { ...point, svg: point.svg || POINT_ILLUSTRATIONS[point.id] || '', conclusion, preview, pitfall, importance };
}

function normalizeQuizzes(quizzes, chapters) {
  return quizzes.map((bundle) => {
    const chapter = chapters.find((item) => item.id === bundle.chapterId);
    const passlineSet = new Set(chapter?.passlineTopics || []);
    return {
      ...bundle,
      practiceSections: bundle.practiceSections.map((section, sectionIndex) => ({
        ...section,
        questions: section.questions.map((question, questionIndex) => normalizeQuestion(question, chapter, passlineSet, sectionIndex, questionIndex)),
      })),
      chapterTest: bundle.chapterTest.map((question, questionIndex) => normalizeQuestion(question, chapter, passlineSet, questionIndex, questionIndex)),
    };
  });
}

function normalizeQuestion(question, chapter, passlineSet, sectionIndex, questionIndex) {
  const relatedTitle = question.relatedTopicId ? findPointTitleInChapter(chapter, question.relatedTopicId) : '';
  const difficulty = questionIndex < 2 ? '基础' : questionIndex < 4 ? '中等' : '进阶';
  return {
    ...question,
    difficulty,
    isPassline: passlineSet.has(question.relatedTopicId) || sectionIndex === 0 || questionIndex < 2,
    mistakeTag: relatedTitle || question.sectionTitle || chapter?.title || '',
  };
}

function normalizeTeacherQuizzes(questions, chapters) {
  return questions.map((question, index) => {
    const chapter = chapters.find((item) => item.id === question.chapterId);
    const relatedTitle = question.relatedTopicId ? findPointTitleInChapter(chapter, question.relatedTopicId) : '';
    return {
      ...question,
      index: index + 1,
      mode: 'teacher',
      teacherFocus: true,
      difficulty: question.difficulty || '重点',
      mistakeTag: question.mistakeTag || relatedTitle || question.sectionTitle || chapter?.title || '',
      tags: Array.from(new Set([
        '老师重点题',
        ...(question.tags || []),
        chapter ? `第${chapter.number}章` : '',
        question.type === 'fill' ? '填空题' : '选择题',
      ].filter(Boolean))),
    };
  });
}

function findPointTitleInChapter(chapter, pointId) {
  if (!chapter) return '';
  for (const section of chapter.sections) {
    const point = section.points.find((item) => item.id === pointId);
    if (point) return point.title;
  }
  return '';
}

function renderBootError(error) {
  appShellEl.className = 'app-shell overview-layout';
  sidebarEl.innerHTML = '';
  topbarEl.innerHTML = '<div><h2>加载失败</h2><p>资源没有正常加载完成。</p></div>';
  pageEl.innerHTML = `
    <section class="surface-panel">
      <span class="eyebrow">启动失败</span>
      <h3>页面资源加载失败</h3>
      <p class="body-copy">请确认当前是通过本地静态服务器访问，而不是直接用 file:// 打开；如果已经在本地服务下运行，刷新一次通常就能恢复。</p>
      <pre class="error-box">${escapeHtml(error?.message || String(error))}</pre>
    </section>
  `;
}

function buildInitialState(chapters, quizzes) {
  const defaults = createDefaultState(chapters);
  const state = { ...defaults };
  if (!state.meta.updatedAt) state.meta.updatedAt = new Date().toISOString();
  return state;
}

function createDefaultState(chapters) {
  return {
    view: 'dashboard',
    activeTrack: 'textbook',
    mobileSidebarOpen: false,
    selectedChapterId: chapters[0]?.id || null,
    selectedSectionId: chapters[0]?.sections[0]?.id || null,
    selectedSimulatorId: SIMULATORS[0]?.id || null,
    teacherChapterId: 'all',
    teacherSource: 'all',
    teacherSourceType: 'all',
    teacherType: 'all',
    teacherQuickMode: 'chapter-current',
    teacherRandomIds: [],
    practiceMode: 'passline',
    progress: { points: {}, chapters: {}, lastChapterId: chapters[0]?.id || null, lastPointId: null },
    quizHistory: [],
    wrongbook: {},
    trackProgress: { textbook: {}, passline: {} },
    chapterWeakness: {},
    lastPasslineScore: {},
    meta: { updatedAt: null },
  };
}

function renderView() {
  const compactLayout = app.state.view !== 'dashboard';
  appShellEl.className = `app-shell ${compactLayout ? 'workspace-layout' : 'overview-layout'}`;
  renderSidebar();
  renderTopbar();
  const views = {
    dashboard: renderDashboard,
    chapter: renderChapterView,
    practice: renderPracticeView,
  };
  views[app.state.view]?.();
  renderAuthLayer();
  persistState();
  persistAuthState();
}

function renderSidebar() {
  const stats = getProgressStats();
  if (app.state.view === 'dashboard') {
    sidebarEl.className = 'sidebar sidebar-empty';
    sidebarEl.innerHTML = '';
    return;
  }
  sidebarEl.className = `sidebar ${app.state.mobileSidebarOpen ? 'open' : ''}`;
  if (app.state.view === 'chapter') {
    const chapter = getSelectedChapter();
    const progress = getChapterProgress(chapter);
    sidebarEl.innerHTML = `
      <div class="rail-brand">
        <div class="rail-mark">课</div>
        <div>
          <h1>章节学习</h1>
          <p>${chapter.title}</p>
        </div>
      </div>
      <section class="rail-panel rail-progress">
        <div class="rail-head"><strong>当前章节</strong><span>${progress.percent}%</span></div>
        <div class="progress-bar"><span style="width:${progress.percent}%"></span></div>
        <p class="muted">${progress.mastered}/${progress.total} 个知识点已掌握</p>
      </section>
      <section class="rail-panel">
        <h3>章节目录</h3>
        <div class="chapter-tree compact">${renderSidebarTree()}</div>
      </section>
      <section class="rail-panel">
        <h3>本章导览</h3>
        <div class="chapter-outline-list">
          ${chapter.chapterMap.map((item) => `<div class="outline-chip">${item}</div>`).join('')}
        </div>
      </section>
    `;
    return;
  }
  const chapter = getSelectedChapter();
  const overview = getTrainingOverview(chapter.id);
  sidebarEl.innerHTML = `
    <div class="rail-brand">
      <div class="rail-mark">练</div>
      <div>
        <h1>训练强化</h1>
        <p>${chapter.title}</p>
      </div>
    </div>
    <section class="rail-panel rail-progress">
      <div class="rail-head"><strong>当前章节</strong><span>${overview.wrongCount} 道错题</span></div>
      <div class="stack-xs">
        <div class="rail-stat"><span>最近成绩</span><strong>${overview.lastScore}</strong></div>
        <div class="rail-stat"><span>练习小节</span><strong>${overview.practiceSectionCount}</strong></div>
        <div class="rail-stat"><span>模拟器</span><strong>${chapter.relatedSimulatorIds.length || 1}</strong></div>
      </div>
    </section>
    <section class="rail-panel">
      <h3>切换章节</h3>
      <div class="chapter-tree compact">${renderSidebarTree()}</div>
    </section>
  `;
}

function renderSidebarTree() {
  return Object.entries(app.parts).map(([partId, partName]) => {
    const chapters = app.data.chapters.filter((chapter) => chapter.partId === partId);
    return `
      <div class="chapter-part">
        <h4>${partName}</h4>
        ${chapters.map((chapter) => {
          const progress = getChapterProgress(chapter);
          const isActive = app.state.selectedChapterId === chapter.id;
          const isContinue = app.state.progress.lastChapterId === chapter.id;
          return `
            <button class="chapter-link ${isActive ? 'active' : ''}" data-action="open-${app.state.view === 'practice' ? 'practice' : 'chapter'}" data-chapter-id="${chapter.id}">
              <div class="chapter-link-row">
                <strong>第 ${chapter.number} 章 · ${chapter.title}</strong>
                ${isContinue ? '<span class="tiny-pill">最近</span>' : ''}
              </div>
              <span>${chapter.summary}</span>
              <div class="chapter-link-meta">
                <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
                <span>${progress.percent}%</span>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

function renderTopbar() {
  const titleMap = {
    dashboard: ['学习总览', '继续当前章节，或者先做及格线练习。'],
    chapter: ['章节学习', '先抓每章必会，再顺着知识点把概念真正读懂。'],
    practice: ['训练强化', '先过线，再提分；做题、错题和模拟器放在同一条补强回路里。'],
  };
  const [title, subtitle] = titleMap[app.state.view];
  topbarEl.innerHTML = `
    <div class="topbar-inner">
      <div class="topbar-left">
        <button class="icon-btn mobile-toggle" data-action="toggle-sidebar" aria-label="打开目录">目录</button>
        <div class="topbar-copy">
          <div class="eyebrow">计算机组成原理学习平台</div>
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
      </div>
      <div class="topbar-right">
        <nav class="primary-tabs" aria-label="主导航">
          ${[['dashboard', '学习总览'], ['chapter', '章节学习'], ['practice', '训练强化']]
            .map(([view, label]) => `<button class="primary-tab ${app.state.view === view ? 'active' : ''}" data-action="switch-view" data-view="${view}">${label}</button>`).join('')}
        </nav>
        <div class="account-bar">
          <span class="sync-pill ${app.auth.syncStatus}">${syncStatusLabel()}</span>
          ${app.auth.user ? `
            <button class="btn tiny subtle" data-action="sync-now">立即同步</button>
            <button class="btn tiny subtle" data-action="open-auth-modal" data-mode="account">${app.auth.user.username}</button>
            <button class="btn tiny subtle" data-action="logout">退出</button>
          ` : `
            <button class="btn tiny subtle" data-action="open-auth-modal" data-mode="login">登录</button>
            <button class="btn tiny primary" data-action="open-auth-modal" data-mode="register">注册</button>
          `}
        </div>
      </div>
    </div>
  `;
}

function renderDashboard() {
  const stats = getProgressStats();
  const continueChapter = getContinueChapter();
  const history = [...app.state.quizHistory].reverse();
  const recentWrongs = wrongbookEntries().slice(0, 2);
  const passline = getPasslineOverview();
  const latestHistory = history[0];
  const latestWrong = recentWrongs[0];
  const nextAction = getDashboardNextAction();
  const heroChapterProgress = getChapterProgress(continueChapter);
  pageEl.innerHTML = `
    <div class="overview-stack">
      <section class="overview-hero">
        <div class="hero-copy">
          <span class="eyebrow">现在开始</span>
          <h3 class="hero-title">计算机组成原理学习平台</h3>
          <p class="body-copy">先继续当前章节，或者先做及格线练习。首页只保留最直接的入口，让你一进来就知道下一步点哪里。</p>
          <div class="action-row hero-actions">
            <button class="btn primary" data-action="open-track" data-track="textbook">继续学当前章节</button>
            <button class="btn subtle" data-action="open-track" data-track="passline">先做及格线练习</button>
          </div>
        </div>
        <div class="hero-side">
          <div class="surface-panel compact-panel hero-note hero-status-card">
            <div class="hero-note-head">
              <div>
                <span class="eyebrow">当前进度</span>
                <h4>第 ${continueChapter.number} 章 · ${continueChapter.title}</h4>
              </div>
              <span class="soft-badge">${heroChapterProgress.percent}%</span>
            </div>
            <div class="metric-grid single-column">
              <div class="metric-card"><span>当前章节</span><strong>第 ${continueChapter.number} 章</strong><small>${continueChapter.title}</small></div>
              <div class="metric-card"><span>总体进度</span><strong>${stats.percent}%</strong><small>${stats.masteredPoints}/${stats.totalPoints} 个知识点已掌握</small></div>
              <div class="metric-card"><span>过线进度</span><strong>${passline.percent}%</strong><small>${passline.readyTopics}/${passline.totalTopics} 个必会点完成</small></div>
              <div class="metric-card"><span>待回看错题</span><strong>${getWrongbookCount()}</strong><small>${latestWrong ? latestWrong.chapterTitle : '当前没有错题'}</small></div>
            </div>
          </div>
        </div>
      </section>

      <section class="surface-panel overview-metrics-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">我现在学到哪</span>
            <h3>当前学习状态</h3>
          </div>
        </div>
        <div class="overview-metrics-grid">
          <article class="overview-number-card">
            <span>已掌握知识点</span>
            <strong>${stats.masteredPoints}/${stats.totalPoints}</strong>
            <small>当前总掌握度 ${stats.percent}%</small>
          </article>
          <article class="overview-number-card">
            <span>已过线章节</span>
            <strong>${passline.completedChapters}/${passline.targetChapters}</strong>
            <small>${passline.readyTopics}/${passline.totalTopics} 个必会点已完成</small>
          </article>
          <article class="overview-number-card">
            <span>最近一次测试</span>
            <strong>${latestHistory ? `${latestHistory.score}/${latestHistory.total}` : '--'}</strong>
            <small>${latestHistory ? `${latestHistory.chapterTitle} · ${formatDate(latestHistory.completedAt)}` : '还没有测试记录'}</small>
          </article>
          <article class="overview-number-card">
            <span>待回看错题</span>
            <strong>${getWrongbookCount()}</strong>
            <small>${latestWrong ? `${latestWrong.chapterTitle} 有最近错题` : '当前没有错题'}</small>
          </article>
        </div>
      </section>

      <section class="surface-panel overview-next-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">接下来做什么</span>
            <h3>${nextAction.title}</h3>
          </div>
          <button class="text-link" data-action="${nextAction.primaryAction}"${nextAction.primaryChapterId ? ` data-chapter-id="${nextAction.primaryChapterId}"` : ''}>${nextAction.primaryLabel}</button>
        </div>
        <div class="overview-next-layout">
          <div class="next-main-card">
            <p class="body-copy">${nextAction.text}</p>
            <div class="action-row">
              <button class="btn primary" data-action="${nextAction.primaryAction}"${nextAction.primaryChapterId ? ` data-chapter-id="${nextAction.primaryChapterId}"` : ''}>${nextAction.primaryLabel}</button>
            </div>
            <div class="next-links">
              ${nextAction.secondary.map((item) => `
                <button class="text-link" data-action="${item.action}"${item.chapterId ? ` data-chapter-id="${item.chapterId}"` : ''}${item.sectionId ? ` data-section-id="${item.sectionId}"` : ''}>${item.label}</button>
              `).join('')}
            </div>
          </div>
          <aside class="next-side-card">
            <span class="eyebrow">最近提醒</span>
            ${recentWrongs.length ? `
              ${recentWrongs.map((item) => `
                <div class="mini-wrong-row">
                  <strong>${item.chapterTitle}</strong>
                  <span>错 ${item.wrongCount} 次 · ${formatDate(item.lastWrongAt)}</span>
                </div>
              `).join('')}
            ` : `<div class="mini-wrong-row empty"><strong>没有待回看错题</strong><span>可以直接继续章节学习或做题。</span></div>`}
            <div class="next-side-actions">
              <button class="btn tiny subtle" data-action="open-teacher">刷老师题</button>
              <button class="btn tiny subtle" data-action="switch-view" data-view="practice">进入训练强化</button>
            </div>
          </aside>
        </div>
      </section>

      <section class="surface-panel overview-chapter-entry">
        <div class="section-heading">
          <div>
            <span class="eyebrow">课程章节</span>
            <h3>进入章节学习</h3>
          </div>
          <button class="btn tiny primary" data-action="switch-view" data-view="chapter">进入章节学习</button>
        </div>
        <div class="overview-entry-row">
          <div class="overview-entry-copy">
            <strong>按章节继续学习</strong>
            <p class="body-copy">从章节目录进入当前课程内容，按顺序看知识点、做小测和回顾本章重点。</p>
          </div>
          <div class="overview-entry-actions">
            <button class="btn subtle" data-action="open-chapter" data-chapter-id="${continueChapter.id}">继续第 ${continueChapter.number} 章</button>
            <button class="btn subtle" data-action="switch-view" data-view="chapter">打开章节目录</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderAuthLayer() {
  if (!app.auth.modalOpen) {
    authLayerEl.innerHTML = '';
    authLayerEl.classList.remove('open');
    return;
  }
  authLayerEl.classList.add('open');
  const isAccount = app.auth.modalMode === 'account';
  authLayerEl.innerHTML = `
    <div class="auth-backdrop" data-action="close-auth-modal"></div>
    <div class="auth-modal surface-panel">
      <div class="auth-modal-head">
        <div>
          <span class="eyebrow">${isAccount ? '账号中心' : app.auth.modalMode === 'register' ? '注册账号' : '登录账号'}</span>
          <h3>${isAccount ? (app.auth.user ? app.auth.user.username : '未登录') : app.auth.modalMode === 'register' ? '创建可同步学习进度的账号' : '登录后同步学习进度'}</h3>
        </div>
        <button class="icon-btn" data-action="close-auth-modal" aria-label="关闭">关</button>
      </div>
      ${isAccount ? renderAccountPanel() : renderAuthForm()}
    </div>
  `;
}

function renderAccountPanel() {
  return `
    <div class="auth-stack">
      <div class="auth-info-card">
        <div class="auth-info-row"><span>当前账号</span><strong>${app.auth.user?.username || '--'}</strong></div>
        <div class="auth-info-row"><span>同步状态</span><strong>${syncStatusLabel()}</strong></div>
        <div class="auth-info-row"><span>最近同步</span><strong>${app.auth.lastSyncedAt ? formatDate(app.auth.lastSyncedAt) : '--'}</strong></div>
        <div class="auth-info-row"><span>待同步变更</span><strong>${app.auth.pendingChanges ? '有变更' : '已同步'}</strong></div>
      </div>
      ${app.auth.generated ? `<div class="generated-box"><span class="eyebrow">最近生成</span><p>账号：${app.auth.generated.username}</p><p>密码：${app.auth.generated.password}</p><button class="btn tiny subtle" data-action="copy-generated">复制账号密码</button></div>` : ''}
      <div class="danger-box">
        <span class="eyebrow">危险操作</span>
        <p class="body-copy">重置后会清空当前账号中的全部学习进度，不能恢复。</p>
        <div class="action-row">
          <button class="btn tiny danger" data-action="reset-progress">重置学习进度</button>
        </div>
      </div>
      <div class="action-row">
        <button class="btn subtle" data-action="sync-now">立即同步</button>
        <button class="btn subtle" data-action="logout">退出登录</button>
      </div>
    </div>
  `;
}

function renderAuthForm() {
  const isRegister = app.auth.modalMode === 'register';
  return `
    <div class="auth-stack">
      <label class="field-stack">
        <span class="field-label">账号</span>
        <input class="input" data-change="auth-username" value="${escapeHtml(app.session.authDraft.username)}" placeholder="自己取一个好记的账号"/>
      </label>
      <label class="field-stack">
        <span class="field-label">密码</span>
        <input class="input" type="password" data-change="auth-password" value="${escapeHtml(app.session.authDraft.password)}" placeholder="密码可以简单一点，但别留空"/>
      </label>
      ${app.auth.error ? `<div class="feedback wrong">${app.auth.error}</div>` : ''}
      ${isRegister && app.auth.generated ? `<div class="generated-box"><span class="eyebrow">已自动生成</span><p>账号：${app.auth.generated.username}</p><p>密码：${app.auth.generated.password}</p><button class="btn tiny subtle" data-action="copy-generated">复制账号密码</button></div>` : ''}
      <div class="action-row">
        <button class="btn primary" data-action="${isRegister ? 'register' : 'login'}">${isRegister ? '注册并登录' : '登录'}</button>
        ${isRegister ? '<button class="btn subtle" data-action="register-auto">自动生成账号密码</button>' : '<button class="btn subtle" data-action="open-auth-modal" data-mode="register">去注册</button>'}
      </div>
    </div>
  `;
}

function renderChapterOverviewCard(chapter) {
  const progress = getChapterProgress(chapter);
  const passline = getChapterPassline(chapter);
  const training = getTrainingOverview(chapter.id);
  const teacherCount = getTeacherQuestionsByChapter(chapter.id).length;
  return `
    <article class="chapter-overview-card">
      <div class="chapter-card-head">
        <div>
          <span class="eyebrow">第 ${chapter.number} 章</span>
          <h4>${chapter.title}</h4>
          <p class="chapter-card-summary">${getChapterCardSummary(chapter)}</p>
        </div>
        <span class="soft-badge">${chapter.difficulty}</span>
      </div>
      <div class="chapter-card-progress-row">
        <span>当前进度</span>
        <strong>${progress.percent}%</strong>
      </div>
      <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
      <div class="chapter-card-meta secondary">
        <span>${passline.readyTopics}/${passline.totalTopics} 个必会点</span>
        <span>最近测试 ${training.lastScore}</span>
        <span>老师题 ${teacherCount} 道</span>
      </div>
      <div class="card-actions">
        <button class="btn tiny primary" data-action="open-chapter" data-chapter-id="${chapter.id}">进入学习</button>
        <button class="btn tiny subtle" data-action="open-passline" data-chapter-id="${chapter.id}">去做题</button>
      </div>
    </article>
  `;
}

function renderChapterView() {
  const chapter = getSelectedChapter();
  const progress = getChapterProgress(chapter);
  const chapterState = app.state.progress.chapters[chapter.id] || {};
  const featured = chapter.sections.slice(0, 3);
  const totalSections = chapter.sections.length;
  const totalPoints = chapter.sections.reduce((sum, section) => sum + section.points.length, 0);
  const passline = getChapterPassline(chapter);
  const teacherCount = getTeacherQuestionsByChapter(chapter.id).length;
  pageEl.innerHTML = `
    <div class="page-stack chapter-stack">
      <section class="chapter-hero surface-panel">
        <div class="chapter-hero-layout">
          <div class="chapter-hero-copy">
            <span class="eyebrow">章节学习</span>
            <h3>第 ${chapter.number} 章 · ${chapter.title}</h3>
            <p class="body-copy">${chapter.summary}</p>
            <div class="chapter-hero-tags">
              <span>${totalSections} 节内容</span>
              <span>${totalPoints} 个知识点</span>
              <span>${passline.totalTopics} 个及格线必会点</span>
              <span>${chapter.relatedSimulatorIds.length} 个相关模拟器</span>
              <span>${teacherCount} 道老师题</span>
            </div>
          </div>
          <div class="hero-meta-grid chapter-hero-metrics">
            <div class="metric-card"><span>推荐用时</span><strong>${getStudyTime(chapter)}</strong></div>
            <div class="metric-card"><span>当前掌握度</span><strong>${progress.percent}%</strong></div>
            <div class="metric-card"><span>最近测试</span><strong>${chapterState.lastQuizScore ?? '--'}</strong></div>
          </div>
        </div>
      </section>

      <section class="surface-panel chapter-guide-shell">
        <div class="chapter-guide-grid">
          <article class="chapter-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">这一章学什么</span>
                <h3>本章完成后应掌握</h3>
              </div>
            </div>
            <div class="pill-list">${chapter.learningGoals.map((goal) => `<span class="info-pill">${goal}</span>`).join('')}</div>
          </article>
          <article class="chapter-guide-card accent">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">及格线必会</span>
                <h3>先拿下这几个最低必会点</h3>
              </div>
            </div>
            <div class="must-topic-list">${passline.points.map((point) => `<button class="must-topic-chip" data-action="review-topic" data-topic-id="${point.id}" data-chapter-id="${chapter.id}">${point.title}</button>`).join('')}</div>
            <p class="body-copy">先把这 ${passline.totalTopics} 个点做懂，再去补完整细节，效率会高很多。</p>
          </article>
          <article class="chapter-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">本章导览</span>
                <h3>建议阅读顺序</h3>
              </div>
            </div>
            <div class="chapter-map-list">${chapter.chapterMap.map((item) => `<div class="map-row">${item}</div>`).join('')}</div>
          </article>
          <article class="chapter-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">先修提醒</span>
                <h3>阅读前先对齐前置概念</h3>
              </div>
            </div>
            <ul class="plain-list">${chapter.prerequisites.map((item) => `<li>${item}</li>`).join('')}</ul>
          </article>
          <article class="chapter-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">必看知识块</span>
                <h3>优先完成这几段</h3>
              </div>
            </div>
            <div class="featured-list">${featured.map((section) => `<div class="featured-item"><strong>${section.title}</strong><span>${section.points.length} 个知识点</span></div>`).join('')}</div>
          </article>
          <article class="chapter-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">常见失分点</span>
                <h3>做题前先避开这几类坑</h3>
              </div>
            </div>
            <ul class="plain-list">${chapter.commonMistakes.map((item) => `<li>${item}</li>`).join('')}</ul>
          </article>
          <article class="chapter-guide-card accent teacher-guide-card">
            <div class="section-heading compact-heading">
              <div>
                <span class="eyebrow">老师题库</span>
                <h3>本章老师原题单独整理</h3>
              </div>
            </div>
            <p class="body-copy">这一章已整理 ${teacherCount} 道老师发布或课件重点题，适合在看完主干后直接刷原题表达。</p>
            <div class="action-row">
              <button class="btn tiny primary" data-action="open-teacher" data-chapter-id="${chapter.id}">进入本章老师题</button>
            </div>
          </article>
        </div>
      </section>

      ${chapter.sections.map((section, index) => renderSectionCard(chapter, section, index)).join('')}

      <section class="surface-panel summary-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">章末整理</span>
            <h3>把这一章真正压缩成能带走的东西</h3>
          </div>
        </div>
        <div class="summary-board">
          <div class="summary-column"><h4>本章必背 5 条</h4><ul class="plain-list">${chapter.checkpoints.map((item) => `<li>${item}</li>`).join('')}</ul></div>
          <div class="summary-column"><h4>高频考点</h4><ul class="plain-list">${chapter.highFrequency.map((item) => `<li>${item}</li>`).join('')}</ul></div>
          <div class="summary-column"><h4>易混概念对照</h4><ul class="plain-list">${chapter.confusions.map(([a, b]) => `<li>${a} / ${b}</li>`).join('')}</ul></div>
        </div>
        <div class="checklist-panel">
          <h4>过线检查单</h4>
          <div class="checklist-grid">
            ${passline.points.map((point) => {
              const done = app.state.progress.points[point.id]?.status === 'mastered';
              return `<div class="checklist-item ${done ? 'done' : ''}"><strong>${done ? '已会' : '待补'}</strong><span>${point.title}</span></div>`;
            }).join('')}
          </div>
        </div>
        <div class="action-row">
          <button class="btn primary" data-action="open-practice" data-chapter-id="${chapter.id}">进入章节练习</button>
          <button class="btn subtle" data-action="open-passline" data-chapter-id="${chapter.id}">先做过线练习</button>
          <button class="btn subtle" data-action="open-test" data-chapter-id="${chapter.id}">开始综合测试</button>
        </div>
      </section>
    </div>
  `;
}

function renderSectionCard(chapter, section, sectionIndex) {
  const grouped = groupSectionPoints(section);
  const sectionSnapshot = getSectionSnapshot(grouped);
  return `
    <section class="surface-panel section-block">
      <div class="section-heading spread align-start">
        <div>
          <span class="eyebrow">分节学习 · 第 ${sectionIndex + 1} 节</span>
          <h3>${section.title}</h3>
          <p class="body-copy">${section.overview}</p>
        </div>
        <div class="section-head-actions">
          <span class="tiny-pill">${section.points.length} 个知识点</span>
          <button class="btn tiny subtle" data-action="open-practice" data-chapter-id="${chapter.id}" data-section-id="${section.id}">做本节小测</button>
        </div>
      </div>
      <div class="section-quickstart">
        <span class="eyebrow">先看这几个</span>
        <div class="must-topic-list">${section.mustFirstIds.map((pointId) => {
          const point = section.points.find((item) => item.id === pointId);
          return point ? `<button class="must-topic-chip compact" data-action="review-topic" data-topic-id="${point.id}" data-chapter-id="${chapter.id}">${point.title}</button>` : '';
        }).join('')}</div>
        <div class="section-snapshot-grid">
          <div class="section-snapshot-card essential">
            <span>先掌握</span>
            <strong>${sectionSnapshot.essential}</strong>
            <small>${sectionSnapshot.essentialHint}</small>
          </div>
          <div class="section-snapshot-card standard">
            <span>再理解</span>
            <strong>${sectionSnapshot.standard}</strong>
            <small>${sectionSnapshot.standardHint}</small>
          </div>
          <div class="section-snapshot-card review">
            <span>易混提醒</span>
            <strong>${sectionSnapshot.review}</strong>
            <small>${sectionSnapshot.reviewHint}</small>
          </div>
        </div>
      </div>
      <div class="point-lane-list">
        ${grouped.map((group) => `
          <div class="point-lane lane-${group.key}">
            <div class="point-lane-head">
              <strong>${group.label}</strong>
              <span>${group.description}</span>
            </div>
            <div class="point-list">${group.points.map((point, pointIndex) => renderPointCard(chapter, section, point, pointIndex)).join('')}</div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderPointCard(chapter, section, point, pointIndex) {
  const status = app.state.progress.points[point.id]?.status || 'unseen';
  return `
    <details class="point-card" ${app.state.progress.lastPointId === point.id ? 'open' : ''}>
      <summary data-action="focus-point" data-chapter-id="${chapter.id}" data-point-id="${point.id}">
        <div class="point-card-head">
          <div>
            <div class="point-label-row">
              <span class="point-index">0${pointIndex + 1}</span>
              <span class="eyebrow">一句话结论</span>
            </div>
            <strong>${point.title}</strong>
          </div>
          <span class="status-pill ${status}">${statusLabel(status)}</span>
        </div>
        <div class="point-conclusion">${point.conclusion}</div>
        ${point.preview ? `<div class="point-excerpt"><span>为什么是这样</span><p>${point.preview}</p></div>` : ''}
        <div class="point-hint-row"><span>展开完整说明</span><em>${section.title}</em></div>
      </summary>
      <div class="point-detail-wrap">
        <div class="point-detail-block">
          <span class="detail-label">完整说明</span>
          <div class="point-body">${cleanLeadText(point.detail)}</div>
        </div>
        ${point.svg ? `<div class="svg-box">${point.svg}</div>` : ''}
        <div class="point-meta-grid">
          ${point.pitfall ? `<div class="point-tip"><span class="detail-label">易错点</span><p>${point.pitfall}</p></div>` : ''}
          ${getConfusionHints(chapter, point).length ? `<div class="point-compare"><span class="detail-label">对比概念</span><ul class="plain-list">${getConfusionHints(chapter, point).map((item) => `<li>${item}</li>`).join('')}</ul></div>` : ''}
        </div>
        <div class="point-actions">
          <button class="btn tiny success ${status === 'mastered' ? 'active' : ''}" data-action="set-point-status" data-point-id="${point.id}" data-status="mastered">我掌握了</button>
          <button class="btn tiny subtle ${status === 'review' ? 'active' : ''}" data-action="set-point-status" data-point-id="${point.id}" data-status="review">待复习</button>
          <button class="btn tiny subtle" data-action="open-practice" data-chapter-id="${chapter.id}" data-section-id="${section.id}">去本节练习</button>
          ${point.relatedSimulatorIds.map((simId) => {
            const sim = SIMULATORS.find((item) => item.id === simId);
            return sim ? `<button class="chip-btn" data-action="open-simulator" data-simulator-id="${simId}">${sim.title}</button>` : '';
          }).join('')}
        </div>
      </div>
    </details>
  `;
}

function renderPracticeView() {
  const chapter = getSelectedChapter();
  const bundle = getQuizBundle(chapter.id);
  const section = getSelectedPracticeSection(chapter, bundle);
  const wrongs = wrongbookEntries().filter((item) => item.chapterId === chapter.id);
  const overview = getTrainingOverview(chapter.id);
  const passlineSet = getPasslineQuestionSet(chapter.id);
  const teacherCount = getTeacherQuestionsByChapter(chapter.id).length;
  pageEl.innerHTML = `
    <div class="page-stack training-stack">
      <section class="training-hero surface-panel">
        <div class="training-hero-layout">
          <div class="training-hero-copy">
            <span class="eyebrow">训练强化</span>
            <h3>第 ${chapter.number} 章 · ${chapter.title}</h3>
            <p class="body-copy">先用过线练习把必会点拿下，再用章节练习和综合测试把得分盘做稳。做错以后，能直接回知识点或开模拟器补理解。</p>
            <div class="training-hero-tags">
              <span>${passlineSet.length} 道过线题</span>
              <span>${bundle.practiceSections.length} 个练习小节</span>
              <span>${bundle.chapterTest.length} 道综合测试题</span>
              <span>${wrongs.length} 道本章错题</span>
              <span>${teacherCount} 道老师题</span>
            </div>
          </div>
          <div class="hero-meta-grid training-hero-metrics">
            <div class="metric-card"><span>当前章过线状态</span><strong>${overview.passlineReady ? '已达线' : '待补强'}</strong></div>
            <div class="metric-card"><span>最近成绩</span><strong>${overview.lastScore}</strong></div>
            <div class="metric-card"><span>错题数量</span><strong>${overview.wrongCount}</strong></div>
            <div class="metric-card"><span>当前薄弱节</span><strong>${overview.weakSection || '--'}</strong></div>
          </div>
        </div>
      </section>

      <section class="surface-panel training-shell">
        <div class="training-shell-head">
          <div class="training-controls">
            <div class="toolbar-grid">
              <div>
                <label class="field-label">章节</label>
                <select class="select" data-change="select-practice-chapter">
                  ${app.data.chapters.map((item) => `<option value="${item.id}" ${item.id === chapter.id ? 'selected' : ''}>第 ${item.number} 章 · ${item.title}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="field-label">小节</label>
                <select class="select" data-change="select-practice-section">
                  ${bundle.practiceSections.map((item) => `<option value="${item.sectionId}" ${item.sectionId === section.sectionId ? 'selected' : ''}>${item.sectionTitle}</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="segment-tabs training-tabs" role="tablist">
              ${renderModeTab('passline', '过线练习')}
              ${renderModeTab('section', '章节练习')}
              ${renderModeTab('test', '综合测试')}
              ${renderModeTab('wrongbook', '错题复习')}
              ${renderModeTab('teacher', '老师题')}
              ${renderModeTab('simulator', '模拟器')}
            </div>
          </div>
          <div class="training-status-card">
            <span class="eyebrow">训练状态</span>
            <h4>${modeSummaryLabel()}</h4>
            <p class="body-copy">${modeSummaryText(chapter, section, wrongs)}</p>
            <div class="action-row small">
              <button class="btn tiny subtle" data-action="open-teacher" data-chapter-id="${chapter.id}">刷本章老师题</button>
            </div>
          </div>
        </div>

        ${app.state.practiceMode === 'passline' ? renderPasslinePractice(chapter, passlineSet) : ''}
        ${app.state.practiceMode === 'section' ? renderSectionPractice(section) : ''}
        ${app.state.practiceMode === 'test' ? renderChapterTest(chapter, bundle) : ''}
        ${app.state.practiceMode === 'wrongbook' ? renderWrongbook(chapter, wrongs) : ''}
        ${app.state.practiceMode === 'teacher' ? renderTeacherPractice(chapter) : ''}
        ${app.state.practiceMode === 'simulator' ? renderSimulatorWorkbench(chapter) : ''}
      </section>
    </div>
  `;
  if (app.state.practiceMode === 'simulator') {
    const mountPoint = document.getElementById('simulator-stage');
    mountSimulator(app.state.selectedSimulatorId, mountPoint);
  }
}

function renderTeacherPractice(chapter) {
  const questions = getFilteredTeacherQuestions();
  const chapterOptions = [{ value: 'all', label: '全部章节' }].concat(
    app.data.chapters
      .filter((item) => getTeacherQuestionsByChapter(item.id).length)
      .map((item) => ({ value: item.id, label: `第 ${item.number} 章 · ${item.title}` })),
  );
  const sourceOptions = [{ value: 'all', label: '全部来源' }].concat(
    app.data.teacherSources.map((source) => ({ value: source.id, label: source.label })),
  );
  const stats = getTeacherStats();
  const quickPresets = getTeacherQuickPresets(chapter);
  const selection = getTeacherSelectionStats(questions);
  return `
      <section class="training-panel training-panel-sheet teacher-sheet">
        <div class="section-heading training-panel-head">
          <div>
            <span class="eyebrow">老师题</span>
            <h3>${chapter.title} · 老师重点题</h3>
            <p class="body-copy">老师测试题和课件重点题都收在这里。默认还是以当前章节为主刷，需要时也可以切到全部章节。</p>
          </div>
          <span class="soft-badge">${questions.length} 题</span>
        </div>

        <div class="passline-summary-strip teacher-summary-strip">
          <div><span>老师题总量</span><strong>${stats.total}</strong></div>
          <div><span>雨课堂题</span><strong>${stats.rainclassroom}</strong></div>
          <div><span>课件重点题</span><strong>${stats.courseware}</strong></div>
        </div>

        <div class="teacher-paper-shell">
          <div class="teacher-paper-head">
            <div>
              <span class="eyebrow">小卷模式</span>
              <h4>先选一套小卷，再继续细筛</h4>
            </div>
            <p class="body-copy">把老师题收成几种常见刷法。临考时直接点一套，就能马上开刷。</p>
          </div>
          <div class="teacher-paper-grid">
            ${quickPresets.map((preset) => renderTeacherQuickCard(preset)).join('')}
          </div>
          <div class="teacher-paper-sequence">
            <span class="eyebrow">推荐顺序</span>
            <div class="teacher-sequence-row">
              <span>5 题快刷</span>
              <span>10 题标准卷</span>
              <span>20 题冲刺卷</span>
              <span>错题回炉</span>
            </div>
          </div>
        </div>

        <div class="teacher-filter-shell">
          <div class="teacher-focus-card teacher-active-paper">
            <div class="teacher-active-paper-copy">
              <span class="eyebrow">当前小卷</span>
              <h4>${getTeacherActivePaperTitle(chapter)}</h4>
              <p class="body-copy">${getTeacherQuickModeText(chapter, questions.length)}</p>
            </div>
            <div class="teacher-active-paper-meta">
              <div><span>本卷题量</span><strong>${questions.length}</strong></div>
              <div><span>当前章节</span><strong>${app.state.teacherChapterId === 'all' ? '全章节' : (app.data.chapters.find((item) => item.id === app.state.teacherChapterId)?.title || '当前章')}</strong></div>
              <div><span>来源状态</span><strong>${getTeacherSourceSummary()}</strong></div>
            </div>
            <div class="teacher-selection-strip">
              <div><span>选择题</span><strong>${selection.singleCount}</strong></div>
              <div><span>填空题</span><strong>${selection.fillCount}</strong></div>
              <div><span>覆盖章节</span><strong>${selection.chapterCount}</strong></div>
              <div><span>错题回炉</span><strong>${selection.wrongCount}</strong></div>
            </div>
            <div class="action-row small">
              ${isTeacherRandomMode() ? `<button class="btn tiny primary" data-action="set-teacher-quick-mode" data-mode="${app.state.teacherQuickMode}">重新抽这一卷</button>` : ''}
              <button class="btn tiny subtle" data-action="set-teacher-quick-mode" data-mode="chapter-current">回到当前章老师题</button>
            </div>
          </div>

          <div class="teacher-custom-shell">
            <div class="toolbar-grid teacher-toolbar">
              <div>
                <label class="field-label">章节</label>
                <select class="select" data-change="teacher-chapter">
                  ${chapterOptions.map((item) => `<option value="${item.value}" ${item.value === app.state.teacherChapterId ? 'selected' : ''}>${item.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="field-label">来源</label>
                <select class="select" data-change="teacher-source">
                  ${sourceOptions.map((item) => `<option value="${item.value}" ${item.value === app.state.teacherSource ? 'selected' : ''}>${item.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="field-label">题型</label>
                <select class="select" data-change="teacher-type">
                  <option value="all" ${app.state.teacherType === 'all' ? 'selected' : ''}>全部题型</option>
                  <option value="single" ${app.state.teacherType === 'single' ? 'selected' : ''}>选择题</option>
                  <option value="fill" ${app.state.teacherType === 'fill' ? 'selected' : ''}>填空题</option>
                </select>
              </div>
            </div>
            <div class="teacher-source-pills">
              ${app.data.teacherSources.map((source) => `<span class="tiny-pill ${app.state.teacherSource === source.id ? 'active' : ''}">${source.label}</span>`).join('')}
            </div>
            <div class="teacher-helper-note">
              <span class="eyebrow">细筛区</span>
              <p class="body-copy">如果这套小卷还不够窄，就继续按章节、具体来源和题型往下收。你一旦改动筛选，这里会自动转成自定义模式。</p>
            </div>
          </div>
        </div>
        ${questions.length ? `<div class="quiz-list teacher-quiz-list">${questions.map(renderPracticeQuestion).join('')}</div>` : renderTeacherEmptyState()}
      </section>
  `;
}

function renderTeacherQuickCard(preset) {
  return `
    <button class="teacher-quick-card ${app.state.teacherQuickMode === preset.mode ? 'active' : ''}" data-action="set-teacher-quick-mode" data-mode="${preset.mode}">
      <div class="teacher-quick-card-head">
        <span class="tiny-pill">${preset.badge}</span>
        <strong>${preset.count} 题</strong>
      </div>
      <h4>${preset.label}</h4>
      <p>${preset.description}</p>
    </button>
  `;
}

function renderModeTab(mode, label) {
  return `<button class="segment-tab ${app.state.practiceMode === mode ? 'active' : ''}" data-action="set-practice-mode" data-mode="${mode}">${label}</button>`;
}

function renderPasslinePractice(chapter, questions) {
  const passline = getChapterPassline(chapter);
  return `
    <section class="training-panel training-panel-sheet passline-sheet">
      <div class="section-heading training-panel-head">
        <div>
          <span class="eyebrow">过线练习</span>
          <h3>${chapter.title}</h3>
          <p class="body-copy">只练最低必会点和高频题，先把最容易丢分的地方补齐，再去做综合测试。</p>
        </div>
        <span class="soft-badge">${questions.length} 题</span>
      </div>
      <div class="passline-summary-strip">
        <div><span>必会点</span><strong>${passline.readyTopics}/${passline.totalTopics}</strong></div>
        <div><span>最近过线分</span><strong>${app.state.lastPasslineScore[chapter.id] || '--'}</strong></div>
        <div><span>优先动作</span><strong>先对后难</strong></div>
      </div>
      <div class="quiz-list">${questions.map(renderPracticeQuestion).join('')}</div>
    </section>
  `;
}

function renderSectionPractice(section) {
  return `
    <section class="training-panel training-panel-sheet">
      <div class="section-heading training-panel-head">
        <div>
          <span class="eyebrow">章节练习</span>
          <h3>${section.sectionTitle}</h3>
          <p class="body-copy">即时反馈模式，适合边学边做，判断自己对刚刚那一节的掌握程度。</p>
        </div>
        <span class="soft-badge">${section.questions.length} 题</span>
      </div>
      <div class="quiz-list">${section.questions.map(renderPracticeQuestion).join('')}</div>
    </section>
  `;
}

function renderPracticeQuestion(question) {
  const current = app.session.practiceAnswers[question.id];
  const feedback = app.session.practiceFeedback[question.id];
  const teacherMeta = question.teacherFocus ? getTeacherQuestionMeta(question) : '';
  return `
    <article class="quiz-card ${feedback?.status || ''} ${question.teacherFocus ? 'teacher-focus-card' : ''}">
      <div class="question-head">
        <span class="eyebrow">${question.teacherFocus ? '老师题即时反馈' : '即时反馈'}</span>
        <h4>${question.stem}</h4>
        ${teacherMeta ? `<div class="teacher-question-meta">${teacherMeta}</div>` : ''}
        ${question.teacherFocus ? `<div class="teacher-tag-row">${question.tags.map((tag) => `<span class="tiny-pill">${tag}</span>`).join('')}</div>` : ''}
      </div>
      ${renderPracticeInput(question, current, feedback)}
      ${feedback ? `<div class="feedback ${feedback.status}">${feedback.message}${question.explanation ? `<br><strong>解析：</strong>${question.explanation}` : ''}</div>` : ''}
    </article>
  `;
}

function renderPracticeInput(question, current, feedback) {
  if (question.type === 'judge') {
    return `<div class="option-list"><button class="option-btn ${current === true ? 'selected' : ''} ${feedback?.status && question.answer === true ? 'correct' : ''} ${feedback?.status && current === true && question.answer !== true ? 'wrong' : ''}" data-action="practice-answer" data-question-id="${question.id}" data-answer-value="true">正确</button><button class="option-btn ${current === false ? 'selected' : ''} ${feedback?.status && question.answer === false ? 'correct' : ''} ${feedback?.status && current === false && question.answer !== false ? 'wrong' : ''}" data-action="practice-answer" data-question-id="${question.id}" data-answer-value="false">错误</button></div>`;
  }
  if (question.type === 'fill') {
    return `<div class="option-list"><input class="input" data-change="practice-fill" data-question-id="${question.id}" value="${escapeHtml(current || '')}" placeholder="请输入答案"/>${feedback ? `<button class="btn tiny subtle" data-action="practice-fill-submit" data-question-id="${question.id}">重新判断</button>` : `<button class="btn tiny primary" data-action="practice-fill-submit" data-question-id="${question.id}">提交判断</button>`}</div>`;
  }
  return `<div class="option-list">
    ${question.options.map((option, index) => {
      const classes = ['option-btn'];
      if (current === index) classes.push('selected');
      if (feedback?.status) {
        if (index === question.answerIndex) classes.push('correct');
        else if (current === index && current !== question.answerIndex) classes.push('wrong');
      }
      return `<button class="${classes.join(' ')}" data-action="practice-answer" data-question-id="${question.id}" data-answer-index="${index}">${String.fromCharCode(65 + index)}. ${option}</button>`;
    }).join('')}
  </div>`;
}

function renderChapterTest(chapter, bundle) {
  return `
    <section class="training-panel training-panel-sheet test-sheet">
      <div class="section-heading training-panel-head">
        <div>
          <span class="eyebrow">综合测试</span>
          <h3>${chapter.title}</h3>
          <p class="body-copy">按整章交卷评分，用于检验本章知识点的整体掌握情况。</p>
        </div>
        <span class="soft-badge">${bundle.chapterTest.length} 题</span>
      </div>
      <div class="quiz-list">${bundle.chapterTest.map((question, index) => renderTestQuestion(question, index)).join('')}</div>
      <div class="action-row">
        <button class="btn primary" data-action="submit-test" data-chapter-id="${chapter.id}">交卷评分</button>
        <button class="btn subtle" data-action="reset-test">重置作答</button>
      </div>
      ${app.session.testSubmitted ? renderTestScore(chapter.id) : ''}
    </section>
  `;
}

function renderTestQuestion(question, index) {
  const answer = app.session.testAnswers[question.id];
  const submitted = app.session.testSubmitted;
  const ok = submitted ? isAnswerCorrect(question, answer) : null;
  return `
    <article class="quiz-card ${submitted ? (ok ? 'correct' : 'wrong') : ''}">
      <div class="question-head">
        <span class="eyebrow">第 ${index + 1} 题</span>
        <h4>${question.stem}</h4>
      </div>
      ${question.type === 'single' ? `<div class="option-list">${question.options.map((option, optionIndex) => {
        const classes = ['option-btn'];
        if (answer === optionIndex) classes.push('selected');
        if (submitted && optionIndex === question.answerIndex) classes.push('correct');
        if (submitted && answer === optionIndex && answer !== question.answerIndex) classes.push('wrong');
        return `<button class="${classes.join(' ')}" data-action="test-answer" data-question-id="${question.id}" data-answer-index="${optionIndex}">${String.fromCharCode(65 + optionIndex)}. ${option}</button>`;
      }).join('')}</div>` : ''}
      ${question.type === 'judge' ? `<div class="option-list"><button class="option-btn ${answer === true ? 'selected' : ''} ${submitted && question.answer === true ? 'correct' : ''} ${submitted && answer === true && question.answer !== true ? 'wrong' : ''}" data-action="test-answer" data-question-id="${question.id}" data-answer-value="true">正确</button><button class="option-btn ${answer === false ? 'selected' : ''} ${submitted && question.answer === false ? 'correct' : ''} ${submitted && answer === false && question.answer !== false ? 'wrong' : ''}" data-action="test-answer" data-question-id="${question.id}" data-answer-value="false">错误</button></div>` : ''}
      ${question.type === 'fill' ? `<input class="input" data-change="test-fill" data-question-id="${question.id}" value="${escapeHtml(answer || '')}" placeholder="请输入答案" ${submitted ? 'disabled' : ''}/>` : ''}
      ${submitted ? `<div class="feedback ${ok ? 'correct' : 'wrong'}">${ok ? '回答正确。' : `正确答案：${formatAnswer(question, correctAnswerFor(question))}`}${question.explanation ? `<br><strong>解析：</strong>${question.explanation}` : ''}</div>` : ''}
    </article>
  `;
}

function renderTestScore(chapterId) {
  const questions = getChapterTestQuestions(chapterId);
  const correct = questions.filter((question) => isAnswerCorrect(question, app.session.testAnswers[question.id])).length;
  const percent = Math.round((correct / questions.length) * 100);
  return `<div class="score-box"><div><strong>${correct}/${questions.length}</strong><div class="muted">正确率 ${percent}%</div></div><div class="muted">成绩已同步到学习总览与错题记录。</div></div>`;
}

function renderWrongbook(chapter, wrongs) {
  return `
    <section class="training-panel training-panel-sheet">
      <div class="section-heading training-panel-head">
        <div>
          <span class="eyebrow">错题复习</span>
          <h3>${chapter.title}</h3>
          <p class="body-copy">先回看对应概念，再结合模拟器补强理解薄弱点。</p>
        </div>
        <span class="soft-badge">${wrongs.length} 道</span>
      </div>
      ${wrongs.length ? `<div class="wrongbook-list">${wrongs.map((item) => `
        <article class="wrong-item">
          <div class="question-head">
            <span class="eyebrow">错 ${item.wrongCount} 次</span>
            <h4>${item.stem}</h4>
          </div>
          <p class="muted">你的答案：${item.userAnswer || '未作答'} · 正确答案：${item.correctAnswer}</p>
          ${item.explanation ? `<p class="body-copy">${item.explanation}</p>` : ''}
          <small class="muted">最近一次 ${formatDate(item.lastWrongAt)}</small>
          <div class="action-row small">
            ${item.relatedTopicId ? `<button class="btn tiny primary" data-action="review-topic" data-topic-id="${item.relatedTopicId}" data-chapter-id="${item.chapterId}">先回知识点</button>` : ''}
            ${item.relatedSimulatorId ? `<button class="btn tiny subtle" data-action="open-simulator" data-simulator-id="${item.relatedSimulatorId}">我还是没懂，开模拟器</button>` : ''}
          </div>
        </article>`).join('')}</div><div class="action-row"><button class="btn subtle" data-action="clear-wrongbook" data-chapter-id="${chapter.id}">清空本章错题</button></div>` : '<div class="empty-state">本章目前没有错题记录，可切换到章节练习或综合测试继续训练。</div>'}
    </section>
  `;
}

function renderSimulatorWorkbench(chapter) {
  return `
    <section class="training-panel simulator-workbench">
      <div class="simulator-layout">
        <aside class="simulator-rail">
          <div class="section-heading training-panel-head">
            <div>
              <span class="eyebrow">模拟器</span>
              <h3>先按理解难点选择工具</h3>
            </div>
          </div>
          <div class="simulator-groups">
            ${SIMULATOR_GROUPS.map((group) => `
              <section class="simulator-group-block">
                <h4>${group.label}</h4>
                <div class="simulator-card-list">
                  ${group.ids.map((simId) => renderSimulatorCard(simId, chapter)).join('')}
                </div>
              </section>
            `).join('')}
          </div>
        </aside>
        <div class="simulator-main">
          <section class="simulator-context">
            <span class="eyebrow">当前强化工具</span>
            <h3>${getSelectedSimulator().title}</h3>
            <p class="body-copy">${getSelectedSimulator().summary}</p>
          </section>
          <section id="simulator-stage" class="simulator-stage-host"></section>
        </div>
      </div>
    </section>
  `;
}

function modeSummaryLabel() {
  const labels = {
    passline: '当前处于过线练习',
    section: '当前处于章节练习',
    test: '当前处于综合测试',
    wrongbook: '当前处于错题复习',
    teacher: '当前处于老师题模式',
    simulator: '当前处于模拟器强化',
  };
  return labels[app.state.practiceMode] || '当前训练中';
}

function modeSummaryText(chapter, section, wrongs) {
  if (app.state.practiceMode === 'passline') {
    const passline = getChapterPassline(chapter);
    return `本章先盯住 ${passline.totalTopics} 个及格线必会点，优先确保基础题不丢分。`;
  }
  if (app.state.practiceMode === 'section') {
    return `${section.sectionTitle} 提供即时反馈，适合配合刚完成的知识点阅读继续巩固。`;
  }
  if (app.state.practiceMode === 'test') {
    return `本章共 ${getChapterTestQuestions(chapter.id).length} 题，适合用整章测试确认当前得分能力。`;
  }
  if (app.state.practiceMode === 'wrongbook') {
    return wrongs.length
      ? `本章已有 ${wrongs.length} 道错题，可依次回看知识点并补齐薄弱概念。`
      : '本章暂时没有错题记录，可以转入章节练习或综合测试继续训练。';
  }
  if (app.state.practiceMode === 'teacher') {
    const teacherQuestions = getFilteredTeacherQuestions();
    return `这里只显示老师发过的 ${teacherQuestions.length} 道题，适合临考前按老师原题表达快速刷一遍。`;
  }
  return `${chapter.relatedSimulatorIds.length} 个相关模拟器已关联到本章，可配合概念复习一起使用。`;
}

function renderSimulatorCard(simId, chapter) {
  const sim = SIMULATORS.find((item) => item.id === simId);
  if (!sim) return '';
  const active = app.state.selectedSimulatorId === sim.id;
  const related = chapter.relatedSimulatorIds.includes(sim.id);
  return `
    <button class="simulator-card ${active ? 'active' : ''}" data-action="select-simulator" data-simulator-id="${sim.id}">
      <div class="simulator-card-head">
        <strong>${sim.title}</strong>
        ${related ? '<span class="tiny-pill">本章相关</span>' : ''}
      </div>
      <span>${sim.summary}</span>
    </button>
  `;
}

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const d = target.dataset;
  switch (d.action) {
    case 'open-auth-modal':
      app.auth.modalOpen = true;
      app.auth.modalMode = d.mode || 'login';
      app.auth.error = '';
      if (app.auth.modalMode === 'login') app.auth.generated = null;
      renderView();
      break;
    case 'close-auth-modal':
      app.auth.modalOpen = false;
      app.auth.error = '';
      renderView();
      break;
    case 'register':
      handleRegister();
      break;
    case 'register-auto':
      handleAutoRegister();
      break;
    case 'login':
      handleLogin();
      break;
    case 'logout':
      handleLogout();
      break;
    case 'reset-progress':
      handleResetProgress();
      break;
    case 'sync-now':
      flushSyncNow(true);
      break;
    case 'copy-generated':
      copyGeneratedCredentials();
      break;
    case 'toggle-sidebar':
      app.state.mobileSidebarOpen = !app.state.mobileSidebarOpen;
      renderView();
      break;
    case 'switch-view':
      app.state.view = PRIMARY_VIEWS.includes(d.view) ? d.view : 'dashboard';
      app.state.mobileSidebarOpen = false;
      if (app.state.view !== 'practice') resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-teacher':
      app.state.view = 'practice';
      app.state.practiceMode = 'teacher';
      app.state.activeTrack = 'textbook';
      app.state.mobileSidebarOpen = false;
      app.state.teacherChapterId = d.chapterId || app.state.selectedChapterId || app.state.teacherChapterId || 'all';
      app.state.teacherSource = d.sourceId || 'all';
      app.state.teacherSourceType = 'all';
      app.state.teacherType = 'all';
      app.state.teacherQuickMode = d.chapterId ? 'chapter-current' : 'chapter-current';
      app.state.teacherRandomIds = [];
      if (d.chapterId) app.state.selectedChapterId = d.chapterId;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'set-teacher-quick-mode':
      applyTeacherQuickMode(d.mode);
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-track':
      app.state.activeTrack = d.track === 'passline' ? 'passline' : 'textbook';
      app.state.selectedChapterId = getTrackChapter(app.state.activeTrack).id;
      if (app.state.activeTrack === 'passline') {
        app.state.view = 'practice';
        app.state.practiceMode = 'passline';
      } else {
        app.state.view = 'chapter';
      }
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-chapter':
      app.state.selectedChapterId = d.chapterId;
      app.state.activeTrack = 'textbook';
      app.state.view = 'chapter';
      app.state.mobileSidebarOpen = false;
      touchState();
      renderView();
      break;
    case 'focus-point':
      app.state.progress.lastPointId = d.pointId;
      app.state.progress.lastChapterId = d.chapterId;
      persistState();
      break;
    case 'set-point-status':
      setPointStatus(d.pointId, d.status);
      break;
    case 'open-practice':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      if (d.sectionId) app.state.selectedSectionId = d.sectionId;
      app.state.activeTrack = 'textbook';
      app.state.practiceMode = 'section';
      app.state.view = 'practice';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-passline':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      app.state.activeTrack = 'passline';
      app.state.view = 'practice';
      app.state.practiceMode = 'passline';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-wrongbook':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      app.state.activeTrack = 'textbook';
      app.state.view = 'practice';
      app.state.practiceMode = 'wrongbook';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'open-test':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      app.state.activeTrack = 'textbook';
      app.state.view = 'practice';
      app.state.practiceMode = 'test';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'set-practice-mode':
      app.state.practiceMode = d.mode;
      app.state.activeTrack = d.mode === 'passline' ? 'passline' : 'textbook';
      if (d.mode !== 'simulator') resetPracticeSession();
      touchState();
      renderView();
      break;
    case 'practice-answer':
      handlePracticeAnswer(d.questionId, d.answerIndex !== undefined ? Number(d.answerIndex) : d.answerValue === 'true');
      renderView();
      break;
    case 'practice-fill-submit':
      handlePracticeAnswer(d.questionId, app.session.practiceAnswers[d.questionId] || '');
      renderView();
      break;
    case 'test-answer':
      app.session.testAnswers[d.questionId] = d.answerIndex !== undefined ? Number(d.answerIndex) : d.answerValue === 'true';
      renderView();
      break;
    case 'submit-test':
      submitTest(d.chapterId);
      renderView();
      break;
    case 'reset-test':
      resetPracticeSession();
      app.state.practiceMode = 'test';
      renderView();
      break;
    case 'review-topic':
      app.state.selectedChapterId = d.chapterId;
      app.state.activeTrack = 'textbook';
      app.state.view = 'chapter';
      app.state.progress.lastPointId = d.topicId;
      renderView();
      break;
    case 'open-simulator':
    case 'select-simulator':
      app.state.selectedSimulatorId = d.simulatorId;
      app.state.activeTrack = 'textbook';
      app.state.view = 'practice';
      app.state.practiceMode = 'simulator';
      touchState();
      renderView();
      break;
    case 'clear-wrongbook':
      Object.keys(app.state.wrongbook).forEach((key) => {
        if (app.state.wrongbook[key].chapterId === d.chapterId) delete app.state.wrongbook[key];
      });
      touchState();
      renderView();
      break;
  }
}

function handleChange(event) {
  if (event.target.matches('[data-change="auth-username"]')) {
    app.session.authDraft.username = event.target.value;
  }
  if (event.target.matches('[data-change="auth-password"]')) {
    app.session.authDraft.password = event.target.value;
  }
  if (event.target.matches('[data-change="select-practice-chapter"]')) {
    app.state.selectedChapterId = event.target.value;
    app.state.selectedSectionId = getSelectedChapter().sections[0]?.id || null;
    resetPracticeSession();
    touchState();
    renderView();
  }
  if (event.target.matches('[data-change="select-practice-section"]')) {
    app.state.selectedSectionId = event.target.value;
    resetPracticeSession();
    touchState();
    renderView();
  }
  if (event.target.matches('[data-change="practice-fill"]')) {
    app.session.practiceAnswers[event.target.dataset.questionId] = event.target.value;
  }
  if (event.target.matches('[data-change="test-fill"]')) {
    app.session.testAnswers[event.target.dataset.questionId] = event.target.value;
  }
  if (event.target.matches('[data-change="teacher-chapter"]')) {
    app.state.teacherChapterId = event.target.value;
    app.state.teacherQuickMode = 'custom';
    app.state.teacherRandomIds = [];
    if (event.target.value !== 'all') app.state.selectedChapterId = event.target.value;
    resetPracticeSession();
    renderView();
  }
  if (event.target.matches('[data-change="teacher-source"]')) {
    app.state.teacherSource = event.target.value;
    app.state.teacherQuickMode = 'custom';
    app.state.teacherRandomIds = [];
    resetPracticeSession();
    renderView();
  }
  if (event.target.matches('[data-change="teacher-type"]')) {
    app.state.teacherType = event.target.value;
    app.state.teacherQuickMode = 'custom';
    app.state.teacherRandomIds = [];
    resetPracticeSession();
    renderView();
  }
}

function handleInput(event) {
  if (event.target.matches('[data-change="auth-username"]')) {
    app.session.authDraft.username = event.target.value;
  }
  if (event.target.matches('[data-change="auth-password"]')) {
    app.session.authDraft.password = event.target.value;
  }
  if (event.target.matches('[data-change="practice-fill"]')) {
    app.session.practiceAnswers[event.target.dataset.questionId] = event.target.value;
  }
  if (event.target.matches('[data-change="test-fill"]')) {
    app.session.testAnswers[event.target.dataset.questionId] = event.target.value;
  }
}

function handlePracticeAnswer(questionId, answerIndex) {
  const question = getPracticeQuestions().find((item) => item.id === questionId);
  if (!question) return;
  app.session.practiceAnswers[questionId] = answerIndex;
  const correct = isAnswerCorrect(question, answerIndex);
  app.session.practiceFeedback[questionId] = {
    status: correct ? 'correct' : 'wrong',
    message: correct ? '回答正确。' : `正确答案：${formatAnswer(question, correctAnswerFor(question))}。`,
  };
  if (correct) {
    markQuestionReview(question);
  } else {
    recordWrongAnswer(question, formatAnswer(question, answerIndex), formatAnswer(question, correctAnswerFor(question)));
  }
  if (app.state.practiceMode === 'passline') updatePasslineProgress(question.chapterId);
  touchState();
}

function submitTest(chapterId) {
  const questions = getChapterTestQuestions(chapterId);
  let correct = 0;
  questions.forEach((question) => {
    const answer = app.session.testAnswers[question.id];
    if (isAnswerCorrect(question, answer)) {
      correct += 1;
      markQuestionReview(question);
    } else {
      recordWrongAnswer(question, formatAnswer(question, answer), formatAnswer(question, correctAnswerFor(question)));
    }
  });
  app.session.testSubmitted = true;
  const chapter = getSelectedChapter();
  app.state.quizHistory.push({
    chapterId,
    chapterTitle: chapter.title,
    mode: 'test',
    score: correct,
    total: questions.length,
    completedAt: new Date().toISOString(),
  });
  app.state.progress.chapters[chapterId] = {
    ...(app.state.progress.chapters[chapterId] || {}),
    read: true,
    quizCompleted: true,
    lastQuizScore: `${correct}/${questions.length}`,
    lastStudyAt: new Date().toISOString(),
  };
  app.state.trackProgress.textbook[chapterId] = {
    lastScore: `${correct}/${questions.length}`,
    completedAt: new Date().toISOString(),
  };
  updatePasslineProgress(chapterId);
  touchState();
}

function setPointStatus(pointId, status) {
  const chapter = findChapterByPointId(pointId);
  app.state.progress.points[pointId] = { status, lastViewedAt: new Date().toISOString() };
  app.state.progress.lastPointId = pointId;
  app.state.progress.lastChapterId = chapter?.id || app.state.progress.lastChapterId;
  if (chapter) {
    app.state.progress.chapters[chapter.id] = {
      ...(app.state.progress.chapters[chapter.id] || {}),
      read: true,
      lastStudyAt: new Date().toISOString(),
    };
    updatePasslineProgress(chapter.id);
  }
  touchState();
  renderView();
}

function markQuestionReview(question) {
  if (question.relatedTopicId) {
    app.state.progress.points[question.relatedTopicId] = { status: 'mastered', lastViewedAt: new Date().toISOString() };
  }
  if (question.chapterId) updatePasslineProgress(question.chapterId);
  touchState();
}

function recordWrongAnswer(question, userAnswer, correctAnswer) {
  const key = `${question.chapterId}-${question.id}`;
  const existing = app.state.wrongbook[key];
  app.state.wrongbook[key] = {
    id: key,
    questionId: question.id,
    chapterId: question.chapterId,
    chapterTitle: app.data.chapters.find((item) => item.id === question.chapterId)?.title || question.chapterId,
    stem: question.stem,
    type: question.type,
    teacherFocus: Boolean(question.teacherFocus),
    userAnswer,
    correctAnswer,
    explanation: question.explanation || '',
    relatedTopicId: question.relatedTopicId || null,
    relatedSimulatorId: question.relatedSimulatorId || null,
    wrongCount: (existing?.wrongCount || 0) + 1,
    lastWrongAt: new Date().toISOString(),
  };
  const weakness = app.state.chapterWeakness[question.chapterId] || {};
  weakness[question.sectionId] = (weakness[question.sectionId] || 0) + 1;
  app.state.chapterWeakness[question.chapterId] = weakness;
  touchState();
}

function getProgressStats() {
  const totalPoints = app.data.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.points)).length;
  const pointStates = Object.values(app.state.progress.points);
  const masteredPoints = pointStates.filter((item) => item.status === 'mastered').length;
  const reviewPoints = pointStates.filter((item) => item.status === 'review').length;
  return {
    totalPoints,
    masteredPoints,
    reviewPoints,
    percent: totalPoints ? Math.round((masteredPoints / totalPoints) * 100) : 0,
  };
}

function getChapterProgress(chapter) {
  const points = chapter.sections.flatMap((section) => section.points);
  const mastered = points.filter((point) => app.state.progress.points[point.id]?.status === 'mastered').length;
  return { total: points.length, mastered, percent: points.length ? Math.round((mastered / points.length) * 100) : 0 };
}

function getContinueChapter() {
  return app.data.chapters.find((chapter) => chapter.id === app.state.progress.lastChapterId) || app.data.chapters[0];
}

function getTrackChapter(track) {
  if (track === 'passline') {
    return app.data.chapters.find((chapter) => !getTrainingOverview(chapter.id).passlineReady) || app.data.chapters[0];
  }
  return getContinueChapter();
}

function getContinueLabel() {
  const chapter = getContinueChapter();
  const point = app.state.progress.lastPointId ? findPointById(app.state.progress.lastPointId) : null;
  return point ? `${chapter.title} · ${point.title}` : `${chapter.title} · 延续上次进度`;
}

function getDashboardNextAction() {
  const continueChapter = getContinueChapter();
  const passlineTarget = getTrackChapter('passline');
  const latestWrong = wrongbookEntries()[0];
  const firstSection = getQuizBundle(continueChapter.id)?.practiceSections?.[0];
  if (latestWrong) {
    return {
      title: `回看 ${latestWrong.chapterTitle} 的最近错题`,
      text: `你最近在 ${latestWrong.chapterTitle} 有错题，先把这几道题对应的知识点补明白，再去做新的综合测试会更稳。`,
      primaryAction: 'open-wrongbook',
      primaryChapterId: latestWrong.chapterId,
      primaryLabel: '回看最近错题',
      secondary: [
        { label: `先做第 ${passlineTarget.number} 章及格线题`, action: 'open-passline', chapterId: passlineTarget.id },
        { label: '刷老师题', action: 'open-teacher', chapterId: latestWrong.chapterId },
      ],
    };
  }
  return {
    title: `继续第 ${continueChapter.number} 章 · ${continueChapter.title}`,
    text: `先把当前章节的主干知识点读完，再接一轮短题量练习，最容易把今天的内容真正学进去。`,
    primaryAction: 'open-chapter',
    primaryChapterId: continueChapter.id,
    primaryLabel: '继续当前章节',
    secondary: [
      { label: `先做第 ${passlineTarget.number} 章及格线题`, action: 'open-passline', chapterId: passlineTarget.id },
      ...(firstSection ? [{ label: `做 ${firstSection.sectionTitle} 练习`, action: 'open-practice', chapterId: continueChapter.id, sectionId: firstSection.sectionId }] : []),
    ],
  };
}

function getRecommendation() {
  if (getWrongbookCount() > 0) {
    return {
      text: `当前推荐任务为错题回看。可先处理最近 ${Math.min(3, getWrongbookCount())} 道错题，再安排综合测试。`,
      actions: `<button class="btn primary" data-action="open-passline" data-chapter-id="${getTrackChapter('passline').id}">先补过线题</button><button class="btn subtle" data-action="switch-view" data-view="practice">进入错题复习</button>`,
    };
  }
  const passlineTarget = getTrackChapter('passline');
  return {
    text: `当前适合先拿下第 ${passlineTarget.number} 章的必会点，再回到教材学习轨把细节补完整。`,
    actions: `<button class="btn primary" data-action="open-passline" data-chapter-id="${passlineTarget.id}">开始过线练习</button><button class="btn subtle" data-action="open-chapter" data-chapter-id="${getContinueChapter().id}">进入章节学习</button>`,
  };
}

function getDailyPlan() {
  const continueChapter = getContinueChapter();
  const passlineTarget = getTrackChapter('passline');
  const latestWrong = wrongbookEntries()[0];
  const bundle = getQuizBundle(continueChapter.id);
  const firstSection = bundle?.practiceSections?.[0];
  return {
    kicker: latestWrong ? '先补错，再提分' : '先学主干，再做题',
    steps: [
      {
        tag: '看主干',
        title: `先看第 ${continueChapter.number} 章的必会点`,
        text: `从 ${continueChapter.title} 开始，把这一章的低门槛主干先扫清，别一上来全章硬啃。`,
        cta: '进入章节学习',
        action: 'open-chapter',
        chapterId: continueChapter.id,
        primary: true,
        tone: 'accent',
      },
      {
        tag: '做小测',
        title: latestWrong ? '再刷一轮过线题稳住基本盘' : '接着做一轮本章过线题',
        text: latestWrong
          ? `你现在还有错题待处理，先用第 ${passlineTarget.number} 章的过线题把基础分守住。`
          : `学完马上做题记得更牢，先用短题量检查自己有没有真的读懂。`,
        cta: '开始过线练习',
        action: 'open-passline',
        chapterId: passlineTarget.id,
        primary: false,
        tone: 'plain',
      },
      {
        tag: latestWrong ? '回错题' : '做验收',
        title: latestWrong ? '最后把最近错题回炉一遍' : '最后做一次小节练习验收',
        text: latestWrong
          ? `${latestWrong.chapterTitle} 里有最近错题，回看一次比继续堆新题更有效。`
          : `${firstSection?.sectionTitle || '本章第一节'} 适合当今天的收尾验收，看看自己有没有会而不熟。`,
        cta: latestWrong ? '去错题复习' : '做章节练习',
        action: latestWrong ? 'open-wrongbook' : 'open-practice',
        chapterId: latestWrong ? latestWrong.chapterId : continueChapter.id,
        sectionId: latestWrong ? undefined : firstSection?.sectionId,
        primary: false,
        tone: 'plain',
      },
    ],
  };
}

function getWeakChapters() {
  return app.data.chapters
    .map((chapter) => ({ ...chapter, progress: getChapterProgress(chapter) }))
    .sort((a, b) => a.progress.percent - b.progress.percent || a.number - b.number)
    .slice(0, 4);
}

function getTrainingOverview(chapterId) {
  const bundle = getQuizBundle(chapterId);
  const history = [...app.state.quizHistory].reverse().find((item) => item.chapterId === chapterId);
  const weakness = app.state.chapterWeakness[chapterId] || {};
  const weakSectionId = Object.entries(weakness).sort((a, b) => b[1] - a[1])[0]?.[0];
  const weakSection = bundle?.practiceSections?.find((item) => item.sectionId === weakSectionId)?.sectionTitle || '';
  const passline = getChapterPassline(app.data.chapters.find((item) => item.id === chapterId));
  return {
    lastScore: history ? `${history.score}/${history.total}` : '--',
    wrongCount: wrongbookEntries().filter((item) => item.chapterId === chapterId).length,
    practiceSectionCount: bundle?.practiceSections?.length || 0,
    weakSection,
    passlineReady: passline.readyTopics === passline.totalTopics || getPasslineScorePercent(chapterId) >= 60 || parseInt(app.state.lastPasslineScore[chapterId], 10) >= 60,
  };
}

function getStudyTime(chapter) {
  const points = chapter.sections.flatMap((section) => section.points).length;
  return `${Math.max(20, points * 6)} 分钟`;
}

function getPointConclusion(point) {
  return sanitizePointText(point.conclusion || point.tip || point.summary || point.title);
}

function getPointExcerpt(point) {
  return sanitizePointText(point.preview || '');
}

function sanitizePointText(text) {
  return String(text || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function stripLeadingDuplicate(detail, lead) {
  const escaped = lead.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = detail.replace(new RegExp(`^${escaped}[，。、；：:,.!！?？\\s-]*`), '').trim();
  return stripped || detail;
}

function firstMeaningfulSentence(text) {
  const normalized = sanitizePointText(text);
  if (!normalized) return '';
  const match = normalized.match(/^(.{8,80}?[。；;!！?？]|.{8,64})/);
  return match ? match[1].trim() : normalized;
}

function getConfusionHints(chapter, point) {
  const title = `${point.title}${point.summary}${point.detail}`;
  return chapter.confusions
    .map(([a, b]) => `${a} / ${b}`)
    .filter((item) => item.split(' / ').some((part) => title.includes(part)))
    .slice(0, 2);
}

function getSelectedSimulator() {
  return SIMULATORS.find((item) => item.id === app.state.selectedSimulatorId) || SIMULATORS[0];
}

function getWrongbookCount() { return Object.keys(app.state.wrongbook).length; }
function getSelectedChapter() { return app.data.chapters.find((chapter) => chapter.id === app.state.selectedChapterId) || app.data.chapters[0]; }
function getQuizBundle(chapterId) { return app.data.quizzes.find((item) => item.chapterId === chapterId); }
function getTeacherQuestionsByChapter(chapterId) {
  return app.data.teacherQuizzes.filter((question) => question.chapterId === chapterId);
}
function getTeacherQuickPresets(chapter) {
  return [
    {
      mode: 'random-5',
      label: '5 题快刷老师卷',
      description: '刚坐下学习时先来一小轮，快速热身，看看老师题的手感还在不在。',
      badge: '快刷卷',
      count: getTeacherPresetCount('random-5', chapter),
    },
    {
      mode: 'chapter-one',
      label: '只刷第 1 章老师题',
      description: '先把老师最早讲的概论和基础题型刷顺，适合零基础起步。',
      badge: '起步卷',
      count: getTeacherPresetCount('chapter-one', chapter),
    },
    {
      mode: 'fill-only',
      label: '只刷填空题',
      description: '专盯关键词、结论和固定表述，适合考前短时间记忆回补。',
      badge: '记忆卷',
      count: getTeacherPresetCount('fill-only', chapter),
    },
    {
      mode: 'rain-only',
      label: '只刷雨课堂原题',
      description: '只看老师课堂测验原题，不混课件题，更贴近平时出题口吻。',
      badge: '原题卷',
      count: getTeacherPresetCount('rain-only', chapter),
    },
    {
      mode: 'random-10',
      label: '10 题随机老师卷',
      description: '从老师题库里固定抽一轮 10 题，适合随时做一份小测。',
      badge: '随机卷',
      count: getTeacherPresetCount('random-10', chapter),
    },
    {
      mode: 'random-20',
      label: '20 题冲刺老师卷',
      description: '题量更完整，适合考前集中冲一轮，检验整体稳定度。',
      badge: '冲刺卷',
      count: getTeacherPresetCount('random-20', chapter),
    },
    {
      mode: 'wrong-only',
      label: '只刷我错过的老师题',
      description: '专门回炉做错过的老师题，把最容易反复丢分的点清掉。',
      badge: '回炉卷',
      count: getTeacherPresetCount('wrong-only', chapter),
    },
  ];
}
function getTeacherPresetCount(mode, chapter) {
  return getTeacherQuickModeQuestions(mode, chapter).length;
}
function getTeacherQuickModeQuestions(mode, chapter) {
  if (mode === 'random-5') {
    return app.data.teacherQuizzes.slice(0, Math.min(5, app.data.teacherQuizzes.length));
  }
  if (mode === 'chapter-one') {
    return app.data.teacherQuizzes.filter((question) => question.chapterId === 'ch1');
  }
  if (mode === 'fill-only') {
    return app.data.teacherQuizzes.filter((question) => question.type === 'fill');
  }
  if (mode === 'rain-only') {
    return app.data.teacherQuizzes.filter((question) => question.sourceType === 'rainclassroom');
  }
  if (mode === 'random-10') {
    return app.data.teacherQuizzes.slice(0, Math.min(10, app.data.teacherQuizzes.length));
  }
  if (mode === 'random-20') {
    return app.data.teacherQuizzes.slice(0, Math.min(20, app.data.teacherQuizzes.length));
  }
  if (mode === 'wrong-only') {
    return getTeacherWrongQuestions();
  }
  const currentChapterId = app.state.teacherChapterId !== 'all'
    ? app.state.teacherChapterId
    : app.state.selectedChapterId || chapter?.id;
  return app.data.teacherQuizzes.filter((question) => currentChapterId ? question.chapterId === currentChapterId : true);
}
function getTeacherBaseQuestions() {
  return app.data.teacherQuizzes.filter((question) => {
    if (app.state.teacherChapterId !== 'all' && question.chapterId !== app.state.teacherChapterId) return false;
    if (app.state.teacherSource !== 'all' && question.sourceId !== app.state.teacherSource) return false;
    if (app.state.teacherSourceType !== 'all' && question.sourceType !== app.state.teacherSourceType) return false;
    if (app.state.teacherType === 'single' && question.type !== 'single') return false;
    if (app.state.teacherType === 'fill' && question.type !== 'fill') return false;
    return true;
  });
}
function getFilteredTeacherQuestions() {
  const base = getTeacherBaseQuestions();
  if (['random-5', 'random-10', 'random-20'].includes(app.state.teacherQuickMode) && app.state.teacherRandomIds.length) {
    const idSet = new Set(app.state.teacherRandomIds);
    return base.filter((question) => idSet.has(question.id));
  }
  if (app.state.teacherQuickMode === 'wrong-only') {
    const wrongIdSet = new Set(getTeacherWrongQuestions().map((item) => item.id));
    return base.filter((question) => wrongIdSet.has(question.id));
  }
  return base;
}
function getTeacherStats() {
  const questions = app.data.teacherQuizzes;
  return {
    total: questions.length,
    chapters: new Set(questions.map((item) => item.chapterId)).size,
    sources: app.data.teacherSources.length,
    fills: questions.filter((item) => item.type === 'fill').length,
    rainclassroom: questions.filter((item) => item.sourceType === 'rainclassroom').length,
    courseware: questions.filter((item) => item.sourceType === 'courseware').length,
  };
}
function getTeacherQuickModeText(chapter, count) {
  const currentChapter = app.data.chapters.find((item) => item.id === app.state.teacherChapterId) || chapter;
  const labels = {
    'chapter-current': `当前锁定在 ${currentChapter.title} 的老师题，适合看完本章后直接刷老师原题表达。现在共 ${count} 题。`,
    'random-5': `当前是 5 题快刷卷，适合学习前热身或睡前快速过一轮。现在共 ${count} 题。`,
    'chapter-one': `当前只刷第 1 章老师题，适合零基础先把老师最早讲过的系统概论题型吃透。现在共 ${count} 题。`,
    'fill-only': `当前只刷老师填空题，适合考前补关键词、公式结果和固定表述。现在共 ${count} 题。`,
    'rain-only': `当前只刷雨课堂原题，不混课件题，更贴近你老师平时发测验的出题口吻。现在共 ${count} 题。`,
    'random-10': `当前是 10 题随机老师卷，这一轮会固定住，不会刷新一下就乱跳。现在共 ${count} 题。`,
    'random-20': `当前是 20 题冲刺卷，适合正式模拟一轮老师题强度。现在共 ${count} 题。`,
    'wrong-only': `当前只刷你做错过的老师题，优先把老师重复强调过但你还会错的地方打掉。现在共 ${count} 题。`,
    custom: `你现在在自定义筛选老师题。这里只显示老师题，不混普通题库。做错后照样会进入错题本，也能回知识点继续补。`,
  };
  return labels[app.state.teacherQuickMode] || labels.custom;
}
function getTeacherSelectionStats(questions) {
  const wrongIds = new Set(getTeacherWrongQuestions().map((item) => item.id));
  return {
    singleCount: questions.filter((item) => item.type === 'single').length,
    fillCount: questions.filter((item) => item.type === 'fill').length,
    chapterCount: new Set(questions.map((item) => item.chapterId)).size,
    wrongCount: questions.filter((item) => wrongIds.has(item.id)).length,
  };
}
function getTeacherSourceSummary() {
  if (app.state.teacherSource !== 'all') {
    return app.data.teacherSources.find((item) => item.id === app.state.teacherSource)?.label || '指定来源';
  }
  if (app.state.teacherQuickMode === 'rain-only') return '仅雨课堂';
  if (app.state.teacherType === 'fill') return '填空题筛选';
  return '全部来源';
}
function isTeacherRandomMode() {
  return ['random-5', 'random-10', 'random-20'].includes(app.state.teacherQuickMode);
}
function getTeacherActivePaperTitle(chapter) {
  if (app.state.teacherQuickMode === 'chapter-current') {
    const currentChapter = app.data.chapters.find((item) => item.id === app.state.teacherChapterId) || chapter;
    return `${currentChapter.title} · 当前章老师题`;
  }
  if (app.state.teacherQuickMode === 'custom') {
    return '自定义老师题筛选';
  }
  return getTeacherQuickPresets(chapter).find((item) => item.mode === app.state.teacherQuickMode)?.label || '老师题小卷';
}
function getTeacherQuestionMeta(question) {
  const chapter = app.data.chapters.find((item) => item.id === question.chapterId);
  const source = app.data.teacherSources.find((item) => item.id === question.sourceId);
  const parts = [
    chapter ? `第 ${chapter.number} 章` : '',
    question.sectionTitle || '',
    source?.label || '',
  ].filter(Boolean);
  return parts.map((item) => `<span>${item}</span>`).join('');
}
function getTeacherWrongQuestions() {
  const teacherIdSet = new Set(
    wrongbookEntries()
      .filter((item) => item.teacherFocus || String(item.questionId || '').startsWith('teacher-'))
      .map((item) => teacherQuestionIdFromWrong(item))
      .filter(Boolean),
  );
  return app.data.teacherQuizzes.filter((question) => teacherIdSet.has(question.id));
}
function renderTeacherEmptyState() {
  if (app.state.teacherQuickMode === 'wrong-only') {
    return `
      <div class="empty-state teacher-empty-state">
        <strong>你还没有老师题错题记录</strong>
        <p>先刷一套老师题，做错的题会自动进入这里，后面就能直接回炉重做。</p>
        <div class="action-row">
          <button class="btn tiny primary" data-action="set-teacher-quick-mode" data-mode="random-5">先来 5 题快刷</button>
          <button class="btn tiny subtle" data-action="set-teacher-quick-mode" data-mode="chapter-current">回到当前章老师题</button>
        </div>
      </div>
    `;
  }
  return `
    <div class="empty-state teacher-empty-state">
      <strong>当前筛选下还没有题目</strong>
      <p>可以切回当前章老师题，或者放宽来源和题型筛选再看。</p>
      <div class="action-row">
        <button class="btn tiny primary" data-action="set-teacher-quick-mode" data-mode="chapter-current">回到当前章老师题</button>
        <button class="btn tiny subtle" data-action="set-teacher-quick-mode" data-mode="rain-only">只刷雨课堂原题</button>
      </div>
    </div>
  `;
}
function teacherQuestionIdFromWrong(item) {
  if (String(item.questionId || '').startsWith('teacher-')) return item.questionId;
  const prefix = `${item.chapterId}-`;
  const maybeId = item.id?.startsWith(prefix) ? item.id.slice(prefix.length) : null;
  return String(maybeId || '').startsWith('teacher-') ? maybeId : null;
}
function applyTeacherQuickMode(mode) {
  app.state.teacherSource = 'all';
  app.state.teacherSourceType = 'all';
  app.state.teacherType = 'all';
  app.state.teacherRandomIds = [];
  if (mode === 'random-5') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    app.state.teacherRandomIds = getRandomTeacherIds(5);
    return;
  }
  if (mode === 'chapter-one') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'ch1';
    app.state.selectedChapterId = 'ch1';
    return;
  }
  if (mode === 'fill-only') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    app.state.teacherType = 'fill';
    return;
  }
  if (mode === 'rain-only') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    app.state.teacherSourceType = 'rainclassroom';
    return;
  }
  if (mode === 'random-10') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    app.state.teacherRandomIds = getRandomTeacherIds(10);
    return;
  }
  if (mode === 'random-20') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    app.state.teacherRandomIds = getRandomTeacherIds(20);
    return;
  }
  if (mode === 'wrong-only') {
    app.state.teacherQuickMode = mode;
    app.state.teacherChapterId = 'all';
    return;
  }
  app.state.teacherQuickMode = 'chapter-current';
  app.state.teacherChapterId = app.state.selectedChapterId || 'all';
}
function getRandomTeacherIds(size) {
  const pool = [...app.data.teacherQuizzes];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(size, pool.length)).map((item) => item.id);
}
function getSelectedPracticeSection(chapter, bundle) {
  return bundle.practiceSections.find((item) => item.sectionId === app.state.selectedSectionId) || bundle.practiceSections[0];
}
function getPracticeQuestions() {
  if (app.state.practiceMode === 'teacher') return getFilteredTeacherQuestions();
  if (app.state.practiceMode === 'passline') return getPasslineQuestionSet(getSelectedChapter().id);
  return getSelectedPracticeSection(getSelectedChapter(), getQuizBundle(getSelectedChapter().id)).questions;
}
function getChapterTestQuestions(chapterId) { return getQuizBundle(chapterId)?.chapterTest || []; }
function findChapterByPointId(pointId) {
  return app.data.chapters.find((chapter) => chapter.sections.some((section) => section.points.some((point) => point.id === pointId)));
}
function findPointById(pointId) {
  for (const chapter of app.data.chapters) {
    for (const section of chapter.sections) {
      const point = section.points.find((entry) => entry.id === pointId);
      if (point) return point;
    }
  }
  return null;
}
function isAnswerCorrect(question, answer) {
  if (question.type === 'single') return answer === question.answerIndex;
  if (question.type === 'judge') return answer === question.answer;
  const accepted = Array.isArray(question.acceptedAnswers) ? question.acceptedAnswers : [question.answer];
  return accepted.some((item) => normalizeText(answer) === normalizeText(item));
}
function correctAnswerFor(question) { return question.type === 'single' ? question.answerIndex : question.answer; }
function formatAnswer(question, answer) {
  if (answer === undefined || answer === null || answer === '') return '未作答';
  if (question.type === 'single') return String.fromCharCode(65 + Number(answer));
  if (question.type === 'judge') return answer ? '正确' : '错误';
  return String(answer);
}
function wrongbookEntries() {
  return Object.values(app.state.wrongbook).sort((a, b) => new Date(b.lastWrongAt || 0) - new Date(a.lastWrongAt || 0));
}
function resetPracticeSession() {
  app.session.practiceAnswers = {};
  app.session.practiceFeedback = {};
  app.session.testAnswers = {};
  app.session.testSubmitted = false;
}
function statusLabel(status) { return ({ unseen: '未标记', mastered: '已掌握', review: '待复习' })[status] || '未标记'; }
function formatDate(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}
function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[，、；]/g, ';')
    .replace(/\s+/g, '')
    .replace(/[（）()]/g, '');
}
function safeParse(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
function persistState() {}
function persistAuthState() {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({
      token: app.auth.token,
      user: app.auth.user,
      generated: app.auth.generated,
    }),
  );
}

function loadAuthState() {
  const authSaved = safeParse(localStorage.getItem(AUTH_STORAGE_KEY));
  app.auth.token = authSaved?.token || null;
  app.auth.user = authSaved?.user || null;
  app.auth.generated = authSaved?.generated || null;
  app.auth.syncStatus = app.auth.user ? 'syncing' : 'local-only';
  app.auth.lastSyncedAt = null;
  app.auth.pendingChanges = false;
  app.syncMeta.pending = false;
  app.syncMeta.lastSuccessfulStateAt = null;
  app.syncMeta.lastAttemptAt = null;
}

async function restoreRemoteSession() {
  clearLegacyLocalProgress();
  if (!app.auth.token) {
    app.auth.syncStatus = 'local-only';
    return;
  }
  try {
    app.auth.syncStatus = 'syncing';
    const me = await apiFetch('/api/me');
    app.auth.user = me.user;
    const remote = await apiFetch('/api/progress');
    applySyncedState(remote.state);
    app.auth.lastSyncedAt = remote.meta?.updatedAt || nowIso();
    app.auth.syncStatus = 'synced';
    app.auth.pendingChanges = false;
    app.syncMeta.pending = false;
    app.syncMeta.lastSuccessfulStateAt = app.state.meta.updatedAt;
  } catch (error) {
    app.auth.syncStatus = 'sync-error';
    app.auth.error = '';
    console.error(error);
  }
}

function serializeProgressState() {
  return {
    view: app.state.view,
    activeTrack: app.state.activeTrack,
    mobileSidebarOpen: false,
    selectedChapterId: app.state.selectedChapterId,
    selectedSectionId: app.state.selectedSectionId,
    selectedSimulatorId: app.state.selectedSimulatorId,
    teacherChapterId: app.state.teacherChapterId,
    teacherSource: app.state.teacherSource,
    teacherSourceType: app.state.teacherSourceType,
    teacherType: app.state.teacherType,
    teacherQuickMode: app.state.teacherQuickMode,
    teacherRandomIds: cloneData(app.state.teacherRandomIds),
    practiceMode: app.state.practiceMode,
    progress: cloneData(app.state.progress),
    quizHistory: cloneData(app.state.quizHistory),
    wrongbook: cloneData(app.state.wrongbook),
    trackProgress: cloneData(app.state.trackProgress),
    chapterWeakness: cloneData(app.state.chapterWeakness),
    lastPasslineScore: cloneData(app.state.lastPasslineScore),
    meta: cloneData(app.state.meta),
  };
}

function applySyncedState(nextState) {
  const defaults = createDefaultState(app.data.chapters);
  const incoming = nextState || {};
  app.state = {
    ...defaults,
    ...incoming,
    progress: {
      ...defaults.progress,
      ...(incoming.progress || {}),
      points: { ...defaults.progress.points, ...(incoming.progress?.points || {}) },
      chapters: { ...defaults.progress.chapters, ...(incoming.progress?.chapters || {}) },
    },
    wrongbook: { ...(incoming.wrongbook || {}) },
    trackProgress: {
      textbook: { ...(incoming.trackProgress?.textbook || {}) },
      passline: { ...(incoming.trackProgress?.passline || {}) },
    },
    chapterWeakness: { ...(incoming.chapterWeakness || {}) },
    lastPasslineScore: { ...(incoming.lastPasslineScore || {}) },
    quizHistory: Array.isArray(incoming.quizHistory) ? incoming.quizHistory : [],
    view: incoming.view === 'teacher' ? 'practice' : (incoming.view || defaults.view),
    teacherChapterId: incoming.teacherChapterId || defaults.teacherChapterId,
    teacherSource: incoming.teacherSource || defaults.teacherSource,
    teacherSourceType: incoming.teacherSourceType || defaults.teacherSourceType,
    teacherType: incoming.teacherType || defaults.teacherType,
    teacherQuickMode: incoming.teacherQuickMode || defaults.teacherQuickMode,
    teacherRandomIds: Array.isArray(incoming.teacherRandomIds) ? incoming.teacherRandomIds : defaults.teacherRandomIds,
    practiceMode: incoming.view === 'teacher' ? 'teacher' : (incoming.practiceMode || defaults.practiceMode),
    meta: { updatedAt: incoming.meta?.updatedAt || defaults.meta.updatedAt },
  };
}

function touchState() {
  app.state.meta.updatedAt = nowIso();
  if (app.runtime.syncReady && app.auth.user) {
    app.auth.pendingChanges = true;
    app.auth.syncStatus = 'pending';
    app.syncMeta.pending = true;
    scheduleSync();
  }
}

function scheduleSync() {
  if (!app.auth.user || !app.runtime.syncReady) return;
  clearTimeout(app.runtime.syncTimer);
  app.runtime.syncTimer = setTimeout(() => {
    flushSyncNow(false);
  }, 1200);
}

async function flushSyncNow(manual) {
  if (!app.auth.user) return;
  try {
    app.auth.syncStatus = 'syncing';
    app.syncMeta.lastAttemptAt = nowIso();
    renderView();
    const result = await apiFetch('/api/progress', {
      method: 'PUT',
      body: JSON.stringify({ state: serializeProgressState() }),
    });
    applySyncedState(result.state);
    app.auth.lastSyncedAt = result.meta?.updatedAt || nowIso();
    app.auth.syncStatus = 'synced';
    app.auth.pendingChanges = false;
    app.syncMeta.pending = false;
    app.syncMeta.lastSuccessfulStateAt = app.state.meta.updatedAt;
    renderView();
  } catch (error) {
    console.error(error);
    app.auth.syncStatus = 'sync-error';
    app.auth.pendingChanges = true;
    app.syncMeta.pending = true;
    renderView();
  }
}

function flushSyncOnLeave() {
  if (!app.auth.user || !app.auth.pendingChanges) return;
  fetch('/api/progress', {
    method: 'PUT',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${app.auth.token}`,
    },
    body: JSON.stringify({ state: serializeProgressState() }),
  }).catch(() => {});
}

async function handleRegister() {
  await submitAuth('/api/auth/register');
}

async function handleAutoRegister() {
  await submitAuth('/api/auth/register-auto', true);
}

async function handleLogin() {
  await submitAuth('/api/auth/login');
}

async function submitAuth(path, auto = false) {
  try {
    app.auth.error = '';
    app.auth.syncStatus = 'syncing';
    renderView();
    const payload = auto ? {} : {
      username: app.session.authDraft.username.trim(),
      password: app.session.authDraft.password,
    };
    const result = await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) }, false);
    app.auth.token = result.token;
    app.auth.user = result.user;
    app.auth.generated = result.generated || app.auth.generated;
    if (result.generated) {
      app.session.authDraft.username = result.generated.username;
      app.session.authDraft.password = result.generated.password;
    }
    clearLegacyLocalProgress();
    const remote = await apiFetch('/api/progress');
    applySyncedState(remote.state);
    app.auth.lastSyncedAt = remote.meta?.updatedAt || nowIso();
    app.auth.syncStatus = 'synced';
    app.auth.pendingChanges = false;
    app.syncMeta.pending = false;
    app.auth.modalMode = 'account';
    app.auth.modalOpen = true;
    renderView();
  } catch (error) {
    app.auth.syncStatus = app.auth.user ? 'sync-error' : 'local-only';
    app.auth.error = error.message || '操作失败';
    renderView();
  }
}

async function handleLogout() {
  try {
    if (app.auth.token) {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    }
  } catch (error) {
    console.error(error);
  }
  app.auth.token = null;
  app.auth.user = null;
  app.auth.syncStatus = 'local-only';
  app.auth.lastSyncedAt = null;
  app.auth.pendingChanges = false;
  app.auth.modalOpen = false;
  app.auth.error = '';
  app.auth.generated = null;
  app.syncMeta.pending = false;
  app.state = createDefaultState(app.data.chapters);
  app.session.authDraft.username = '';
  app.session.authDraft.password = '';
  clearLegacyLocalProgress();
  renderView();
}

async function handleResetProgress() {
  if (!app.auth.user) return;
  const ok = window.confirm('确定要重置这个账号中的全部学习进度吗？重置后不能恢复。');
  if (!ok) return;
  try {
    app.auth.syncStatus = 'syncing';
    app.auth.error = '';
    renderView();
    const result = await apiFetch('/api/progress/reset', { method: 'POST' });
    clearLegacyLocalProgress();
    applySyncedState(result.state);
    app.auth.lastSyncedAt = result.meta?.updatedAt || nowIso();
    app.auth.syncStatus = 'synced';
    app.auth.pendingChanges = false;
    app.syncMeta.pending = false;
    app.syncMeta.lastSuccessfulStateAt = app.state.meta.updatedAt;
    app.state.view = 'dashboard';
    app.auth.modalMode = 'account';
    renderView();
  } catch (error) {
    console.error(error);
    app.auth.syncStatus = 'sync-error';
    app.auth.error = error.message || '重置失败';
    renderView();
  }
}

function clearLegacyLocalProgress() {
  localStorage.removeItem(LEGACY_PROGRESS_KEY);
  localStorage.removeItem(LEGACY_WRONG_KEY);
}

async function copyGeneratedCredentials() {
  if (!app.auth.generated) return;
  const text = `账号：${app.auth.generated.username}\n密码：${app.auth.generated.password}`;
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    console.error(error);
  }
}

async function apiFetch(path, options = {}, requireAuth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (app.auth.token) headers.Authorization = `Bearer ${app.auth.token}`;
  const response = await fetch(path, { ...options, headers });
  if (response.status === 401 && requireAuth) {
    app.auth.token = null;
    app.auth.user = null;
    app.auth.syncStatus = 'local-only';
    throw new Error('登录状态已失效，请重新登录');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `请求失败 (${response.status})`);
  }
  return data;
}

function syncStatusLabel() {
  return ({
    'local-only': '未登录，当前浏览不留学习档案',
    pending: '有未同步变更',
    syncing: '同步中',
    synced: '已同步',
    'sync-error': '同步失败',
  })[app.auth.syncStatus] || '未同步';
}

function nowIso() {
  return new Date().toISOString();
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function derivePointConclusion(point) {
  const tip = sanitizePointText(point.tip || '');
  const summary = sanitizePointText(point.summary || '');
  if (tip && tip.length <= 30) return tip;
  if (summary && summary.length <= 34) return summary;
  const sentence = firstMeaningfulSentence(stripMnemonicLead(summary || point.detail || point.title));
  return sentence.length > 34 ? `${sentence.slice(0, 34)}...` : sentence;
}

function derivePointPreview(point, conclusion) {
  const summary = sanitizePointText(stripMnemonicLead(point.summary || ''));
  const detail = sanitizePointText(cleanLeadText(stripLeadingDuplicate(point.detail || '', conclusion)));
  const source = summary && summary !== conclusion ? summary : detail;
  if (!source || source === conclusion) return '';
  const sentences = source.split(/[。！？!?；;]/).map((item) => item.trim()).filter(Boolean);
  return sentences.slice(0, 2).join('，').slice(0, 72);
}

function derivePointPitfall(point, chapter) {
  const tip = sanitizePointText(stripMnemonicLead(point.tip || ''));
  if (tip && tip !== getPointConclusion(point)) return tip;
  const confusion = getConfusionHints(chapter, point)[0];
  if (confusion) return `别和 ${confusion} 混在一起，做题时先看定义、作用和适用条件。`;
  return '做题时先抓“定义是什么、解决什么问题、和谁最容易混”这三件事。';
}

function stripMnemonicLead(text) {
  return sanitizePointText(String(text || '').replace(/^口诀[:：]\s*/, ''));
}

function cleanLeadText(text) {
  const normalized = sanitizePointText(text);
  return normalized.replace(/^[，。、；：:()\-\s]+/, '');
}

function getChapterCardSummary(chapter) {
  const source = cleanLeadText(chapter.summary || '');
  const firstSentence = firstMeaningfulSentence(source);
  const compact = firstSentence || source || chapter.title;
  return compact.length <= 36 ? compact : `${compact.slice(0, 34)}...`;
}

function getChapterPassline(chapter) {
  const points = chapter.sections.flatMap((section) => section.points).filter((point) => chapter.passlineTopics.includes(point.id));
  const readyTopics = points.filter((point) => app.state?.progress?.points?.[point.id]?.status === 'mastered').length;
  return { points, readyTopics, totalTopics: points.length };
}

function getPasslineQuestionSet(chapterId) {
  const bundle = getQuizBundle(chapterId);
  if (!bundle) return [];
  const merged = [
    ...bundle.practiceSections.flatMap((section) => section.questions),
    ...bundle.chapterTest,
  ].filter((question) => question.isPassline);
  return dedupeQuestions(merged).slice(0, 8);
}

function dedupeQuestions(questions) {
  const seen = new Set();
  return questions.filter((question) => {
    const key = `${question.sectionId}-${question.stem}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function updatePasslineProgress(chapterId) {
  const chapter = app.data?.chapters?.find((item) => item.id === chapterId);
  if (!chapter) return;
  const passline = getChapterPassline(chapter);
  const score = getPasslineScorePercent(chapterId);
  app.state.trackProgress.passline[chapterId] = {
    readyTopics: passline.readyTopics,
    totalTopics: passline.totalTopics,
    updatedAt: new Date().toISOString(),
  };
  app.state.lastPasslineScore[chapterId] = score ? `${score}%` : app.state.lastPasslineScore[chapterId] || '--';
}

function getPasslineScorePercent(chapterId) {
  const questions = getPasslineQuestionSet(chapterId);
  if (!questions.length) return 0;
  const answers = app.session.practiceAnswers;
  const scored = questions.filter((question) => answers[question.id] !== undefined);
  if (!scored.length) return 0;
  const correct = scored.filter((question) => isAnswerCorrect(question, answers[question.id])).length;
  return Math.round((correct / scored.length) * 100);
}

function getPasslineOverview() {
  const chapters = app.data.chapters.filter((chapter) => chapter.isEssentialChapter);
  const chapterCards = chapters.map((chapter) => {
    const passline = getChapterPassline(chapter);
    const score = app.state.lastPasslineScore[chapter.id] || '--';
    const ready = passline.readyTopics === passline.totalTopics || parseInt(score, 10) >= 60;
    return {
      id: chapter.id,
      number: chapter.number,
      title: chapter.title,
      readyTopics: passline.readyTopics,
      totalTopics: passline.totalTopics,
      lastScore: score,
      statusText: ready ? '当前已达到基础过线要求' : '还需要继续补基础题和核心概念',
      ready,
    };
  });
  const totalTopics = chapterCards.reduce((sum, item) => sum + item.totalTopics, 0);
  const readyTopics = chapterCards.reduce((sum, item) => sum + item.readyTopics, 0);
  return {
    chapterCards,
    targetChapters: chapters.length,
    completedChapters: chapterCards.filter((item) => item.ready).length,
    totalTopics,
    readyTopics,
    percent: totalTopics ? Math.round((readyTopics / totalTopics) * 100) : 0,
  };
}

function groupSectionPoints(section) {
  const groups = [
    ['essential', '基础必会', '先把定义、规律和常见出题点看懂。'],
    ['standard', '进阶理解', '在主干之外，把原理和条件补完整。'],
    ['advanced', '易错混淆', '这里最容易在选择题和简答题里掉分。'],
  ];
  return groups
    .map(([key, label, description]) => ({ key, label, description, points: section.points.filter((point) => point.importance === key) }))
    .filter((group) => group.points.length);
}

function getSectionSnapshot(grouped) {
  const essentialGroup = grouped.find((group) => group.key === 'essential');
  const standardGroup = grouped.find((group) => group.key === 'standard');
  const advancedGroup = grouped.find((group) => group.key === 'advanced');
  return {
    essential: essentialGroup ? `${essentialGroup.points.length} 个基础点` : '先抓定义',
    essentialHint: essentialGroup
      ? `${essentialGroup.points.slice(0, 2).map((point) => point.title).join(' / ')}`
      : '先把这一节最容易考的定义和规律盯住。',
    standard: standardGroup ? `${standardGroup.points.length} 个理解点` : '补主干逻辑',
    standardHint: standardGroup
      ? `${standardGroup.points.slice(0, 2).map((point) => point.title).join(' / ')}`
      : '顺着主线把为什么这样补完整。',
    review: advancedGroup ? `${advancedGroup.points.length} 个易混点` : '对比着记',
    reviewHint: advancedGroup
      ? `${advancedGroup.points.slice(0, 2).map((point) => point.title).join(' / ')}`
      : '把相近概念摆在一起看，会更不容易混。',
  };
}
