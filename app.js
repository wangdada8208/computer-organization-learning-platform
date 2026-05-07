import { SIMULATORS, mountSimulator } from './simulators.js';

const STORAGE_KEY = 'coa.v2.state';
const LEGACY_PROGRESS_KEY = 'coa_p';
const LEGACY_WRONG_KEY = 'coa_wrong';

const appShellEl = document.querySelector('.app-shell');
const sidebarEl = document.getElementById('sidebar');
const topbarEl = document.getElementById('topbar');
const pageEl = document.getElementById('page');

const PRIMARY_VIEWS = ['dashboard', 'chapter', 'practice'];
const PRACTICE_MODES = ['section', 'test', 'wrongbook', 'simulator'];
const SIMULATOR_GROUPS = [
  { label: '数值与编码', ids: ['sim-base', 'sim-complement', 'sim-float'] },
  { label: '处理器执行', ids: ['sim-pipeline', 'sim-fetch'] },
  { label: '存储层次', ids: ['sim-cache'] },
];

const app = {
  data: null,
  state: null,
  session: {
    practiceAnswers: {},
    practiceFeedback: {},
    testAnswers: {},
    testSubmitted: false,
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
    const [chapters, quizzes] = await Promise.all([
      fetchJson('./data/chapters.json'),
      fetchJson('./data/quizzes.json'),
    ]);
    app.data = { chapters, quizzes };
    app.state = buildInitialState(chapters, quizzes);
    renderView();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
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
  const saved = safeParse(localStorage.getItem(STORAGE_KEY));
  const defaults = {
    view: 'dashboard',
    mobileSidebarOpen: false,
    selectedChapterId: chapters[0]?.id || null,
    selectedSectionId: chapters[0]?.sections[0]?.id || null,
    selectedSimulatorId: SIMULATORS[0]?.id || null,
    practiceMode: 'section',
    progress: { points: {}, chapters: {}, lastChapterId: chapters[0]?.id || null, lastPointId: null },
    quizHistory: [],
    wrongbook: {},
  };
  const state = { ...defaults, ...saved };
  state.progress = { ...defaults.progress, ...(saved?.progress || {}) };
  state.progress.points = { ...(saved?.progress?.points || {}) };
  state.progress.chapters = { ...(saved?.progress?.chapters || {}) };
  state.quizHistory = Array.isArray(saved?.quizHistory) ? saved.quizHistory : [];
  state.wrongbook = saved?.wrongbook || {};
  migrateLegacyState(state, chapters, quizzes);
  if (!PRIMARY_VIEWS.includes(state.view)) {
    state.view = state.view === 'simulators' ? 'practice' : 'dashboard';
  }
  if (!PRACTICE_MODES.includes(state.practiceMode)) {
    state.practiceMode = state.view === 'simulators' ? 'simulator' : 'section';
  }
  if (saved?.view === 'archive') state.view = 'dashboard';
  if (saved?.view === 'simulators') {
    state.view = 'practice';
    state.practiceMode = 'simulator';
  }
  return state;
}

function migrateLegacyState(state, chapters, quizzes) {
  const legacyProgress = safeParse(localStorage.getItem(LEGACY_PROGRESS_KEY));
  const legacyWrongs = safeParse(localStorage.getItem(LEGACY_WRONG_KEY));
  if (legacyProgress && Object.keys(state.progress.chapters).length === 0) {
    Object.entries(legacyProgress).forEach(([chapterId, flags]) => {
      state.progress.chapters[chapterId] = {
        read: Boolean(flags?.read),
        quizCompleted: Boolean(flags?.quiz),
        lastQuizScore: null,
        lastStudyAt: null,
      };
      if (flags?.read) {
        const chapter = chapters.find((item) => item.id === chapterId);
        chapter?.sections.forEach((section) => section.points.forEach((point) => {
          state.progress.points[point.id] = { status: 'mastered', lastViewedAt: null };
        }));
      }
    });
  }
  if (Array.isArray(legacyWrongs) && Object.keys(state.wrongbook).length === 0) {
    legacyWrongs.forEach((item, index) => {
      const chapter = chapters.find((entry) => entry.id === item.ch);
      const firstPoint = chapter?.sections[0]?.points[0];
      const id = `${item.ch}-${index + 1}`;
      state.wrongbook[id] = {
        id,
        chapterId: item.ch,
        chapterTitle: chapter?.title || item.ch,
        stem: item.question,
        type: item.type || 'single',
        userAnswer: item.userAns,
        correctAnswer: item.correctAns,
        explanation: item.exp || '',
        relatedTopicId: firstPoint?.id || null,
        relatedSimulatorId: firstPoint?.relatedSimulatorIds?.[0] || quizzes.find((q) => q.chapterId === item.ch)?.chapterTest?.[0]?.relatedSimulatorId || null,
        wrongCount: 1,
        lastWrongAt: item.time || null,
      };
    });
  }
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
  persistState();
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
    dashboard: ['学习总览', '汇总学习进度、训练记录与推荐任务。'],
    chapter: ['章节学习', '按导览、知识点、整理、训练的顺序稳定推进。'],
    practice: ['训练强化', '在同一页完成章节练习、综合测试、错题复习和模拟器强化。'],
  };
  const [title, subtitle] = titleMap[app.state.view];
  topbarEl.innerHTML = `
    <div class="topbar-left">
      <button class="icon-btn mobile-toggle" data-action="toggle-sidebar" aria-label="打开目录">目录</button>
      <div>
        <div class="eyebrow">计算机组成原理学习平台</div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
    </div>
    <nav class="primary-tabs" aria-label="主导航">
      ${[['dashboard', '学习总览'], ['chapter', '章节学习'], ['practice', '训练强化']]
        .map(([view, label]) => `<button class="primary-tab ${app.state.view === view ? 'active' : ''}" data-action="switch-view" data-view="${view}">${label}</button>`).join('')}
    </nav>
  `;
}

