import { SIMULATORS, mountSimulator } from './simulators.js';

const STORAGE_KEY = 'coa.v2.state';
const LEGACY_PROGRESS_KEY = 'coa_p';
const LEGACY_WRONG_KEY = 'coa_wrong';

const sidebarEl = document.getElementById('sidebar');
const topbarEl = document.getElementById('topbar');
const pageEl = document.getElementById('page');

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
  sidebarEl.innerHTML = '';
  topbarEl.innerHTML = '<div><h2>加载失败</h2><p>资源没有正常加载完成。</p></div>';
  pageEl.innerHTML = `
    <section class="card">
      <span class="badge">启动失败</span>
      <h3>页面资源加载失败</h3>
      <p class="lead">请确认当前是通过本地静态服务器访问，而不是直接用 file:// 打开；如果已经在本地服务下运行，刷新一次通常就能恢复。</p>
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
    selectedSimulatorId: SIMULATORS[0].id,
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
  renderSidebar();
  renderTopbar();
  const views = {
    dashboard: renderDashboard,
    chapter: renderChapterView,
    practice: renderPracticeView,
    simulators: renderSimulatorView,
    archive: renderArchiveView,
  };
  views[app.state.view]?.();
  persistState();
}

function renderSidebar() {
  const stats = getProgressStats();
  sidebarEl.className = `sidebar ${app.state.mobileSidebarOpen ? 'open' : ''}`;
  sidebarEl.innerHTML = `
    <div class="brand">
      <div class="brand-mark">🧠</div>
      <div>
        <h1>计算机组成原理</h1>
        <p>学习仪表盘 · 刷题复习 · 模拟器强化</p>
      </div>
    </div>
    <section class="progress-card">
      <div class="progress-head"><strong>总进度</strong><span>${stats.percent}%</span></div>
      <div class="progress-bar"><span style="width:${stats.percent}%"></span></div>
      <p class="muted">已掌握 ${stats.masteredPoints}/${stats.totalPoints} 个知识点</p>
    </section>
    <section class="side-card">
      <h3>快捷入口</h3>
      <div class="quick-list">
        <button class="side-link" data-action="switch-view" data-view="dashboard"><strong>继续学习</strong><span>${getContinueLabel()}</span></button>
        <button class="side-link" data-action="switch-view" data-view="practice"><strong>刷题复习</strong><span>${getWrongbookCount()} 道错题待回看</span></button>
        <button class="side-link" data-action="switch-view" data-view="simulators"><strong>模拟器工具</strong><span>${SIMULATORS.length} 个教学模拟器</span></button>
      </div>
    </section>
    <section class="side-card">
      <h3>章节目录</h3>
      <div class="chapter-tree">${renderSidebarTree()}</div>
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
          return `
            <button class="chapter-link ${app.state.selectedChapterId === chapter.id ? 'active' : ''}" data-action="open-chapter" data-chapter-id="${chapter.id}">
              <strong>第 ${chapter.number} 章 · ${chapter.title}</strong>
              <span>P${chapter.pages} · ${chapter.summary}</span>
              <div class="chapter-link-meta">
                <div class="mini-progress" style="width:100%;"><span style="width:${progress.percent}%"></span></div>
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
    dashboard: ['学习仪表盘', '先看今天该做什么，再开始学习。'],
    chapter: ['章节学习', '按目标、知识点、总结、练习顺序推进。'],
    practice: ['刷题复习', '分清练习模式和测试模式，错题自动回流。'],
    simulators: ['模拟器工具', '先知道为什么看，再动手观察变化。'],
    archive: ['学习档案', '看清掌握状态，而不是只看是否做过。'],
  };
  const [title, subtitle] = titleMap[app.state.view];
  topbarEl.innerHTML = `
    <button class="btn ghost mobile-toggle" data-action="toggle-sidebar">目录</button>
    <div>
      <h2>${title}</h2>
      <p>${subtitle}</p>
    </div>
    <nav class="nav-pills">
      ${[['dashboard','继续学习'],['chapter','章节学习'],['practice','刷题复习'],['simulators','模拟器工具'],['archive','学习档案']]
        .map(([view, label]) => `<button class="pill ${app.state.view === view ? 'active' : ''}" data-action="switch-view" data-view="${view}">${label}</button>`).join('')}
    </nav>
  `;
}

function renderDashboard() {
  const stats = getProgressStats();
  const continueChapter = getContinueChapter();
  const recommendation = getRecommendation();
  pageEl.innerHTML = `
    <div class="stack">
      <section class="hero-grid">
        <article class="card">
          <span class="badge">学习主线</span>
          <h3 class="hero-title">先知道下一步学什么，再开始今天的学习。</h3>
          <p class="lead">这个版本把首页改成学习仪表盘，主线只保留：继续学习、章节阅读、刷题复习、模拟器强化、学习档案。你的注意力会更集中在“学会”而不是“选模式”。</p>
          <div class="action-row">
            <button class="btn primary" data-action="open-chapter" data-chapter-id="${continueChapter.id}">继续学习 ${continueChapter.title}</button>
            <button class="btn" data-action="switch-view" data-view="practice">重做错题</button>
            <button class="btn" data-action="switch-view" data-view="simulators">打开模拟器</button>
          </div>
        </article>
        <article class="card stack">
          <div class="metric"><strong>${stats.percent}%</strong><span>总体掌握度</span></div>
          <div class="metric"><strong>${getWrongbookCount()}</strong><span>错题待回看</span></div>
          <div class="metric"><strong>${app.state.quizHistory.length}</strong><span>测试记录</span></div>
        </article>
      </section>
      <section class="dashboard-grid">
        <article class="card">
          <h3>最近学习章节</h3>
          <p class="lead">${continueChapter.summary}</p>
          <div class="action-row">
            <button class="btn primary" data-action="open-chapter" data-chapter-id="${continueChapter.id}">继续看知识点</button>
            <button class="btn" data-action="open-practice" data-chapter-id="${continueChapter.id}">做本章练习</button>
          </div>
        </article>
        <article class="card">
          <h3>今日推荐动作</h3>
          <p class="lead">${recommendation.text}</p>
          <div class="action-row">${recommendation.actions}</div>
        </article>
        <article class="card">
          <h3>复习路径</h3>
          <div class="path-list">
            <div class="timeline-card"><strong>考前 30 分钟</strong><p class="lead">先刷错题本，再回看高频考点，最后打开一个最薄弱的模拟器。</p></div>
            <div class="timeline-card"><strong>一小时冲刺</strong><p class="lead">按章节做综合测试，重点盯第 4 / 6 / 8 / 10 章。</p></div>
            <div class="timeline-card"><strong>三天复习</strong><p class="lead">按“概论 -> 硬件结构 -> CPU -> 控制单元”分块推进。</p></div>
          </div>
        </article>
      </section>
      <section class="card">
        <h3>章节概览</h3>
        <p class="group-sub">先扫全局，再决定从哪一章切入。</p>
        <div class="chapter-card-list">${app.data.chapters.map(renderChapterOverviewCard).join('')}</div>
      </section>
    </div>
  `;
}

function renderChapterOverviewCard(chapter) {
  const progress = getChapterProgress(chapter);
  return `
    <article class="chapter-overview-card">
      <div class="chapter-head">
        <div>
          <h4>第 ${chapter.number} 章 · ${chapter.title}</h4>
          <p class="group-sub">${chapter.summary}</p>
        </div>
        <span class="badge">P${chapter.pages}</span>
      </div>
      <div class="mini-progress"><span style="width:${progress.percent}%"></span></div>
      <div class="action-row" style="margin-top:12px;">
        <button class="btn primary" data-action="open-chapter" data-chapter-id="${chapter.id}">进入章节</button>
        <button class="btn" data-action="open-practice" data-chapter-id="${chapter.id}">本章练习</button>
      </div>
    </article>
  `;
}

function renderChapterView() {
  const chapter = getSelectedChapter();
  const progress = getChapterProgress(chapter);
  const chapterState = app.state.progress.chapters[chapter.id] || {};
  pageEl.innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="chapter-head">
          <div>
            <span class="badge">第 ${chapter.number} 章 · P${chapter.pages}</span>
            <h3 style="margin:10px 0 8px;">${chapter.title}</h3>
            <p class="lead">${chapter.summary}</p>
          </div>
          <div class="summary-grid">
            <div class="metric"><strong>${progress.percent}%</strong><span>本章进度</span></div>
            <div class="metric"><strong>${progress.mastered}/${progress.total}</strong><span>已掌握知识点</span></div>
            <div class="metric"><strong>${chapterState.lastQuizScore ?? '--'}</strong><span>最近测试得分</span></div>
          </div>
        </div>
        <div class="chapter-map">${chapter.chapterMap.map((item) => `<span class="meta-pill">${item}</span>`).join('')}</div>
      </section>
      <section class="card">
        <h3>学习目标</h3>
        <div class="list-inline">${chapter.learningGoals.map((goal) => `<span class="meta-pill">${goal}</span>`).join('')}</div>
      </section>
      <section class="card">
        <h3>先修提醒</h3>
        <ul>${chapter.prerequisites.map((item) => `<li>${item}</li>`).join('')}</ul>
      </section>
      ${chapter.sections.map((section) => renderSectionCard(chapter, section)).join('')}
      <section class="card">
        <h3>章末整理</h3>
        <div class="summary-grid">
          <div><h4>本章必背 5 条</h4><ul>${chapter.checkpoints.map((item) => `<li>${item}</li>`).join('')}</ul></div>
          <div><h4>高频考点</h4><ul>${chapter.highFrequency.map((item) => `<li>${item}</li>`).join('')}</ul></div>
          <div><h4>易混概念对照</h4><ul>${chapter.confusions.map(([a, b]) => `<li>${a} / ${b}</li>`).join('')}</ul></div>
        </div>
        <div class="section-actions">
          <button class="btn primary" data-action="open-practice" data-chapter-id="${chapter.id}">进入本章练习</button>
          <button class="btn" data-action="open-test" data-chapter-id="${chapter.id}">开始本章测试</button>
        </div>
      </section>
    </div>
  `;
}

