export const SIMULATORS = [
  {
    id: 'sim-base',
    title: '数制转换器',
    summary: '把十进制整数实时拆成二进制、八进制、十六进制，帮助建立位和分组的直觉。',
    concept: '输入一个十进制整数，观察它在不同进制下的等价值表示。',
    observe: ['二进制每 4 位天然对应 1 位十六进制。', '负数最终仍要落到机器编码中去理解。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const input = createNumberInput('输入十进制整数', '42');
        input.addEventListener('input', draw);
        return { controls: [input], draw };
        function draw() {
          const value = parseInt(input.value || '0', 10) || 0;
          clearCanvas(ctx);
          drawTitle(ctx, '数制转换器');
          drawText(ctx, 24, 70, '十进制: ' + value, '#f8fafc', 22);
          const binary = value.toString(2);
          const grouped = binary.split('').reverse().reduce((acc, ch, index) => {
            acc.push(ch);
            if (index % 4 === 3 && index !== binary.length - 1) acc.push(' ');
            return acc;
          }, []).reverse().join('');
          drawText(ctx, 24, 116, '二进制: ' + binary, '#93c5fd', 18);
          drawText(ctx, 24, 146, '分组: ' + grouped, '#cbd5e1', 14);
          drawText(ctx, 24, 190, '十六进制: 0x' + value.toString(16).toUpperCase(), '#fbbf24', 18);
          drawText(ctx, 24, 222, '八进制: 0' + value.toString(8), '#5eead4', 18);
          return value < 0 ? '提示：负数最终要结合补码一起理解。' : '观察二进制每 4 位如何映射到十六进制。';
        }
      });
    },
  },
  {
    id: 'sim-complement',
    title: '补码计算器',
    summary: '输入整数和位宽，直观看原码、反码、补码三种表示。',
    concept: '把负数最容易出错的“符号位”和“加一”步骤拆开看。',
    observe: ['非负数时原码、反码、补码相同。', '负数补码 = 反码 + 1。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const input = createNumberInput('输入十进制数', '-7');
        const width = document.createElement('select');
        width.className = 'input';
        [8, 16, 32].forEach((bits) => {
          const option = document.createElement('option');
          option.value = String(bits);
          option.textContent = bits + ' 位';
          width.appendChild(option);
        });
        [input, width].forEach((el) => el.addEventListener('input', draw));
        return { controls: [input, width], draw };
        function draw() {
          const value = parseInt(input.value || '0', 10) || 0;
          const bits = parseInt(width.value || '8', 10);
          clearCanvas(ctx);
          drawTitle(ctx, '补码计算器');
          const mask = bits >= 32 ? 0xffffffff : (1 << bits) - 1;
          const signMask = 1 << (bits - 1);
          const abs = Math.abs(value);
          const original = value >= 0 ? (value & mask) : (signMask | abs) & mask;
          const inverse = value >= 0 ? original : (original ^ (mask ^ signMask)) & mask;
          const complement = value >= 0 ? original : (inverse + 1) & mask;
          drawText(ctx, 24, 56, '真值: ' + value, '#f8fafc', 20);
          [
            ['原码', original, '#60a5fa'],
            ['反码', inverse, '#f59e0b'],
            ['补码', complement, '#34d399'],
          ].forEach(([label, num, color], rowIndex) => {
            const y = 96 + rowIndex * 56;
            drawText(ctx, 24, y - 8, label, color, 15);
            drawBitRow(ctx, 24, y, bits, num >>> 0, color);
          });
          return value >= 0 ? '非负数时三种编码完全一致。' : '重点盯住最高位和“反码再加一”这一步。';
        }
      });
    },
  },
  {
    id: 'sim-float',
    title: 'IEEE 754 浮点解析',
    summary: '把浮点数拆成符号位、阶码、尾数三段，理解范围和精度怎么来的。',
    concept: '输入一个十进制浮点数，系统会展示单精度格式下的 S / E / M 字段。',
    observe: ['阶码影响表示范围。', '尾数影响表示精度。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const input = document.createElement('input');
        input.className = 'input';
        input.placeholder = '输入浮点数';
        input.value = '-12.375';
        input.addEventListener('input', draw);
        return { controls: [input], draw };
        function draw() {
          const value = Number.parseFloat(input.value);
          clearCanvas(ctx);
          drawTitle(ctx, 'IEEE 754 单精度');
          if (Number.isNaN(value)) {
            drawText(ctx, 24, 90, '请输入有效浮点数', '#fca5a5', 18);
            return '输入合法数字后，系统会自动分解 S / E / M。';
          }
          const buffer = new ArrayBuffer(4);
          const view = new DataView(buffer);
          view.setFloat32(0, value, false);
          const raw = view.getUint32(0, false);
          const sign = (raw >>> 31) & 1;
          const exponent = (raw >>> 23) & 0xff;
          const mantissa = raw & 0x7fffff;
          drawSegment(ctx, 24, 68, 86, 32, '#60a5fa', 'S ' + sign);
          drawSegment(ctx, 120, 68, 186, 32, '#f59e0b', 'E ' + exponent.toString(2).padStart(8, '0'));
          drawSegment(ctx, 316, 68, 260, 32, '#34d399', 'M ' + mantissa.toString(2).padStart(23, '0'));
          const actualExp = exponent - 127;
          drawText(ctx, 24, 140, '符号位: ' + (sign ? '负数' : '正数'), '#f8fafc', 16);
          drawText(ctx, 24, 172, '阶码: ' + exponent + ' -> 实际指数 ' + actualExp, '#fde68a', 16);
          drawText(ctx, 24, 204, '尾数: 1.' + mantissa.toString(2).padStart(23, '0').slice(0, 14) + '...', '#bbf7d0', 16);
          drawText(ctx, 24, 236, '十进制还原: ' + value, '#93c5fd', 18);
          return '把阶码理解成“范围旋钮”，尾数理解成“精度旋钮”。';
        }
      });
    },
  },
  {
    id: 'sim-pipeline',
    title: '五段流水线',
    summary: '用 IF / ID / EX / MEM / WB 五格动画观察指令推进。',
    concept: '点击单步或自动播放，观察多条指令如何在不同阶段并行推进。',
    observe: ['流水线提升的是吞吐，不是单条指令时延。', '冒险出现时会让某些格子停顿。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const state = { tick: 0, queue: ['ADD', 'SUB', 'LW', 'SW', 'AND', 'OR'], rows: [], timer: null };
        const play = button('自动播放');
        const step = button('单步');
        const reset = button('重置', 'ghost');
        play.addEventListener('click', toggle);
        step.addEventListener('click', advance);
        reset.addEventListener('click', hardReset);
        return { controls: [play, step, reset], draw: hardReset, cleanup: () => clearTimeout(state.timer) };
        function toggle() {
          if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
            play.textContent = '自动播放';
          } else {
            play.textContent = '暂停';
            loop();
          }
        }
        function loop() { advance(); state.timer = setTimeout(loop, 900); }
        function hardReset() {
          clearTimeout(state.timer);
          state.timer = null;
          play.textContent = '自动播放';
          state.tick = 0;
          state.rows = [{ name: state.queue[0], stage: 0 }];
          return draw();
        }
        function advance() {
          state.tick += 1;
          state.rows = state.rows.map((row) => ({ ...row, stage: row.stage + 1 })).filter((row) => row.stage < 5);
          if (state.tick % 2 === 0) state.rows.push({ name: state.queue[(state.tick / 2) % state.queue.length], stage: 0 });
          return draw();
        }
        function draw() {
          clearCanvas(ctx);
          drawTitle(ctx, '五段流水线');
          const stages = ['IF', 'ID', 'EX', 'MEM', 'WB'];
          stages.forEach((stage, index) => {
            drawSegment(ctx, 88 + index * 98, 46, 84, 34, ['#60a5fa','#38bdf8','#34d399','#f59e0b','#f472b6'][index], stage);
          });
          state.rows.slice(0, 5).forEach((row, rowIndex) => {
            const y = 96 + rowIndex * 42;
            drawText(ctx, 22, y + 18, row.name, '#e2e8f0', 14);
            for (let i = 0; i < 5; i += 1) {
              drawStroke(ctx, 88 + i * 98, y, 84, 30, '#334155');
              if (row.stage === i) drawSegment(ctx, 88 + i * 98, y, 84, 30, '#2563eb', row.name);
            }
          });
          return '当前周期 ' + state.tick + '。观察一条指令离开后，后面的指令如何接上来。';
        }
      });
    },
  },
  {
    id: 'sim-cache',
    title: 'Cache 映射',
    summary: '输入地址，查看它在直接映射和组相联中如何拆成标记位、组号、块内偏移。',
    concept: '同一个地址在不同映射方式下会得到不同的组号和路号。',
    observe: ['块内偏移通常在低位。', '路数变多后，组号位数会减少。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const addr = document.createElement('input');
        addr.className = 'input';
        addr.value = '0xA3F8';
        const mode = document.createElement('select');
        mode.className = 'input';
        ['直接映射', '2 路组相联', '4 路组相联'].forEach((label) => {
          const option = document.createElement('option');
          option.textContent = label;
          mode.appendChild(option);
        });
        [addr, mode].forEach((el) => el.addEventListener('input', draw));
        return { controls: [addr, mode], draw };
        function draw() {
          const raw = Number.parseInt(addr.value, 16);
          clearCanvas(ctx);
          drawTitle(ctx, 'Cache 映射');
          if (Number.isNaN(raw)) {
            drawText(ctx, 24, 100, '请输入合法的十六进制地址', '#fda4af', 18);
            return '示例：0xA3F8';
          }
          const ways = [1, 2, 4][mode.selectedIndex];
          const offsetBits = 4;
          const lineBits = 12;
          const wayBits = ways === 1 ? 0 : Math.log2(ways);
          const setBits = lineBits - wayBits;
          const tagBits = 32 - offsetBits - setBits - wayBits;
          const offset = raw & ((1 << offsetBits) - 1);
          const set = (raw >> offsetBits) & ((1 << setBits) - 1);
          drawSegment(ctx, 24, 68, Math.max(100, tagBits * 8), 34, '#60a5fa', 'Tag ' + tagBits + 'b');
          drawSegment(ctx, 140, 68, Math.max(90, setBits * 10), 34, '#f59e0b', 'Set ' + setBits + 'b');
          if (wayBits > 0) drawSegment(ctx, 250, 68, 70, 34, '#34d399', 'Way ' + wayBits + 'b');
          drawSegment(ctx, 336, 68, 84, 34, '#c084fc', 'Off 4b');
          drawText(ctx, 24, 138, '地址: 0x' + raw.toString(16).toUpperCase().padStart(8, '0'), '#e2e8f0', 17);
          drawText(ctx, 24, 170, '组号: ' + set + ' | 偏移: ' + offset + ' | 路数: ' + ways, '#cbd5e1', 16);
          drawText(ctx, 24, 206, '映射方式: ' + mode.options[mode.selectedIndex].text, '#93c5fd', 16);
          return '组号负责“落到哪一组”，标记位负责“是不是我要找的那块”。';
        }
      });
    },
  },
  {
    id: 'sim-fetch',
    title: '取指数据通路',
    summary: '把 PC → MAR → 主存 → MDR → IR → CU 的取指流程画出来。',
    concept: '单步点击后，数据会沿着取指路径逐步前进，帮助记忆微操作顺序。',
    observe: ['顺序一定是先地址后数据。', 'IR 取到指令后，CU 才能开始译码。'],
    mount(container) {
      mountCanvasSimulator(container, this, (ctx) => {
        const state = { tick: 0 };
        const step = button('单步');
        const reset = button('重置', 'ghost');
        step.addEventListener('click', () => { state.tick = Math.min(5, state.tick + 1); draw(); });
        reset.addEventListener('click', () => { state.tick = 0; draw(); });
        return { controls: [step, reset], draw };
        function draw() {
          clearCanvas(ctx);
          drawTitle(ctx, '取指数据通路');
          [
            ['PC', 28, 74, '#60a5fa'],
            ['MAR', 138, 74, '#f59e0b'],
            ['主存', 258, 64, '#34d399'],
            ['MDR', 392, 74, '#c084fc'],
            ['IR', 510, 74, '#fb7185'],
            ['CU', 510, 156, '#facc15'],
          ].forEach(([label, x, y, color]) => drawSegment(ctx, x, y, 84, 36, color, label));
          drawArrow(ctx, 112, 92, 138, 92, state.tick >= 1 ? '#38bdf8' : '#475569');
          drawArrow(ctx, 222, 92, 258, 92, state.tick >= 2 ? '#f59e0b' : '#475569');
          drawArrow(ctx, 342, 92, 392, 92, state.tick >= 3 ? '#34d399' : '#475569');
          drawArrow(ctx, 476, 92, 510, 92, state.tick >= 4 ? '#c084fc' : '#475569');
          drawArrow(ctx, 552, 110, 552, 156, state.tick >= 5 ? '#fb7185' : '#475569');
          const steps = [
            '1. PC 把下一条指令地址送进 MAR。',
            '2. MAR 把地址送到主存。',
            '3. 主存把指令内容读到 MDR。',
            '4. MDR 把指令交给 IR。',
            '5. IR 把指令交给 CU 译码。',
          ];
          drawText(ctx, 24, 244, steps[Math.max(0, state.tick - 1)] || '点击单步，从 PC 开始走完整个取指过程。', '#e2e8f0', 16);
          return '当前已完成 ' + state.tick + '/5 步。考试时把这五步顺序背熟。';
        }
      });
    },
  },
];