function renderDashboard() {
  const stats = getProgressStats();
  const continueChapter = getContinueChapter();
  const recommendation = getRecommendation();
  const history = [...app.state.quizHistory].reverse().slice(0, 5);
  const weakChapters = getWeakChapters();
  const recentWrongs = wrongbookEntries().slice(0, 4);
  pageEl.innerHTML = `
    <div class="overview-stack">
      <section class="overview-hero">
        <div class="hero-copy">
          <span class="eyebrow">学习工作台</span>
          <h3 class="hero-title">聚焦下一步任务，让学习持续稳定推进。</h3>
          <p class="body-copy">首页集中展示学习进度、训练记录与推荐任务，用更短路径回到学习节奏。</p>
          <div class="action-row">
            <button class="btn primary" data-action="open-chapter" data-chapter-id="${continueChapter.id}">继续学习 ${continueChapter.title}</button>
            <button class="btn subtle" data-action="switch-view" data-view="practice">进入训练强化</button>
          </div>
        </div>
        <div class="hero-side surface-panel compact-panel">
          <div class="metric-grid single-column">
            <div class="metric-card"><span>总体掌握度</span><strong>${stats.percent}%</strong></div>
            <div class="metric-card"><span>待回看错题</span><strong>${getWrongbookCount()}</strong></div>
            <div class="metric-card"><span>最近测试记录</span><strong>${app.state.quizHistory.length}</strong></div>
          </div>
        </div>
      </section>

      <section class="workspace-grid">
        <article class="surface-panel emphasis-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">继续学习</span>
              <h3>${getContinueLabel()}</h3>
            </div>
            <span class="soft-badge">推荐下一步</span>
          </div>
          <p class="body-copy">${recommendation.text}</p>
          <div class="action-row">${recommendation.actions}</div>
        </article>

        <article class="surface-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">最近训练</span>
              <h3>把成绩和错题放在一起看</h3>
            </div>
          </div>
          ${history.length ? `<div class="timeline-list">${history.map((item) => `<div class="timeline-item"><strong>${item.chapterTitle}</strong><span>${item.mode === 'test' ? '综合测试' : '练习'} · ${item.score}/${item.total}</span><small>${formatDate(item.completedAt)}</small></div>`).join('')}</div>` : '<div class="empty-state">暂时还没有测试记录，可从任一章节开始综合测试，逐步形成训练记录。</div>'}
        </article>

        <article class="surface-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">薄弱章节</span>
              <h3>优先修最容易失分的地方</h3>
            </div>
          </div>
          <div class="dense-list">
            ${weakChapters.map((chapter) => `<button class="dense-row" data-action="open-chapter" data-chapter-id="${chapter.id}"><div><strong>第 ${chapter.number} 章 · ${chapter.title}</strong><span>${chapter.progress.mastered}/${chapter.progress.total} 已掌握</span></div><em>${chapter.progress.percent}%</em></button>`).join('')}
          </div>
        </article>
      </section>

      <section class="surface-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">错题摘要</span>
            <h3>需要回看的概念与对应入口</h3>
          </div>
          <button class="text-link" data-action="switch-view" data-view="practice">去训练强化</button>
        </div>
        ${recentWrongs.length ? `<div class="wrong-grid">${recentWrongs.map((item) => `<article class="wrong-card"><strong>${item.chapterTitle}</strong><p>${item.stem}</p><div class="wrong-meta">错 ${item.wrongCount} 次 · ${formatDate(item.lastWrongAt)}</div><div class="action-row small">${item.relatedTopicId ? `<button class="btn tiny primary" data-action="review-topic" data-topic-id="${item.relatedTopicId}" data-chapter-id="${item.chapterId}">回到知识点</button>` : ''}${item.relatedSimulatorId ? `<button class="btn tiny subtle" data-action="open-simulator" data-simulator-id="${item.relatedSimulatorId}">打开模拟器</button>` : ''}</div></article>`).join('')}</div>` : '<div class="empty-state">暂时还没有错题记录，可进入章节练习或综合测试建立复习清单。</div>'}
      </section>

      <section class="surface-panel">
        <div class="section-heading">
          <div>
            <span class="eyebrow">章节学习</span>
            <h3>按章节切入，不必先想模式</h3>
          </div>
        </div>
        <div class="chapter-overview-grid">${app.data.chapters.map(renderChapterOverviewCard).join('')}</div>
      </section>
    </div>
  `;
}