function renderSectionCard(chapter, section) {
  return `
    <section class="card section-card">
      <h3>${section.title}</h3>
      <p class="lead">${section.overview}</p>
      <div class="section-list">${section.points.map((point) => renderPointCard(chapter, point)).join('')}</div>
      <div class="section-actions">
        <button class="btn primary" data-action="open-practice" data-chapter-id="${chapter.id}" data-section-id="${section.id}">做本节小测</button>
        ${chapter.relatedSimulatorIds[0] ? `<button class="btn" data-action="open-simulator" data-simulator-id="${chapter.relatedSimulatorIds[0]}">打开相关模拟器</button>` : ''}
      </div>
    </section>
  `;
}

function renderPointCard(chapter, point) {
  const status = app.state.progress.points[point.id]?.status || 'unseen';
  return `
    <details class="point-card" ${app.state.progress.lastPointId === point.id ? 'open' : ''}>
      <summary data-action="focus-point" data-chapter-id="${chapter.id}" data-point-id="${point.id}">
        <div class="point-title-row">
          <strong>${point.title}</strong>
          <span class="meta-pill">${statusLabel(status)}</span>
        </div>
        <div class="point-summary">${point.summary}</div>
      </summary>
      <div class="point-body">${point.detail}</div>
      ${point.svg ? `<div class="svg-box">${point.svg}</div>` : ''}
      ${point.tip ? `<div class="point-tip">${point.tip}</div>` : ''}
      <div class="status-row">
        <button class="btn success ${status === 'mastered' ? 'active' : ''}" data-action="set-point-status" data-point-id="${point.id}" data-status="mastered">我掌握了</button>
        <button class="btn ghost ${status === 'review' ? 'active' : ''}" data-action="set-point-status" data-point-id="${point.id}" data-status="review">稍后复习</button>
        ${point.relatedSimulatorIds.map((simId) => {
          const sim = SIMULATORS.find((item) => item.id === simId);
          return sim ? `<button class="chip" data-action="open-simulator" data-simulator-id="${simId}">${sim.title}</button>` : '';
        }).join('')}
      </div>
    </details>
  `;
}

