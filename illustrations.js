const palette = {
  bg: '#f6faf8',
  panel: '#ffffff',
  panelSoft: '#f1f6f4',
  line: '#c6d5ce',
  text: '#22313a',
  muted: '#71818c',
  teal: '#4e8f83',
  mint: '#5f9f8f',
  blue: '#5d86c9',
  amber: '#c48b2a',
  rose: '#c06a78',
  violet: '#7a6bc2',
};

function wrapSvg({ title, subtitle = '', viewBox = '0 0 760 420', body }) {
  return `
    <svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
      <defs>
        <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.panel}"/>
          <stop offset="100%" stop-color="${palette.panelSoft}"/>
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="744" height="404" rx="28" fill="${palette.bg}" stroke="${palette.line}" stroke-width="2"/>
      <text x="36" y="54" fill="${palette.text}" font-size="28" font-weight="700">${title}</text>
      ${subtitle ? `<text x="36" y="84" fill="${palette.muted}" font-size="15">${subtitle}</text>` : ''}
      ${body}
    </svg>
  `;
}

function block(x, y, w, h, label, color, sublabel = '') {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#cardGrad)" stroke="${color}" stroke-width="2"/>
    <text x="${x + w / 2}" y="${y + 28}" text-anchor="middle" fill="${color}" font-size="18" font-weight="700">${label}</text>
    ${sublabel ? `<text x="${x + w / 2}" y="${y + 54}" text-anchor="middle" fill="${palette.muted}" font-size="13">${sublabel}</text>` : ''}
  `;
}

function arrow(x1, y1, x2, y2, color = palette.muted, label = '') {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return `
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <polygon points="${x2},${y2} ${x2 - 10},${y2 - 5} ${x2 - 10},${y2 + 5}" fill="${color}" transform="rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}, ${x2}, ${y2})"/>
    ${label ? `<text x="${midX}" y="${midY - 10}" text-anchor="middle" fill="${color}" font-size="12">${label}</text>` : ''}
  `;
}

function pill(x, y, text, fill, color = palette.bg) {
  const width = Math.max(76, text.length * 14);
  return `
    <rect x="${x}" y="${y}" width="${width}" height="28" rx="14" fill="${fill}"/>
    <text x="${x + width / 2}" y="${y + 19}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700">${text}</text>
  `;
}

const POINT_ILLUSTRATIONS = {
  'ch1-s1-p2': wrapSvg({
    title: '计算机系统层次结构',
    subtitle: '从硬件到高级语言，每一层都向上提供抽象能力。',
    body: `
      ${block(52, 114, 200, 62, '高级语言级', palette.mint, 'C / Java / Python')}
      ${block(280, 114, 200, 62, '汇编语言级', palette.blue, '助记符与符号地址')}
      ${block(508, 114, 200, 62, '操作系统级', palette.amber, '资源管理与虚拟机')}
      ${block(166, 212, 200, 62, '机器语言级', palette.rose, '二进制指令流')}
      ${block(394, 212, 200, 62, '微程序级', palette.violet, '微操作与控制序列')}
      ${block(280, 310, 200, 62, '硬件级', palette.teal, '寄存器 / ALU / 存储器 / I/O')}
      ${arrow(152, 176, 266, 212, palette.muted, '翻译')}
      ${arrow(380, 176, 380, 212, palette.muted, '解释')}
      ${arrow(608, 176, 494, 212, palette.muted, '管理')}
      ${arrow(266, 274, 352, 310, palette.muted, '执行')}
      ${arrow(494, 274, 408, 310, palette.muted, '控制')}
      ${pill(70, 52, '上层看抽象', palette.mint)}
      ${pill(560, 52, '下层管实现', palette.amber)}
    `,
  }),
  'ch1-s1-p3': wrapSvg({
    title: '组成 vs 体系结构',
    subtitle: '同一套程序员可见能力，可以由不同内部实现完成。',
    body: `
      <rect x="46" y="112" width="286" height="226" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="426" y="112" width="286" height="226" rx="24" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="189" y="152" text-anchor="middle" fill="${palette.mint}" font-size="24" font-weight="700">体系结构</text>
      <text x="189" y="182" text-anchor="middle" fill="${palette.muted}" font-size="14">程序员能直接看到和使用的规则</text>
      <text x="189" y="228" text-anchor="middle" fill="${palette.text}" font-size="17">指令集</text>
      <text x="189" y="262" text-anchor="middle" fill="${palette.text}" font-size="17">数据类型</text>
      <text x="189" y="296" text-anchor="middle" fill="${palette.text}" font-size="17">寻址方式</text>
      <text x="189" y="330" text-anchor="middle" fill="${palette.text}" font-size="17">I/O 模型</text>
      <text x="569" y="152" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">计算机组成</text>
      <text x="569" y="182" text-anchor="middle" fill="${palette.muted}" font-size="14">把体系结构真正做出来的内部设计</text>
      <text x="569" y="228" text-anchor="middle" fill="${palette.text}" font-size="17">数据通路</text>
      <text x="569" y="262" text-anchor="middle" fill="${palette.text}" font-size="17">控制信号</text>
      <text x="569" y="296" text-anchor="middle" fill="${palette.text}" font-size="17">存储层次</text>
      <text x="569" y="330" text-anchor="middle" fill="${palette.text}" font-size="17">总线结构</text>
      ${arrow(332, 226, 426, 226, palette.amber, '同一 ISA 可有多种实现')}
      ${pill(272, 62, '别混淆', palette.rose)}
    `,
  }),
  'ch1-s2-p3': wrapSvg({
    title: '取指周期微操作',
    subtitle: '目标：把下一条指令从主存取到 IR，并让 PC 指向后继地址。',
    body: `
      ${block(40, 144, 110, 82, 'PC', palette.mint, '下一条地址')}
      ${block(174, 144, 110, 82, 'MAR', palette.blue, '地址寄存器')}
      ${block(308, 128, 144, 114, '主存', palette.amber, '按地址读指令')}
      ${block(476, 144, 110, 82, 'MDR', palette.rose, '数据寄存器')}
      ${block(610, 144, 110, 82, 'IR', palette.violet, '指令寄存器')}
      ${arrow(150, 185, 174, 185, palette.mint, '1 地址送出')}
      ${arrow(284, 185, 308, 185, palette.blue, '2 访存')}
      ${arrow(452, 185, 476, 185, palette.amber, '3 读出指令')}
      ${arrow(586, 185, 610, 185, palette.rose, '4 送入 IR')}
      <rect x="214" y="286" width="330" height="64" rx="18" fill="url(#cardGrad)" stroke="${palette.line}" stroke-width="2"/>
      <text x="379" y="320" text-anchor="middle" fill="${palette.text}" font-size="20" font-weight="700">同时进行：PC + 1 → PC</text>
      <text x="379" y="344" text-anchor="middle" fill="${palette.muted}" font-size="13">为下一条指令提前准备地址</text>
    `,
  }),
  'ch1-s2-p5': wrapSvg({
    title: '主存储器基本结构',
    subtitle: '地址由 MAR 给出，数据通过 MDR 进出，存储体按单元编号存放信息。',
    body: `
      ${block(52, 154, 118, 82, 'MAR', palette.blue, '地址输入')}
      ${block(52, 258, 118, 82, 'MDR', palette.rose, '数据输入 / 输出')}
      <rect x="226" y="96" width="468" height="266" rx="24" fill="url(#cardGrad)" stroke="${palette.amber}" stroke-width="2"/>
      <text x="460" y="134" text-anchor="middle" fill="${palette.amber}" font-size="24" font-weight="700">存储体</text>
      <text x="460" y="162" text-anchor="middle" fill="${palette.muted}" font-size="14">每个存储单元都有唯一地址号</text>
      <rect x="272" y="198" width="376" height="44" rx="14" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="272" y="250" width="376" height="44" rx="14" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="272" y="302" width="376" height="44" rx="14" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <text x="460" y="226" text-anchor="middle" fill="${palette.text}" font-size="16">地址 0000  →  存储字 0</text>
      <text x="460" y="278" text-anchor="middle" fill="${palette.text}" font-size="16">地址 0001  →  存储字 1</text>
      <text x="460" y="330" text-anchor="middle" fill="${palette.text}" font-size="16">地址 ...   →  存储字 n</text>
      ${arrow(170, 194, 226, 194, palette.blue, '选中单元')}
      ${arrow(170, 298, 226, 298, palette.rose, '读/写数据')}
    `,
  }),
  'ch1-s2-p6': wrapSvg({
    title: '运算器基本结构',
    subtitle: 'ACC、MQ、X 和 ALU 协同工作，不同运算时寄存器角色不同。',
    body: `
      ${block(56, 134, 124, 84, 'ACC', palette.mint, '被加数 / 结果')}
      ${block(56, 240, 124, 84, 'MQ', palette.rose, '乘数 / 商')}
      ${block(220, 187, 124, 84, 'X', palette.amber, '加数 / 除数')}
      ${block(404, 164, 300, 130, 'ALU', palette.blue, '算术运算 + 逻辑运算')}
      ${arrow(180, 176, 404, 198, palette.mint, '操作数 1')}
      ${arrow(344, 229, 404, 229, palette.amber, '操作数 2')}
      ${arrow(180, 282, 404, 260, palette.rose, '乘除辅助')}
      ${arrow(554, 294, 118, 324, palette.violet, '结果回写')}
      ${pill(498, 112, '加法：ACC + X', palette.mint)}
      ${pill(502, 320, '乘法：ACC / MQ / X 协作', palette.amber)}
    `,
  }),
  'ch3-s1-p1': wrapSvg({
    title: '什么是总线',
    subtitle: '总线就是多部件共享的一组公共传输线，用来搬运地址、数据和控制信号。',
    body: `
      ${block(52, 118, 132, 74, 'CPU', palette.mint, '处理中心')}
      ${block(52, 244, 132, 74, '主存', palette.amber, '指令与数据')}
      ${block(576, 118, 132, 74, 'I/O 接口', palette.rose, '外设连接')}
      ${block(576, 244, 132, 74, 'DMA / 外设', palette.violet, '高速交换')}
      <rect x="226" y="180" width="308" height="76" rx="22" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="380" y="212" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">系统总线</text>
      <text x="380" y="238" text-anchor="middle" fill="${palette.muted}" font-size="13">地址线 · 数据线 · 控制线</text>
      ${arrow(184, 156, 226, 192, palette.mint)}
      ${arrow(184, 282, 226, 244, palette.amber)}
      ${arrow(534, 192, 576, 156, palette.rose)}
      ${arrow(534, 244, 576, 282, palette.violet)}
      ${pill(264, 284, '共享通路，谁用先仲裁', palette.blue)}
    `,
  }),
  'ch3-s2-p3': wrapSvg({
    title: '总线带宽',
    subtitle: '带宽 = 总线宽度 × 工作频率 / 8，表示单位时间能搬多少字节。',
    body: `
      <rect x="58" y="118" width="644" height="114" rx="24" fill="url(#cardGrad)" stroke="${palette.amber}" stroke-width="2"/>
      <text x="380" y="170" text-anchor="middle" fill="${palette.text}" font-size="32" font-weight="700">带宽 = 宽度 × 频率 ÷ 8</text>
      <text x="380" y="202" text-anchor="middle" fill="${palette.muted}" font-size="15">宽度看一次传几位，频率看一秒传几次，除以 8 才得到字节数</text>
      ${block(82, 274, 184, 84, '宽度', palette.mint, '例如 32 bit')}
      ${block(288, 274, 184, 84, '频率', palette.blue, '例如 100 MHz')}
      ${block(494, 274, 184, 84, '结果', palette.rose, '400 MB/s')}
      ${arrow(266, 316, 288, 316, palette.muted, '相乘')}
      ${arrow(472, 316, 494, 316, palette.muted, '换算')}
    `,
  }),
  'ch3-s4-p1': wrapSvg({
    title: '为什么需要总线仲裁',
    subtitle: '总线是共享资源，多个主设备同时申请时，必须先决定“谁先说话”。',
    body: `
      ${block(64, 156, 126, 74, 'CPU', palette.mint, '请求总线')}
      ${block(64, 258, 126, 74, 'DMA', palette.rose, '请求总线')}
      ${block(570, 156, 126, 74, 'I/O 处理器', palette.violet, '请求总线')}
      <rect x="250" y="138" width="260" height="214" rx="24" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="380" y="180" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">仲裁器</text>
      <text x="380" y="212" text-anchor="middle" fill="${palette.muted}" font-size="14">根据优先级 / 轮询规则选出当前主设备</text>
      ${pill(312, 250, '避免总线冲突', palette.amber)}
      ${pill(308, 286, '保证次序与公平', palette.mint)}
      ${arrow(190, 192, 250, 192, palette.mint)}
      ${arrow(190, 294, 250, 294, palette.rose)}
      ${arrow(510, 192, 570, 192, palette.violet)}
      <text x="380" y="330" text-anchor="middle" fill="${palette.text}" font-size="16">获胜者得到总线使用权，其余设备继续等待</text>
    `,
  }),
  'ch4-s1-p3': wrapSvg({
    title: '存储器层次结构',
    subtitle: '离 CPU 越近，速度越快、容量越小、价格越高；离得越远则相反。',
    body: `
      <polygon points="380,92 690,336 70,336" fill="url(#cardGrad)" stroke="${palette.line}" stroke-width="2"/>
      <line x1="195" y1="276" x2="565" y2="276" stroke="${palette.line}" stroke-width="2"/>
      <line x1="258" y1="220" x2="502" y2="220" stroke="${palette.line}" stroke-width="2"/>
      <line x1="320" y1="162" x2="440" y2="162" stroke="${palette.line}" stroke-width="2"/>
      <text x="380" y="142" text-anchor="middle" fill="${palette.mint}" font-size="20" font-weight="700">寄存器</text>
      <text x="380" y="198" text-anchor="middle" fill="${palette.blue}" font-size="20" font-weight="700">Cache</text>
      <text x="380" y="254" text-anchor="middle" fill="${palette.amber}" font-size="20" font-weight="700">主存</text>
      <text x="380" y="314" text-anchor="middle" fill="${palette.rose}" font-size="20" font-weight="700">辅存 / 外存</text>
      <text x="110" y="368" fill="${palette.muted}" font-size="14">容量 ↑</text>
      <text x="200" y="368" fill="${palette.muted}" font-size="14">价格/bit ↓</text>
      <text x="528" y="368" fill="${palette.muted}" font-size="14">速度 ↓</text>
      <text x="618" y="368" fill="${palette.muted}" font-size="14">时延 ↑</text>
    `,
  }),
  'ch4-s1-p4': wrapSvg({
    title: '局部性原理',
    subtitle: '程序往往“刚用过的还会再用，附近的也快会用到”。',
    body: `
      <rect x="56" y="120" width="296" height="220" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="408" y="120" width="296" height="220" rx="24" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="204" y="162" text-anchor="middle" fill="${palette.mint}" font-size="24" font-weight="700">时间局部性</text>
      <text x="204" y="196" text-anchor="middle" fill="${palette.text}" font-size="16">刚访问过的数据 / 指令</text>
      <text x="204" y="224" text-anchor="middle" fill="${palette.text}" font-size="16">很快还可能再次访问</text>
      ${pill(144, 266, '循环变量', palette.mint)}
      ${pill(148, 304, '当前指令附近', palette.amber)}
      <text x="556" y="162" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">空间局部性</text>
      <text x="556" y="196" text-anchor="middle" fill="${palette.text}" font-size="16">当前地址附近的数据 / 指令</text>
      <text x="556" y="224" text-anchor="middle" fill="${palette.text}" font-size="16">往往接下来也会访问</text>
      ${pill(484, 266, '顺序执行', palette.blue)}
      ${pill(468, 304, '数组连续元素', palette.rose)}
    `,
  }),
  'ch4-s2-p1': wrapSvg({
    title: 'SRAM vs DRAM',
    subtitle: 'SRAM 快但贵，DRAM 慢一些但容量大，是主存的主力。',
    body: `
      <rect x="54" y="120" width="300" height="232" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="406" y="120" width="300" height="232" rx="24" fill="url(#cardGrad)" stroke="${palette.rose}" stroke-width="2"/>
      <text x="204" y="162" text-anchor="middle" fill="${palette.mint}" font-size="26" font-weight="700">SRAM</text>
      <text x="556" y="162" text-anchor="middle" fill="${palette.rose}" font-size="26" font-weight="700">DRAM</text>
      <text x="204" y="206" text-anchor="middle" fill="${palette.text}" font-size="16">触发器存储</text>
      <text x="204" y="236" text-anchor="middle" fill="${palette.text}" font-size="16">速度快 · 成本高 · 不需刷新</text>
      <text x="204" y="266" text-anchor="middle" fill="${palette.text}" font-size="16">常做 Cache</text>
      <text x="556" y="206" text-anchor="middle" fill="${palette.text}" font-size="16">电容存储</text>
      <text x="556" y="236" text-anchor="middle" fill="${palette.text}" font-size="16">容量大 · 成本低 · 需要刷新</text>
      <text x="556" y="266" text-anchor="middle" fill="${palette.text}" font-size="16">常做主存</text>
      ${pill(126, 306, '快，但单位位成本高', palette.mint)}
      ${pill(470, 306, '慢一些，但更省面积', palette.rose)}
    `,
  }),
  'ch4-s3-p2': wrapSvg({
    title: 'Cache 直接映射',
    subtitle: '主存块只能映到唯一的 Cache 行，简单快，但冲突失效率可能更高。',
    body: `
      <rect x="62" y="124" width="258" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.amber}" stroke-width="2"/>
      <rect x="438" y="124" width="258" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="191" y="162" text-anchor="middle" fill="${palette.amber}" font-size="24" font-weight="700">主存块</text>
      <text x="567" y="162" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">Cache 行</text>
      <text x="191" y="210" text-anchor="middle" fill="${palette.text}" font-size="17">块 0</text>
      <text x="191" y="248" text-anchor="middle" fill="${palette.text}" font-size="17">块 1</text>
      <text x="191" y="286" text-anchor="middle" fill="${palette.text}" font-size="17">块 2</text>
      <text x="191" y="324" text-anchor="middle" fill="${palette.text}" font-size="17">块 3 ...</text>
      <text x="567" y="210" text-anchor="middle" fill="${palette.text}" font-size="17">行 0</text>
      <text x="567" y="248" text-anchor="middle" fill="${palette.text}" font-size="17">行 1</text>
      <text x="567" y="286" text-anchor="middle" fill="${palette.text}" font-size="17">行 2</text>
      <text x="567" y="324" text-anchor="middle" fill="${palette.text}" font-size="17">行 3</text>
      ${arrow(258, 210, 438, 210, palette.mint, '块号 mod 行数')}
      ${arrow(258, 248, 438, 248, palette.mint)}
      ${arrow(258, 286, 438, 286, palette.mint)}
      ${arrow(258, 324, 438, 324, palette.mint)}
    `,
  }),
  'ch6-s1-p3': wrapSvg({
    title: '补码表示法',
    subtitle: '最高位仍是符号位，但负数按“按位取反再加 1”得到补码。',
    body: `
      <rect x="56" y="126" width="298" height="224" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="406" y="126" width="298" height="224" rx="24" fill="url(#cardGrad)" stroke="${palette.rose}" stroke-width="2"/>
      <text x="205" y="166" text-anchor="middle" fill="${palette.mint}" font-size="24" font-weight="700">正数</text>
      <text x="205" y="202" text-anchor="middle" fill="${palette.text}" font-size="22">+5 → 0000 0101</text>
      <text x="205" y="238" text-anchor="middle" fill="${palette.muted}" font-size="14">补码与原码相同</text>
      <text x="555" y="166" text-anchor="middle" fill="${palette.rose}" font-size="24" font-weight="700">负数</text>
      <text x="555" y="202" text-anchor="middle" fill="${palette.text}" font-size="20">-5 原码：1000 0101</text>
      <text x="555" y="238" text-anchor="middle" fill="${palette.text}" font-size="20">按位取反：1111 1010</text>
      <text x="555" y="274" text-anchor="middle" fill="${palette.text}" font-size="22">再加 1：1111 1011</text>
      ${pill(468, 310, '这样加减法可以统一成加法器实现', palette.amber)}
    `,
  }),
  'ch6-s2-p3': wrapSvg({
    title: 'Booth 算法核心判断',
    subtitle: '每次看乘数末两位，决定是加、减还是跳过，然后整体右移。',
    body: `
      <rect x="58" y="118" width="644" height="246" rx="24" fill="url(#cardGrad)" stroke="${palette.violet}" stroke-width="2"/>
      <text x="380" y="158" text-anchor="middle" fill="${palette.violet}" font-size="24" font-weight="700">观察 MQn 与 MQn+1</text>
      <rect x="92" y="198" width="126" height="110" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="246" y="198" width="126" height="110" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="400" y="198" width="126" height="110" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="554" y="198" width="126" height="110" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <text x="155" y="238" text-anchor="middle" fill="${palette.text}" font-size="20">00 / 11</text>
      <text x="155" y="272" text-anchor="middle" fill="${palette.muted}" font-size="14">不操作</text>
      <text x="309" y="238" text-anchor="middle" fill="${palette.text}" font-size="20">01</text>
      <text x="309" y="272" text-anchor="middle" fill="${palette.mint}" font-size="16">加被乘数</text>
      <text x="463" y="238" text-anchor="middle" fill="${palette.text}" font-size="20">10</text>
      <text x="463" y="272" text-anchor="middle" fill="${palette.rose}" font-size="16">减被乘数</text>
      <text x="617" y="238" text-anchor="middle" fill="${palette.text}" font-size="20">每轮结束</text>
      <text x="617" y="272" text-anchor="middle" fill="${palette.amber}" font-size="16">算术右移</text>
      ${arrow(218, 253, 246, 253)}
      ${arrow(372, 253, 400, 253)}
      ${arrow(526, 253, 554, 253)}
    `,
  }),
  'ch7-s2-p1': wrapSvg({
    title: '立即寻址',
    subtitle: '操作数就写在指令里，CPU 取到指令后就能直接使用。',
    body: `
      <rect x="64" y="132" width="632" height="220" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="110" y="202" width="180" height="74" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <rect x="306" y="202" width="140" height="74" rx="18" fill="${palette.panelSoft}" stroke="${palette.amber}"/>
      <rect x="462" y="202" width="188" height="74" rx="18" fill="${palette.panelSoft}" stroke="${palette.line}"/>
      <text x="200" y="192" text-anchor="middle" fill="${palette.muted}" font-size="13">指令字</text>
      <text x="200" y="244" text-anchor="middle" fill="${palette.text}" font-size="18">操作码</text>
      <text x="376" y="192" text-anchor="middle" fill="${palette.muted}" font-size="13">地址字段</text>
      <text x="376" y="244" text-anchor="middle" fill="${palette.amber}" font-size="22">#5</text>
      <text x="556" y="244" text-anchor="middle" fill="${palette.text}" font-size="18">直接当操作数</text>
      ${arrow(446, 239, 462, 239, palette.amber)}
      ${pill(178, 302, '快：不需要再访存找操作数', palette.mint)}
      ${pill(438, 302, '缺点：可表示的常数范围有限', palette.rose)}
    `,
  }),
  'ch7-s2-p5': wrapSvg({
    title: '变址寻址',
    subtitle: '有效地址 EA = 形式地址 A + 变址寄存器 IX，常用在数组和表格访问。',
    body: `
      ${block(78, 146, 156, 82, '形式地址 A', palette.amber, '指令中给出')}
      ${block(78, 254, 156, 82, 'IX', palette.mint, '偏移量')}
      ${block(306, 198, 148, 88, '加法器', palette.blue, '求 EA')}
      ${block(526, 198, 156, 88, '有效地址 EA', palette.rose, '访问目标单元')}
      ${arrow(234, 187, 306, 222, palette.amber)}
      ${arrow(234, 295, 306, 262, palette.mint)}
      ${arrow(454, 242, 526, 242, palette.rose)}
      ${pill(208, 92, '数组首地址 + 下标偏移', palette.mint)}
      ${pill(482, 320, '特别适合顺序访问表项', palette.amber)}
    `,
  }),
  'ch8-s3-p2': wrapSvg({
    title: '流水线三种冒险',
    subtitle: '资源冲突、数据相关、控制转移都会让流水线不能理想满速前进。',
    body: `
      <rect x="50" y="124" width="200" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.amber}" stroke-width="2"/>
      <rect x="280" y="124" width="200" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.rose}" stroke-width="2"/>
      <rect x="510" y="124" width="200" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.violet}" stroke-width="2"/>
      <text x="150" y="164" text-anchor="middle" fill="${palette.amber}" font-size="22" font-weight="700">结构冒险</text>
      <text x="150" y="206" text-anchor="middle" fill="${palette.text}" font-size="15">同一时刻争用同一硬件资源</text>
      <text x="150" y="244" text-anchor="middle" fill="${palette.muted}" font-size="13">例如取指与访存抢同一主存</text>
      <text x="380" y="164" text-anchor="middle" fill="${palette.rose}" font-size="22" font-weight="700">数据冒险</text>
      <text x="380" y="206" text-anchor="middle" fill="${palette.text}" font-size="15">后一条指令依赖前一条结果</text>
      <text x="380" y="244" text-anchor="middle" fill="${palette.muted}" font-size="13">例如 RAW：先写后读</text>
      <text x="610" y="164" text-anchor="middle" fill="${palette.violet}" font-size="22" font-weight="700">控制冒险</text>
      <text x="610" y="206" text-anchor="middle" fill="${palette.text}" font-size="15">分支跳转让后续取指不确定</text>
      <text x="610" y="244" text-anchor="middle" fill="${palette.muted}" font-size="13">例如 if / jump / interrupt</text>
      ${pill(102, 298, '加资源或拆资源', palette.amber)}
      ${pill(332, 298, '转发 / 暂停', palette.rose)}
      ${pill(576, 298, '预测 / 冲刷', palette.violet)}
    `,
  }),
  'ch10-s2-p5': wrapSvg({
    title: '水平型 vs 垂直型微指令',
    subtitle: '水平型并行度高但字长长，垂直型更省位但需要译码。',
    body: `
      <rect x="52" y="124" width="302" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.mint}" stroke-width="2"/>
      <rect x="406" y="124" width="302" height="228" rx="24" fill="url(#cardGrad)" stroke="${palette.blue}" stroke-width="2"/>
      <text x="203" y="164" text-anchor="middle" fill="${palette.mint}" font-size="24" font-weight="700">水平型</text>
      <text x="203" y="198" text-anchor="middle" fill="${palette.text}" font-size="16">每一位直接对应一个控制信号</text>
      <text x="203" y="230" text-anchor="middle" fill="${palette.text}" font-size="16">优点：并行控制强，执行快</text>
      <text x="203" y="262" text-anchor="middle" fill="${palette.text}" font-size="16">缺点：微指令字长较长</text>
      <text x="557" y="164" text-anchor="middle" fill="${palette.blue}" font-size="24" font-weight="700">垂直型</text>
      <text x="557" y="198" text-anchor="middle" fill="${palette.text}" font-size="16">字段编码后再译码出控制信号</text>
      <text x="557" y="230" text-anchor="middle" fill="${palette.text}" font-size="16">优点：位数省，存储更省</text>
      <text x="557" y="262" text-anchor="middle" fill="${palette.text}" font-size="16">缺点：并行度低，控制慢一点</text>
      ${pill(130, 304, '像“展开写清楚”', palette.mint)}
      ${pill(494, 304, '像“先编码再翻译”', palette.blue)}
    `,
  }),
};

export { POINT_ILLUSTRATIONS };