function renderChapterOverviewCard(chapter) {
  const progress = getChapterProgress(chapter);
  return `
    <article class="chapter-overview-card">
      <div class="chapter-card-head">
        <div>
          <span class="eyebrow">第 ${chapter.number} 章</span>
          <h4>${chapter.title}</h4>
        </div>
        <span class="soft-badge">${progress.percent}%</span>
      </div>
      <p class="body-copy">${chapter.summary}</p>
      <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
      <div class="card-actions">
        <button class="btn tiny primary" data-action="open-chapter" data-chapter-id="${chapter.id}">进入章节</button>
        <button class="btn tiny subtle" data-action="open-practice" data-chapter-id="${chapter.id}">直接训练</button>
      </div>
    </article>
  `;
}

function renderChapterView() {
  const chapter = getSelectedChapter();
  const progress = getChapterProgress(chapter);
  const chapterState = app.state.progress.chapters[chapter.id] || {};
  const featured = chapter.sections.slice(0, 3);
  pageEl.innerHTML = `
    <div class="page-stack chapter-stack">
      <section class="chapter-hero surface-panel">
        <div class="section-heading spread">
          <div>
            <span class="eyebrow">章节学习</span>
            <h3>第 ${chapter.number} 章 · ${chapter.title}</h3>
            <p class="body-copy">${chapter.summary}</p>
          </div>
          <div class="hero-meta-grid">
            <div class="metric-card"><span>推荐用时</span><strong>${getStudyTime(chapter)}</strong></div>
            <div class="metric-card"><span>当前掌握度</span><strong>${progress.percent}%</strong></div>
            <div class="metric-card"><span>最近测试</span><strong>${chapterState.lastQuizScore ?? '--'}</strong></div>
          </div>
        </div>
      </section>

      <section class="guide-grid">
        <article class="surface-panel">
          <span class="eyebrow">学习目标</span>
          <h3>先知道这章学完要会什么</h3>
          <div class="pill-list">${chapter.learningGoals.map((goal) => `<span class="info-pill">${goal}</span>`).join('')}</div>
        </article>
        <article class="surface-panel">
          <span class="eyebrow">本章导览</span>
          <h3>按这条线读会更顺</h3>
          <div class="chapter-map-list">${chapter.chapterMap.map((item) => `<div class="map-row">${item}</div>`).join('')}</div>
        </article>
        <article class="surface-panel">
          <span class="eyebrow">先修提醒</span>
          <h3>开读前先把前置信息放进脑子里</h3>
          <ul class="plain-list">${chapter.prerequisites.map((item) => `<li>${item}</li>`).join('')}</ul>
        </article>
        <article class="surface-panel">
          <span class="eyebrow">必看知识块</span>
          <h3>这几段最适合优先扫读</h3>
          <div class="featured-list">${featured.map((section) => `<div class="featured-item"><strong>${section.title}</strong><span>${section.points.length} 个知识点</span></div>`).join('')}</div>
        </article>
      </section>

      ${chapter.sections.map((section) => renderSectionCard(chapter, section)).join('')}

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
        <div class="action-row">
          <button class="btn primary" data-action="open-practice" data-chapter-id="${chapter.id}">进入章节练习</button>
          <button class="btn subtle" data-action="open-test" data-chapter-id="${chapter.id}">开始综合测试</button>
        </div>
      </section>
    </div>
  `;
}