function renderPracticeView() {
  const chapter = getSelectedChapter();
  const bundle = getQuizBundle(chapter.id);
  const section = getSelectedPracticeSection(chapter, bundle);
  const wrongs = wrongbookEntries().filter((item) => item.chapterId === chapter.id);
  pageEl.innerHTML = `
    <div class="stack">
      <section class="card">
        <div class="toolbar">
          <div style="min-width:200px;flex:1;">
            <label class="muted">章节</label>
            <select class="select" data-change="select-practice-chapter">
              ${app.data.chapters.map((item) => `<option value="${item.id}" ${item.id === chapter.id ? 'selected' : ''}>第 ${item.number} 章 · ${item.title}</option>`).join('')}
            </select>
          </div>
          <div style="min-width:200px;flex:1;">
            <label class="muted">小测章节</label>
            <select class="select" data-change="select-practice-section">
              ${bundle.practiceSections.map((item) => `<option value="${item.sectionId}" ${item.sectionId === section.sectionId ? 'selected' : ''}>${item.sectionTitle}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="filter-row" style="margin-top:14px;">
          <button class="btn ${app.state.practiceMode === 'section' ? 'primary' : ''}" data-action="set-practice-mode" data-mode="section">练习模式</button>
          <button class="btn ${app.state.practiceMode === 'test' ? 'primary' : ''}" data-action="set-practice-mode" data-mode="test">测试模式</button>
          <button class="btn ${app.state.practiceMode === 'wrongbook' ? 'primary' : ''}" data-action="set-practice-mode" data-mode="wrongbook">错题复习</button>
        </div>
      </section>
      ${app.state.practiceMode === 'section' ? renderSectionPractice(section) : app.state.practiceMode === 'test' ? renderChapterTest(chapter, bundle) : renderWrongbook(chapter, wrongs)}
    </div>
  `;
}

function renderSectionPractice(section) {
  return `
    <section class="card">
      <h3>${section.sectionTitle} · 练习模式</h3>
      <p class="group-sub">答完立即反馈，适合边学边做。</p>
      <div class="quiz-list">${section.questions.map(renderPracticeQuestion).join('')}</div>
    </section>
  `;
}

function renderPracticeQuestion(question) {
  const current = app.session.practiceAnswers[question.id];
  const feedback = app.session.practiceFeedback[question.id];
  return `
    <article class="quiz-card ${feedback?.status || ''}">
      <h4>${question.stem}</h4>
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
    <section class="card">
      <h3>${chapter.title} · 综合测试</h3>
      <p class="group-sub">先作答，交卷后统一评分，并写入学习档案与错题本。</p>
      <div class="quiz-list">${bundle.chapterTest.map((question, index) => renderTestQuestion(question, index)).join('')}</div>
      <div class="action-row" style="margin-top:18px;">
        <button class="btn primary" data-action="submit-test" data-chapter-id="${chapter.id}">交卷评分</button>
        <button class="btn ghost" data-action="reset-test">重置作答</button>
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
      <h4>${index + 1}. ${question.stem}</h4>
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
  return `<div class="score-box"><div><strong>${correct}/${questions.length}</strong><div class="muted">正确率 ${percent}%</div></div><div class="muted">成绩已同步到学习档案与错题本。</div></div>`;
}

