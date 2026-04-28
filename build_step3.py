#!/usr/bin/env python3
"""Step 3: Fix duplicates, add core JS logic, close HTML"""
import re, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(SCRIPT_DIR, "计算机组成原理学习平台🦞.html")
CUR = OUT  # read current file

with open(CUR, 'r', encoding='utf-8') as f:
    content = f.read()

# Split at first <script> tag - keep CSS + HTML body
script_pos = content.index('<script>')
prefix = content[:script_pos+len('<script>')]

# The first CHS is the detailed one (line 107 area), it's the longest
# Find all JS data declarations from the original - we just need the FIRST set
# Let's get the JS part after <script>
js_part = content[script_pos+len('<script>'):]

# Extract first CHS (starts with "const CHS=" and ends at "];;" )
chs_match = re.search(r'const CHS=\[(.+?)\];;', js_part, re.DOTALL)
quiz_match = re.search(r'const QUIZ=\{(.+?)\};;', js_part, re.DOTALL)
parts_match = re.search(r'const PARTS=\[(.+?)\];;', js_part, re.DOTALL)
qexp_match = re.search(r'const QEXP=\{(.+?)\};', js_part, re.DOTALL)

data_js = ''
if chs_match:
    data_js += 'const CHS=[' + chs_match.group(1) + '];\n'
if quiz_match:
    data_js += 'const QUIZ={' + quiz_match.group(1) + '};\n'
if parts_match:
    data_js += 'const PARTS=[' + parts_match.group(1) + '];\n'
if qexp_match:
    data_js += 'const QEXP={' + qexp_match.group(1) + '};\n'