function renderSectionCard(chapter, section) {
  return `
    <section class="surface-panel section-block">
      <div class="section-heading spread align-start">
        <div>
          <span class="eyebrow">分节学习</span>
          <h3>${section.title}</h3>
          <p class="body-copy">${section.overview}</p>
        </div>
        <button class="btn tiny subtle" data-action="open-practice" data-chapter-id="${chapter.id}" data-section-id="${section.id}">做本节小测</button>
      </div>
      <div class="point-list">${section.points.map((point) => renderPointCard(chapter, section, point)).join('')}</div>
    </section>
  `;
}

function renderPointCard(chapter, section, point) {
  const status = app.state.progress.points[point.id]?.status || 'unseen';
  return `
    <details class="point-card" ${app.state.progress.lastPointId === point.id ? 'open' : ''}>
      <summary data-action="focus-point" data-chapter-id="${chapter.id}" data-point-id="${point.id}">
        <div class="point-card-head">
          <div>
            <span class="eyebrow">一句话结论</span>
            <strong>${point.title}</strong>
          </div>
          <span class="status-pill ${status}">${statusLabel(status)}</span>
        </div>
        <div class="point-conclusion">${point.tip || point.summary}</div>
        <div class="point-excerpt"><span>精炼解释</span><p>${getPointExcerpt(point)}</p></div>
        <div class="point-hint-row"><span>展开看完整说明</span><em>${section.title}</em></div>
      </summary>
      <div class="point-detail-wrap">
        <div class="point-detail-block">
          <span class="detail-label">完整说明</span>
          <div class="point-body">${point.detail}</div>
        </div>
        ${point.svg ? `<div class="svg-box">${point.svg}</div>` : ''}
        <div class="point-meta-grid">
          ${point.tip ? `<div class="point-tip"><span class="detail-label">易错提醒</span><p>${point.tip}</p></div>` : ''}
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
  pageEl.innerHTML = `
    <div class="page-stack training-stack">
      <section class="training-hero surface-panel">
        <div class="section-heading spread">
          <div>
            <span class="eyebrow">训练强化</span>
            <h3>第 ${chapter.number} 章 · ${chapter.title} 训练中枢</h3>
            <p class="body-copy">先选择章节，再切换章节练习、综合测试、错题复习或模拟器强化。</p>
          </div>
          <div class="hero-meta-grid">
            <div class="metric-card"><span>最近成绩</span><strong>${overview.lastScore}</strong></div>
            <div class="metric-card"><span>错题数量</span><strong>${overview.wrongCount}</strong></div>
            <div class="metric-card"><span>薄弱章节数</span><strong>${getWeakChapters().length}</strong></div>
          </div>
        </div>
      </section>

      <section class="surface-panel training-controls">
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
        <div class="segment-tabs" role="tablist">
          ${renderModeTab('section', '章节练习')}
          ${renderModeTab('test', '综合测试')}
          ${renderModeTab('wrongbook', '错题复习')}
          ${renderModeTab('simulator', '模拟器')}
        </div>
      </section>

      ${app.state.practiceMode === 'section' ? renderSectionPractice(section) : ''}
      ${app.state.practiceMode === 'test' ? renderChapterTest(chapter, bundle) : ''}
      ${app.state.practiceMode === 'wrongbook' ? renderWrongbook(chapter, wrongs) : ''}
      ${app.state.practiceMode === 'simulator' ? renderSimulatorWorkbench(chapter) : ''}
    </div>
  `;
  if (app.state.practiceMode === 'simulator') {
    const mountPoint = document.getElementById('simulator-stage');
    mountSimulator(app.state.selectedSimulatorId, mountPoint);
  }
}

function renderModeTab(mode, label) {
  return `<button class="segment-tab ${app.state.practiceMode === mode ? 'active' : ''}" data-action="set-practice-mode" data-mode="${mode}">${label}</button>`;
}

function renderSectionPractice(section) {
  return `
    <section class="surface-panel training-panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">章节练习</span>
          <h3>${section.sectionTitle}</h3>
          <p class="body-copy">即时反馈模式，适合边学边做，判断自己对刚刚那一节的掌握程度。</p>
        </div>
      </div>
      <div class="quiz-list">${section.questions.map(renderPracticeQuestion).join('')}</div>
    </section>
  `;
}

function renderPracticeQuestion(question) {
  const current = app.session.practiceAnswers[question.id];
  const feedback = app.session.practiceFeedback[question.id];
  return `
    <article class="quiz-card ${feedback?.status || ''}">
      <div class="question-head">
        <span class="eyebrow">即时反馈</span>
        <h4>${question.stem}</h4>
      </div>
      <div class="option-list">
        ${question.options.map((option, index) => {
          const classes = ['option-btn'];
          if (current === index) classes.push('selected');
          if (feedback?.status) {
            if (index === question.answerIndex) classes.push('correct');
            else if (current === index && current !== question.answerIndex) classes.push('wrong');
          }
          return `<button class="${classes.join(' ')}" data-action="practice-answer" data-question-id="${question.id}" data-answer-index="${index}">${String.fromCharCode(65 + index)}. ${option}</button>`;
        }).join('')}
      </div>
      ${feedback ? `<div class="feedback ${feedback.status}">${feedback.message}${question.explanation ? `<br><strong>解析：</strong>${question.explanation}` : ''}</div>` : ''}
    </article>
  `;
}

function renderChapterTest(chapter, bundle) {
  return `
    <section class="surface-panel training-panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">综合测试</span>
          <h3>${chapter.title}</h3>
          <p class="body-copy">按整章交卷评分，用于检验本章知识点的整体掌握情况。</p>
        </div>
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
    <section class="surface-panel training-panel">
      <div class="section-heading">
        <div>
          <span class="eyebrow">错题复习</span>
          <h3>${chapter.title}</h3>
          <p class="body-copy">先回看对应概念，再结合模拟器补强理解薄弱点。</p>
        </div>
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
            ${item.relatedTopicId ? `<button class="btn tiny primary" data-action="review-topic" data-topic-id="${item.relatedTopicId}" data-chapter-id="${item.chapterId}">回到知识点</button>` : ''}
            ${item.relatedSimulatorId ? `<button class="btn tiny subtle" data-action="open-simulator" data-simulator-id="${item.relatedSimulatorId}">打开相关模拟器</button>` : ''}
          </div>
        </article>`).join('')}</div><div class="action-row"><button class="btn subtle" data-action="clear-wrongbook" data-chapter-id="${chapter.id}">清空本章错题</button></div>` : '<div class="empty-state">本章目前没有错题记录，可切换到章节练习或综合测试继续训练。</div>'}
    </section>
  `;
}

function renderSimulatorWorkbench(chapter) {
  return `
    <section class="simulator-workbench">
      <div class="simulator-layout">
        <aside class="surface-panel simulator-rail">
          <div class="section-heading">
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
          <section class="surface-panel simulator-context">
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
    case 'toggle-sidebar':
      app.state.mobileSidebarOpen = !app.state.mobileSidebarOpen;
      renderView();
      break;
    case 'switch-view':
      app.state.view = PRIMARY_VIEWS.includes(d.view) ? d.view : 'dashboard';
      app.state.mobileSidebarOpen = false;
      if (app.state.view !== 'practice') resetPracticeSession();
      renderView();
      break;
    case 'open-chapter':
      app.state.selectedChapterId = d.chapterId;
      app.state.view = 'chapter';
      app.state.mobileSidebarOpen = false;
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
      app.state.practiceMode = 'section';
      app.state.view = 'practice';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      renderView();
      break;
    case 'open-test':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      app.state.view = 'practice';
      app.state.practiceMode = 'test';
      app.state.mobileSidebarOpen = false;
      resetPracticeSession();
      renderView();
      break;
    case 'set-practice-mode':
      app.state.practiceMode = d.mode;
      if (d.mode !== 'simulator') resetPracticeSession();
      renderView();
      break;
    case 'practice-answer':
      handlePracticeAnswer(d.questionId, Number(d.answerIndex));
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
      app.state.view = 'chapter';
      app.state.progress.lastPointId = d.topicId;
      renderView();
      break;
    case 'open-simulator':
    case 'select-simulator':
      app.state.selectedSimulatorId = d.simulatorId;
      app.state.view = 'practice';
      app.state.practiceMode = 'simulator';
      renderView();
      break;
    case 'clear-wrongbook':
      Object.keys(app.state.wrongbook).forEach((key) => {
        if (app.state.wrongbook[key].chapterId === d.chapterId) delete app.state.wrongbook[key];
      });
      renderView();
      break;
  }
}