function renderWrongbook(chapter, wrongs) {
  return `
    <section class="card">
      <h3>${chapter.title} · 错题复习</h3>
      <p class="group-sub">按章节聚合，支持直接回到知识点或跳去对应模拟器。</p>
      ${wrongs.length ? `<div class="wrongbook-list">${wrongs.map((item) => `
        <article class="wrong-item">
          <h4>${item.stem}</h4>
          <p class="muted">你的答案：${item.userAnswer || '未作答'} · 正确答案：${item.correctAnswer}</p>
          ${item.explanation ? `<p class="lead">${item.explanation}</p>` : ''}
          <small class="muted">错误次数 ${item.wrongCount} · 最近一次 ${formatDate(item.lastWrongAt)}</small>
          <div class="action-row" style="margin-top:10px;">
            ${item.relatedTopicId ? `<button class="btn primary" data-action="review-topic" data-topic-id="${item.relatedTopicId}" data-chapter-id="${item.chapterId}">回到知识点</button>` : ''}
            ${item.relatedSimulatorId ? `<button class="btn" data-action="open-simulator" data-simulator-id="${item.relatedSimulatorId}">打开相关模拟器</button>` : ''}
          </div>
        </article>`).join('')}</div><div class="action-row" style="margin-top:18px;"><button class="btn danger" data-action="clear-wrongbook" data-chapter-id="${chapter.id}">清空本章错题</button></div>` : '<div class="empty-state">本章目前没有错题，可以去做综合测试或进入下一章。</div>'}
    </section>
  `;
}

function renderSimulatorView() {
  pageEl.innerHTML = `
    <div class="sim-layout">
      <section class="card stack">
        <div>
          <h3>模拟器列表</h3>
          <p class="group-sub">每个模拟器都先说明它解决什么理解难点，再给你控件和观察要点。</p>
        </div>
        ${SIMULATORS.map((sim) => `<article class="sim-card ${app.state.selectedSimulatorId === sim.id ? 'active' : ''}" data-action="select-simulator" data-simulator-id="${sim.id}"><div class="chapter-head"><div><h4>${sim.title}</h4><p>${sim.summary}</p></div><span class="badge">教学型</span></div></article>`).join('')}
      </section>
      <section class="card" id="simulator-stage"></section>
    </div>
  `;
  const mountPoint = document.getElementById('simulator-stage');
  mountSimulator(app.state.selectedSimulatorId, mountPoint);
}