export function mountSimulator(simulatorId, mountPoint) {
  const simulator = SIMULATORS.find((item) => item.id === simulatorId) || SIMULATORS[0];
  if (typeof mountPoint._simCleanup === 'function') mountPoint._simCleanup();
  mountPoint.innerHTML = '';
  simulator.mount(mountPoint);
}

function mountCanvasSimulator(container, simulator, factory) {
  const stage = document.createElement('div');
  stage.className = 'sim-stage';
  const intro = document.createElement('section');
  intro.className = 'card';
  intro.innerHTML = `
    <h3>${simulator.title}</h3>
    <p class="lead">${simulator.concept}</p>
    <div class="action-row" data-toolbar></div>
    <canvas width="720" height="280"></canvas>
    <p class="footer-note" data-feedback></p>
  `;
  const help = document.createElement('section');
  help.className = 'sim-help';
  help.innerHTML = `
    <div class="card"><h4>这个模拟器解决什么问题</h4><p class="lead">${simulator.summary}</p></div>
    <div class="card"><h4>观察要点</h4><ul>${simulator.observe.map((item) => `<li>${item}</li>`).join('')}</ul></div>
  `;
  stage.appendChild(intro);
  stage.appendChild(help);
  container.appendChild(stage);

  const toolbar = intro.querySelector('[data-toolbar]');
  const feedback = intro.querySelector('[data-feedback]');
  const ctx = intro.querySelector('canvas').getContext('2d');
  const mounted = factory(ctx);
  (mounted.controls || []).forEach((control) => {
    if (control.classList?.contains('btn')) {
      toolbar.appendChild(control);
    } else {
      const wrapper = document.createElement('div');
      wrapper.style.minWidth = '180px';
      wrapper.appendChild(control);
      toolbar.appendChild(wrapper);
    }
  });
  const draw = mounted.draw || (() => '');
  const redraw = () => { feedback.textContent = draw() || ''; };
  redraw();
  container._simCleanup = mounted.cleanup || null;
  mounted.controls?.forEach((control) => control.addEventListener?.('change', redraw));
}