function handleChange(event) {
  if (event.target.matches('[data-change="select-practice-chapter"]')) {
    app.state.selectedChapterId = event.target.value;
    app.state.selectedSectionId = getSelectedChapter().sections[0]?.id || null;
    resetPracticeSession();
    renderView();
  }
  if (event.target.matches('[data-change="select-practice-section"]')) {
    app.state.selectedSectionId = event.target.value;
    resetPracticeSession();
    renderView();
  }
  if (event.target.matches('[data-change="test-fill"]')) {
    app.session.testAnswers[event.target.dataset.questionId] = event.target.value;
  }
}

function handleInput(event) {
  if (event.target.matches('[data-change="test-fill"]')) {
    app.session.testAnswers[event.target.dataset.questionId] = event.target.value;
  }
}

function handlePracticeAnswer(questionId, answerIndex) {
  const question = getPracticeQuestions().find((item) => item.id === questionId);
  if (!question) return;
  app.session.practiceAnswers[questionId] = answerIndex;
  const correct = answerIndex === question.answerIndex;
  app.session.practiceFeedback[questionId] = {
    status: correct ? 'correct' : 'wrong',
    message: correct ? '回答正确。' : `正确答案：${String.fromCharCode(65 + question.answerIndex)}。`,
  };
  if (correct) {
    markQuestionReview(question);
  } else {
    recordWrongAnswer(question, String.fromCharCode(65 + answerIndex), String.fromCharCode(65 + question.answerIndex));
  }
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
  }
  renderView();
}