function renderArchiveView() {
  const stats = getProgressStats();
  const history = [...app.state.quizHistory].reverse().slice(0, 12);
  pageEl.innerHTML = `
    <div class="stack">
      <section class="archive-grid">
        <article class="card">
          <h3>学习总览</h3>
          <div class="summary-grid">
            <div class="metric"><strong>${stats.masteredPoints}</strong><span>已掌握知识点</span></div>
            <div class="metric"><strong>${stats.reviewPoints}</strong><span>待复习知识点</span></div>
            <div class="metric"><strong>${getWrongbookCount()}</strong><span>错题累计</span></div>
          </div>
        </article>
        <article class="card">
          <h3>最近测试</h3>
          ${history.length ? `<div class="timeline">${history.map((item) => `<div class="timeline-card"><strong>${item.chapterTitle}</strong><p class="lead">${item.mode === 'test' ? '综合测试' : '练习'} · ${item.score}/${item.total}</p><small class="muted">${formatDate(item.completedAt)}</small></div>`).join('')}</div>` : '<div class="empty-state">还没有测试记录，去做一章综合测试吧。</div>'}
        </article>
      </section>
      <section class="card">
        <h3>章节进度</h3>
        <div class="table-like">${app.data.chapters.map((chapter) => {
          const progress = getChapterProgress(chapter);
          const state = app.state.progress.chapters[chapter.id] || {};
          return `<div class="table-row"><div><strong>第 ${chapter.number} 章 · ${chapter.title}</strong><div class="muted">${chapter.summary}</div></div><div>${progress.mastered}/${progress.total} 知识点</div><div>${state.lastQuizScore ?? '--'} 分</div></div>`;
        }).join('')}</div>
      </section>
      <section class="card">
        <h3>错题总览</h3>
        ${wrongbookEntries().length ? `<div class="wrongbook-list">${wrongbookEntries().map((item) => `<article class="wrong-item"><h4>${item.chapterTitle}</h4><p class="lead">${item.stem}</p><p class="muted">错 ${item.wrongCount} 次 · 最近一次 ${formatDate(item.lastWrongAt)}</p><div class="action-row">${item.relatedTopicId ? `<button class="btn primary" data-action="review-topic" data-topic-id="${item.relatedTopicId}" data-chapter-id="${item.chapterId}">回到知识点</button>` : ''}${item.relatedSimulatorId ? `<button class="btn" data-action="open-simulator" data-simulator-id="${item.relatedSimulatorId}">打开模拟器</button>` : ''}</div></article>`).join('')}</div>` : '<div class="empty-state">错题本还是空的，说明你最近做题很稳。</div>'}
      </section>
    </div>
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
      app.state.view = d.view;
      app.state.mobileSidebarOpen = false;
      if (d.view !== 'practice') resetPracticeSession();
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
      resetPracticeSession();
      renderView();
      break;
    case 'open-test':
      app.state.selectedChapterId = d.chapterId || app.state.selectedChapterId;
      app.state.view = 'practice';
      app.state.practiceMode = 'test';
      resetPracticeSession();
      renderView();
      break;
    case 'set-practice-mode':
      app.state.practiceMode = d.mode;
      resetPracticeSession();
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
      app.state.view = 'simulators';
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
  return point ? `${chapter.title} · ${point.title}` : `${chapter.title} · 从上次位置继续`;
}

function getRecommendation() {
  if (getWrongbookCount() > 0) {
    return {
      text: `你现在最值钱的动作是回看错题。先清掉最近 ${Math.min(3, getWrongbookCount())} 道，再做一章综合测试。`,
      actions: `<button class="btn primary" data-action="switch-view" data-view="practice">打开错题复习</button><button class="btn" data-action="open-test" data-chapter-id="${getContinueChapter().id}">做综合测试</button>`,
    };
  }
  return {
    text: '错题压力不大，继续当前章节，然后用对应模拟器强化理解，会比盲目刷题更有效。',
    actions: `<button class="btn primary" data-action="open-chapter" data-chapter-id="${getContinueChapter().id}">继续当前章节</button><button class="btn" data-action="open-simulator" data-simulator-id="${getContinueChapter().relatedSimulatorIds[0] || SIMULATORS[0].id}">打开相关模拟器</button>`,
  };
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