# Core JS logic - enhanced version of original
core_js = '''
// === INIT ===
let curCh=null,curMode='notes',ans={};
let prog=localStorage.getItem('coa_p');
try{prog=JSON.parse(prog)||{};}catch(e){prog={};}

function getCh(id){return CHS.find(c=>c.id===id);}

function updateProg(){
  let total=CHS.length,dn=0;
  CHS.forEach(c=>{if(prog[c.id]&&prog[c.id].read)dn++;});
  let pct=Math.round(dn/total*100);
  document.getElementById('pp').textContent=pct+'%';
  document.getElementById('pf').style.width=pct+'%';
}

// === TREE ===
function renderTree(){
  let h='';
  PARTS.forEach(p=>{
    let chs=CHS.filter(c=>p.chs.includes(c.id));
    let dn=chs.filter(c=>prog[c.id]&&prog[c.id].read).length;
    h+='<div class="tp"><div class="tp-h" onclick="this.parentElement.classList.toggle(\'cl\')"><span class="ar">▼</span>'+p.name+' ('+dn+'/'+chs.length+')</div><div class="clst">';
    chs.forEach(c=>{
      let cls=prog[c.id]&&prog[c.id].read?'dn':'';cls+=curCh===c.id?' ac':'';
      h+='<div class="ci '+cls+'" onclick="selCh(\''+c.id+'\')"><span class="cn">Ch'+c.n+'</span><span class="cna">'+c.nm+'</span><span class="cd"></span></div>';
    });
    h+='</div></div>';
  });
  document.getElementById('chTree').innerHTML=h;updateProg();
}

// === CHAPTER SELECT ===
function selCh(id){
  curCh=id;
  document.querySelectorAll('.ci').forEach(e=>e.classList.remove('ac'));
  let el=document.querySelector('.ci[onclick*="'+id+'"]');
  if(el)el.classList.add('ac');
  if(curMode==='notes')renderNotes();
  else if(curMode==='quiz')renderQuiz();
  else if(curMode==='sim')renderSim();
  else if(curMode==='graph')renderGraph();
  else if(curMode==='guide')renderGuide();
}

// === MODE SWITCH ===
function setMode(m){
  curMode=m;
  document.querySelectorAll('.mb').forEach(b=>b.classList.toggle('ac',b.dataset.mode===m));
  if(!curCh){
    document.getElementById('content').innerHTML='<div class="es"><div class="ic">👈</div><p>选择章节开始学习</p><p style="font-size:12px;margin-top:6px">全10章 · 200+知识点 · 6个交互模拟器 · 零基础可学</p></div>';
    document.getElementById('cTitle').textContent='📚 选择章节开始学习';
    return;
  }
  if(m==='notes')renderNotes();
  else if(m==='quiz')renderQuiz();
  else if(m==='sim')renderSim();
  else if(m==='graph')renderGraph();
  else if(m==='guide')renderGuide();
}

// === NOTES MODE ===
function renderNotes(){
  let ch=getCh(curCh);if(!ch)return;
  document.getElementById('cTitle').textContent='📒 '+ch.nm;
  let ptCount=0;ch.secs.forEach(s=>ptCount+=s.points.length);
  document.getElementById('cBadge').textContent=ptCount+'个知识点 · P'+ch.pg;
  let h='<div class="sec ac"><h3>第'+ch.n+'章 '+ch.nm+'</h3><div class="chd">'+ch.desc+'</div>';
  ch.secs.forEach(s=>{
    h+='<div class="sect"><h4>'+s.title+'</h4>';
    s.points.forEach(p=>{
      let hasSvg=p.svg&&p.svg.length>0;
      let hasTip=p.tip&&p.tip.length>0;
      h+='<div class="pt'+(hasSvg||hasTip?' exp':'')+'"><div class="ptt" onclick="this.parentElement.classList.toggle(\'exp\')">'+p.t+'</div>';
      if(hasSvg)h+='<div class="svg-wrap">'+p.svg+'</div>';
      h+='<div class="ptc">'+p.c+'</div>';
      if(hasTip)h+='<div class="tip">'+p.tip+'</div>';
      h+='</div>';
    });
    h+='</div>';
  });
  h+='<div style="margin-top:20px"><button class="bt pr" onclick="markRead(\''+ch.id+'\');setMode(\'quiz\')">✅ 已学完，开始刷题 →</button></div></div>';
  document.getElementById('content').innerHTML=h;
}

function markRead(id){
  if(!prog[id])prog[id]={read:true};else prog[id].read=true;
  localStorage.setItem('coa_p',JSON.stringify(prog));renderTree();
}

// === QUIZ MODE (选择题) ===
function renderQuiz(){
  let ch=getCh(curCh);if(!ch)return;
  let qs=QUIZ[ch.id]||[];
  ans={};
  document.getElementById('cTitle').textContent='✍️ '+ch.nm+' · 刷题';
  document.getElementById('cBadge').textContent=qs.length+'题';
  let h='<div class="sec ac"><h3>第'+ch.n+'章 '+ch.nm+' · 测验</h3><p class="st">共'+qs.length+'题 · 点击作答 · 交卷后显示解析</p>';
  qs.forEach((q,i)=>{
    h+='<div class="qc" id="q'+i+'"><div class="qn">第'+(i+1)+'题 · 单选</div><div class="qt">'+q[0]+'</div><div class="op">';
    q[1].forEach((o,j)=>h+='<div class="ot" onclick="pickAns('+i+','+j+')">'+String.fromCharCode(65+j)+'. '+o+'</div>');
    h+='</div><div class="exp-box" id="exp'+i+'"></div></div>';
  });
  h+='<div class="qa"><button class="bt pr" onclick="submitQ(\''+ch.id+'\')">📝 交卷</button><button class="bt" onclick="renderQuiz()">🔄 重做</button><button class="bt danger" onclick="showWrongBook()">📋 错题本</button></div><div id="scoreArea"></div></div>';
  document.getElementById('content').innerHTML=h;
}

function pickAns(qi,oi){
  if(document.querySelector('#q'+qi+' .ot.cr'))return;
  ans[qi]=oi;
  document.querySelectorAll('#q'+qi+' .ot').forEach(e=>e.classList.remove('sl'));
  document.querySelectorAll('#q'+qi+' .ot')[oi].classList.add('sl');
}

function submitQ(chId){
  let ch=getCh(chId);if(!ch)return;
  let qs=QUIZ[chId]||[],score=0,total=qs.length;
  let exps=QEXP[chId]||[];
  qs.forEach((q,i)=>{
    let a=ans[i],correct=q[2];
    let opts=document.querySelectorAll('#q'+i+' .ot');
    opts.forEach(o=>o.style.pointerEvents='none');
    opts[correct].classList.add('cr');
    if(a===correct)score++;
    else if(a!==undefined)opts[a].classList.add('wr');
    // Show explanation
    let exp=exps[i]||'';
    let expBox=document.getElementById('exp'+i);
    if(exp&&expBox){
      expBox.innerHTML='<strong>📖 解析：</strong>'+exp;
      expBox.classList.add('show');
    }
    // Feedback
    let fb=document.createElement('div');
    fb.className='fbk '+(a===correct?'ok':'er');
    fb.textContent=a===correct?'✅ 正确':(a===undefined?'⚠️ 未作答':'❌ 正确答案 '+String.fromCharCode(65+correct));
    document.getElementById('q'+i).appendChild(fb);
    // Save wrong answers
    if(a!==correct&&a!==undefined){
      let wrongs=localStorage.getItem('coa_wrong');
      try{wrongs=JSON.parse(wrongs)||[];}catch(e){wrongs=[];}
      wrongs.push({ch:chId,q:i,question:q[0],userAns:String.fromCharCode(65+a),correctAns:String.fromCharCode(65+correct),exp:exp,time:new Date().toLocaleString()});
      localStorage.setItem('coa_wrong',JSON.stringify(wrongs));
    }
  });
  if(!prog[chId])prog[chId]={};prog[chId].quiz=true;prog[chId].read=true;
  localStorage.setItem('coa_p',JSON.stringify(prog));
  let pct=Math.round(score/total*100),cls=pct>=80?'gr':(pct>=60?'gd':'ok');
  document.getElementById('scoreArea').innerHTML='<div class="sd"><div class="bs '+cls+'">'+score+'/'+total+'</div><div class="det">'+(score===total?'🎉 全对！':(pct>=80?'👍 优秀':(pct>=60?'📖 还需巩固':'💪 继续加油')))+' | 正确率 '+pct+'%</div></div>';
  renderTree();
}

// === WRONG ANSWER BOOK ===
function showWrongBook(){
  let wrongs=localStorage.getItem('coa_wrong');
  try{wrongs=JSON.parse(wrongs)||[];}catch(e){wrongs=[];}
  document.getElementById('cTitle').textContent='📋 错题本';
  document.getElementById('cBadge').textContent=wrongs.length+'题';
  let h='<div class="sec ac"><h3>错题本</h3><p class="st">共'+wrongs.length+'道错题 · 反复回顾直到全对</p>';
  if(wrongs.length===0){
    h+='<div class="sd"><div class="bs gr">🎉</div><div class="det">暂无错题，继续保持！</div></div>';
  }else{
    wrongs.forEach((w,i)=>{
      h+='<div class="wb-item"><div class="wb-q">'+(i+1)+'. ['+w.ch+'] '+w.question+'</div><div class="wb-my">你的答案：'+w.userAns+'</div><div class="wb-a">正确答案：'+w.correctAns+(w.exp?' — '+w.exp:'')+'</div><div style="font-size:10px;color:var(--t2);margin-top:4px">'+w.time+'</div></div>';
    });
    h+='<div style="margin-top:16px"><button class="bt danger" onclick="if(confirm(\'确定清空所有错题？\')){localStorage.removeItem(\'coa_wrong\');showWrongBook();}">🗑️ 清空错题本</button></div>';
  }
  h+='</div>';
  document.getElementById('content').innerHTML=h;
}

// === GRAPH MODE ===
function renderGraph(){
  document.getElementById('cTitle').textContent='🗺️ 知识图谱';
  document.getElementById('cBadge').textContent='全10章';
  let h='<div class="sec ac"><h3>计算机组成原理 知识图谱</h3><div class="mp">';
  PARTS.forEach(p=>{
    h+='<div class="mt">'+p.name+'</div>';
    CHS.filter(c=>p.chs.includes(c.id)).forEach(c=>h+='<span class="mc" onclick="selCh(\''+c.id+'\');setMode(\'notes\')">Ch'+c.n+' '+c.nm+'</span>');
  });
  h+='</div><div class="mp" style="margin-top:16px"><div class="mt">🧩 整体脉络</div>';
  h+='<span class="mc">概论</span>→<span class="mc">硬件结构</span>→<span class="mc">CPU</span>→<span class="mc">控制单元</span><br>';
  h+='<span style="font-size:12px;color:var(--t2)">自上而下：先整体→再部件→再核心→再控制</span></div></div>';
  document.getElementById('content').innerHTML=h;
}

// === SIM MODE (placeholder - will be enhanced in step 4) ===
function renderSim(){
  document.getElementById('cTitle').textContent='🎮 交互模拟器';
  document.getElementById('cBadge').textContent='6个模拟器';
  let h='<div class="sec ac"><h3>交互模拟器</h3><p class="st">选择模拟器进行交互练习</p>';
  h+='<div class="sim-selector">';
  ['数制转换','补码计算','IEEE 754 浮点数','五段流水线','Cache 映射','数据流演示'].forEach((s,i)=>{
    h+='<button onclick="runSim('+i+')"'+(i===0?' class="ac"':'')+'>'+s+'</button>';
  });
  h+='</div><div class="sim" id="simContainer"><div class="sim-body"><canvas id="simCanvas" width="600" height="300"></canvas></div><div class="sim-info" id="simInfo"></div><div class="sim-ctrl" id="simCtrl"></div></div></div>';
  document.getElementById('content').innerHTML=h;
  runSim(0);
}

function runSim(n){
  document.querySelectorAll('.sim-selector button').forEach((b,i)=>b.classList.toggle('ac',i===n));
  // SIMULATORS WILL BE IMPLEMENTED IN NEXT STEP
  let canvas=document.getElementById('simCanvas');
  if(!canvas)return;
  let ctx=canvas.getContext('2d');
  ctx.fillStyle='#111';ctx.fillRect(0,0,600,300);
  ctx.fillStyle='#8b8fa3';ctx.font='14px sans-serif';
  ctx.textAlign='center';
  let names=['数制转换模拟器','补码计算器','IEEE 754 浮点数解析器','五段流水线动画','Cache 映射模拟器','数据流演示动画'];
  ctx.fillText(names[n]+' — 即将完成',300,140);
  ctx.font='11px sans-serif';
  ctx.fillText('🦞 正在构建中...',300,170);
  document.getElementById('simInfo').textContent='点击上方按钮切换模拟器';
}

// === GUIDE MODE ===
function renderGuide(){
  document.getElementById('cTitle').textContent='🧭 学习导引';
  document.getElementById('cBadge').textContent='零基础友好';
  let h='<div class="sec ac"><h3>零基础学习路线</h3><p class="st">按照以下路径循序渐进，零基础也能学会</p>';
  // 4-stage path
  let stages=[
    {name:'第1篇 概论',chs:'Ch1-2',desc:'建立计算机整体认知。了解软硬件概念、冯·诺依曼结构、计算机发展与应用。这是所有后续知识的基础框架。',tips:'先通读不深究细节，重点是理解"计算机由哪些部分组成、如何工作"的大图景。'},
    {name:'第2篇 硬件结构',chs:'Ch3-5',desc:'深入三大硬件：总线(Ch3)是连接各部件的高速公路、存储器(Ch4)是记忆核心、I/O系统(Ch5)是对外窗口。',tips:'Ch4存储器是重点章节，Cache原理和层次结构要彻底理解，考频极高。'},
    {name:'第3篇 CPU核心',chs:'Ch6-8',desc:'进入CPU内部：Ch6运算方法是数学基础、Ch7指令系统是软硬接口、Ch8 CPU结构是执行引擎。',tips:'Ch6的补码运算和浮点数必须动手算！Ch8的流水线是难点也是重点，多看动画演示。'},
    {name:'第4篇 控制单元',chs:'Ch9-10',desc:'CU是计算机的指挥中心。Ch9学习微操作序列和时序系统、Ch10掌握组合逻辑和微程序两种设计方法。',tips:'学到这里你会豁然开朗——前面零散的知识在这里全部串联起来了。'}
  ];
  h+='<div class="guide-card">';
  stages.forEach((s,i)=>{
    h+='<div class="gp-row">';
    h+='<div class="gp-step'+(i<1?' dn':'')+'">'+(i+1)+'</div>';
    h+='<div style="flex:1"><div class="gc-title">'+s.name+' <span style="font-size:10px;color:var(--t2)">'+s.chs+'</span></div><div class="gc-body">'+s.desc+'<br><span style="color:var(--or)">💡 '+s.tips+'</span></div></div>';
    h+='</div>';
    if(i<3)h+='<div class="gp-line'+(i<1?' dn':'')+'" style="margin-left:18px;height:20px;width:2px"></div>';
  });
  h+='</div>';
  // Chapter highlights
  h+='<div class="guide-card"><div class="gc-title">⭐ 各章重点速览</div><div class="gc-body">';
  let highlights=[
    ['Ch1 概论','冯·诺依曼六大特点、五大部件、层次结构、机器字长/MIPS指标'],
    ['Ch2 发展应用','五代计算机、摩尔定律、各类应用领域'],
    ['Ch3 系统总线','三种总线分类、总线带宽计算、三种仲裁方式、同步vs异步通信'],
    ['Ch4 存储器','层次结构+局部性原理最核心！SRAM/DRAM区别、Cache三种映射'],
    ['Ch5 I/O系统','四种控制方式（查询→中断→DMA）、中断流程、DMA过程'],
    ['Ch6 运算方法','补码运算（重中之重）、Booth乘法、IEEE754、浮点加减、CLA加法器'],
    ['Ch7 指令系统','七种寻址方式+应用场景、RISC vs CISC对比（高频考点）'],
    ['Ch8 CPU结构','五段流水线、三种冒险及解决、超标量/超流水/多核'],
    ['Ch9 CU功能','取指/间址/执行/中断四周期微操作序列、三级时序系统'],
    ['Ch10 CU设计','组合逻辑vs微程序全面对比（高频考点）、微指令编码、CM结构']
  ];
  highlights.forEach(hl=>h+='<div style="margin:6px 0"><b>'+hl[0]+'：</b>'+hl[1]+'</div>');
  h+='</div></div></div>';
  document.getElementById('content').innerHTML=h;
}

// Tab buttons click handler
document.querySelectorAll('.mb').forEach(b=>b.onclick=()=>setMode(b.dataset.mode));

// INIT
renderTree();
'''

# Write output
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(prefix)
    f.write('\n')
    f.write(data_js)
    f.write('\n')
    f.write(core_js)
    f.write('\n</script></body></html>\n')

print(f"Step 3 done.")
print(f"Core JS written: renderTree, selCh, setMode, renderNotes, renderQuiz, renderGraph, renderSim, renderGuide, showWrongBook")
print(f"Data fixed: 1 CHS, 1 QUIZ, 1 PARTS, 1 QEXP")