function markQuestionReview(question) {
  if (question.relatedTopicId) {
    app.state.progress.points[question.relatedTopicId] = { status: 'mastered', lastViewedAt: new Date().toISOString() };
  }
}

function recordWrongAnswer(question, userAnswer, correctAnswer) {
  const key = `${question.chapterId}-${question.id}`;
  const existing = app.state.wrongbook[key];
  app.state.wrongbook[key] = {
    id: key,
    chapterId: question.chapterId,
    chapterTitle: app.data.chapters.find((item) => item.id === question.chapterId)?.title || question.chapterId,
    stem: question.stem,
    type: question.type,
    userAnswer,
    correctAnswer,
    explanation: question.explanation || '',
    relatedTopicId: question.relatedTopicId || null,
    relatedSimulatorId: question.relatedSimulatorId || null,
    wrongCount: (existing?.wrongCount || 0) + 1,
    lastWrongAt: new Date().toISOString(),
  };
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

function getContinueLabel() {
  const chapter = getContinueChapter();
  const point = app.state.progress.lastPointId ? findPointById(app.state.progress.lastPointId) : null;
  return point ? `${chapter.title} · ${point.title}` : `${chapter.title} · 延续上次进度`;
}

function getRecommendation() {
  if (getWrongbookCount() > 0) {
    return {
      text: `当前推荐任务为错题回看。可先处理最近 ${Math.min(3, getWrongbookCount())} 道错题，再安排综合测试。`,
      actions: `<button class="btn primary" data-action="switch-view" data-view="practice">进入错题复习</button><button class="btn subtle" data-action="open-test" data-chapter-id="${getContinueChapter().id}">开始综合测试</button>`,
    };
  }
  return {
    text: '当前错题记录较少，适合继续推进章节学习，并结合相关模拟器巩固抽象概念。',
    actions: `<button class="btn primary" data-action="open-chapter" data-chapter-id="${getContinueChapter().id}">进入章节学习</button><button class="btn subtle" data-action="open-simulator" data-simulator-id="${getContinueChapter().relatedSimulatorIds[0] || SIMULATORS[0].id}">查看相关模拟器</button>`,
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
  return {
    lastScore: history ? `${history.score}/${history.total}` : '--',
    wrongCount: wrongbookEntries().filter((item) => item.chapterId === chapterId).length,
    practiceSectionCount: bundle?.practiceSections?.length || 0,
  };
}

function getStudyTime(chapter) {
  const points = chapter.sections.flatMap((section) => section.points).length;
  return `${Math.max(20, points * 6)} 分钟`;
}

function getPointExcerpt(point) {
  const source = point.detail || point.summary || '';
  const trimmed = source.replace(/<[^>]*>/g, '').trim();
  return trimmed.length > 92 ? `${trimmed.slice(0, 92)}...` : trimmed;
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
function getSelectedPracticeSection(chapter, bundle) {
  return bundle.practiceSections.find((item) => item.sectionId === app.state.selectedSectionId) || bundle.practiceSections[0];
}
function getPracticeQuestions() { return getSelectedPracticeSection(getSelectedChapter(), getQuizBundle(getSelectedChapter().id)).questions; }
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
  return normalizeText(answer) === normalizeText(question.answer);
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
function normalizeText(value) { return String(value || '').trim().toLowerCase(); }
function safeParse(value) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
function persistState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state)); }
function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