function createNumberInput(placeholder, value) {
  const input = document.createElement('input');
  input.type = 'number';
  input.placeholder = placeholder;
  input.value = value;
  input.className = 'input';
  return input;
}
function button(label, tone = '') {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = ['btn', tone].filter(Boolean).join(' ');
  element.textContent = label;
  return element;
}
function clearCanvas(ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function drawTitle(ctx, title) {
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '600 18px sans-serif';
  ctx.fillText(title, 24, 34);
}
function drawText(ctx, x, y, text, color = '#cbd5e1', size = 14) {
  ctx.fillStyle = color;
  ctx.font = `${size}px sans-serif`;
  ctx.fillText(text, x, y);
}
function drawStroke(ctx, x, y, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}
function drawSegment(ctx, x, y, w, h, color, label) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 10, true, false);
  ctx.fillStyle = '#0f172a';
  ctx.font = '600 12px sans-serif';
  ctx.fillText(label, x + 12, y + 21);
}
function drawBitRow(ctx, x, y, bits, num, color) {
  const cellWidth = Math.max(12, Math.floor(520 / bits));
  for (let index = 0; index < bits; index += 1) {
    const bit = (num >>> (bits - index - 1)) & 1;
    ctx.fillStyle = bit ? color : '#334155';
    roundRect(ctx, x + index * cellWidth, y, cellWidth - 2, 28, 6, true, false);
  }
}
function drawArrow(ctx, x1, y1, x2, y2, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - 10 * Math.cos(angle - Math.PI / 6), y2 - 10 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - 10 * Math.cos(angle + Math.PI / 6), y2 - 10 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
