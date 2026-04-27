#!/usr/bin/env python3
"""Step 2: 提取原文件数据，增强后追加到输出HTML"""
import json
OUT = "/Users/wangdada/WorkBuddy/20260427114310/计算机组成原理学习平台🦞.html"
ORIG = "/Users/wangdada/WorkBuddy/20260427103555/计算机组成原理学习平台🦞.html"

with open(ORIG, 'r', encoding='utf-8') as f:
    orig = f.read()

# 提取 CHS 数组（在 <script> 和 ; 之间）
script_start = orig.index('<script>') + len('<script>')
script_content = orig[script_start:]

# 提取 CHS 定义
chs_start = script_content.index('const CHS=')
chs_end = script_content.index('];', chs_start) + 2
chs_str = script_content[chs_start:chs_end]

# 提取 QUIZ 定义
quiz_start = script_content.index('const QUIZ=')
quiz_end = script_content.index('};', quiz_start) + 2
quiz_str = script_content[quiz_start:quiz_end]

# 提取 PARTS
parts_start = script_content.index('const PARTS=')
parts_end = script_content.index('];', parts_start) + 2
parts_str = script_content[parts_start:parts_end]

# 增强CHS数据 - 为关键知识点添加SVG和tip
svg_additions = {
    "ch1_软硬件": '''"svg":'<svg viewBox="0 0 400 130"><rect x="10" y="5" width="380" height="48" rx="8" fill="#1a1d27" stroke="#6c5ce7"/><text x="200" y="20" text-anchor="middle" fill="#a29bfe" font-size="11">软件层（应用软件 → 系统软件）</text><text x="200" y="38" text-anchor="middle" fill="#8b8fa3" font-size="9">逻辑功能等效 ↕</text><rect x="10" y="60" width="380" height="48" rx="8" fill="#1a1d27" stroke="#00b894"/><text x="200" y="80" text-anchor="middle" fill="#00b894" font-size="11">硬件层（CPU + 存储器 + I/O设备）</text><text x="200" y="98" text-anchor="middle" fill="#8b8fa3" font-size="9">物理装置，看得见摸得着</text></svg>',"tip":"💡 口诀：硬件实体软件虚，逻辑等效可互换"''',
    "ch1_冯诺依曼": '''"svg":'<svg viewBox="0 0 400 180"><rect x="130" y="8" width="140" height="36" rx="8" fill="#6c5ce7"/><text x="200" y="31" text-anchor="middle" fill="#fff" font-size="11">运算器 ALU</text><rect x="130" y="52" width="140" height="36" rx="8" fill="#00b894"/><text x="200" y="75" text-anchor="middle" fill="#fff" font-size="11">控制器 CU</text><rect x="20" y="100" width="95" height="30" rx="6" fill="#252836" stroke="#fdcb6e"/><text x="67" y="119" text-anchor="middle" fill="#fdcb6e" font-size="9">输入</text><rect x="130" y="140" width="140" height="30" rx="6" fill="#252836" stroke="#e17055"/><text x="200" y="159" text-anchor="middle" fill="#e17055" font-size="9">存储器（指令+数据）</text><rect x="285" y="100" width="95" height="30" rx="6" fill="#252836" stroke="#fdcb6e"/><text x="332" y="119" text-anchor="middle" fill="#fdcb6e" font-size="9">输出</text><line x1="200" y1="44" x2="200" y2="52" stroke="#fff" stroke-width="1"/></svg>',"tip":"💡 口诀：运控存储入出，存储程序是核心"''',
}

# 增强QUIZ - 添加题目解析
quiz_explanations = {
    # ch1
    "ch1": [
        "存储程序并按地址顺序执行是冯·诺依曼机区别于其他计算机模型的最本质特征。其他选项虽也相关，但不是最核心思想。",
        "五大部件：运算器、控制器、存储器、输入设备、输出设备。\"电源\"是供电系统不是功能部件。",
        "MAR（存储器地址寄存器）的位数直接决定可寻址的存储单元个数=2^MAR位数。存储字长由MDR位数决定。",
        "MIPS = f/(CPI×10⁶) = 2×10⁹/(4×10⁶) = 500",
        "层次从底到顶：微程序→机器语言→OS→汇编→高级语言。底层是硬件实现，上层是软件抽象。",
        "补码中[-X]补=[X]补连同符号位取反+1。这是快速求相反数补码的方法。正数补码=原码，不需取反。",
        "CPU执行时间=指令条数×CPI×时钟周期。增加Cache不会直接改变这三个参数（Cache是通过降低平均访存时间间接提升，不在此公式范畴）。",
        "硬件和软件在逻辑功能上是等效的——同一功能既可用硬件实现也可用软件模拟，这叫软硬件逻辑等价性。"
    ],
    "ch2": [
        "ENIAC于1946年2月在美国宾夕法尼亚大学问世，是第一台通用电子数字计算机。",
        "摩尔定律(Gordon Moore, 1965)：集成电路上晶体管数量约每18-24个月翻一番。",
        "第二代(1958-1964)以晶体管替代电子管，体积缩小、功耗降低、可靠性大幅提高。",
        "微型计算机的核心部件是微处理器(CPU芯片)。1971年Intel 4004标志微处理器时代开始。",
        "基因编辑属于生物技术领域，不是计算机的应用领域。科学计算、工业控制、虚拟现实都是计算机典型应用。",
        "IBM System/360(1964)首次实现了系列化兼容——不同型号的机器可运行相同的软件，是计算机历史上的里程碑。"
    ],
    "ch3": [
        "数据总线是双向传输的——CPU可以从中读数据也可以写数据。地址总线是单向的（CPU发出），控制总线每根线有固定方向。",
        "总线带宽=总线宽度×总线频率=64bit×100MHz=8B×100M=800MB/s",
        "链式查询只需3根线：BS(总线忙)、BR(总线请求)、BG(总线同意)。BG线以菊花链方式串行连接所有设备。",
        "计数器定时查询方式取消了BG线，改用设备地址线，需要log₂n根额外控制线来传输设备地址。",
        "全互锁异步通信共4步：请求→应答→撤销请求→撤销应答，形成完整的握手闭环。",
        "总线四大特性：机械特性、电气特性、功能特性、时间特性。\"价格特性\"不存在。",
        "PCIe是通信总线，用于系统与高速外设之间的点对点串行通信。",
        "独立请求方式每台设备有独立的BR和BG两根线，共2根/设备。",
        "总线复用指地址线和数据线共用同一组物理连线，分时传送地址和数据，目的是减少引脚数。"
    ],
}

# 在CHS数据中为Ch1关键知识点插入svg和tip
chs_enhanced = chs_str
# 为"计算机的软硬件概念"添加svg+tip
chs_enhanced = chs_enhanced.replace(
    '"c": "计算机系统由硬件和软件两大部分组成。硬件是计算机的实体部分',
    '"c": "<b>硬件</b>是计算机实体部分——运算器、控制器、存储器、输入输出设备等看得见摸得着的物理装置。<b>软件</b>是程序和数据，分为<b>系统软件</b>和<b>应用软件</b>。在逻辑功能上等效——这叫<b>软硬件逻辑等价性</b>。"' + ',' + svg_additions["ch1_软硬件"] + ',"c":"'
)

# 同样处理"冯·诺依曼"知识点
chs_enhanced = chs_enhanced.replace(
    '"c": "冯·诺依曼于1945年提出存储程序概念，奠定了现代计算机的基础。其核心思想有六点',
    '"c": "<b>冯·诺依曼</b>1945年提出<b>存储程序</b>概念。六大特点：①五大部件组成 ②指令和数据用二进制 ③指令含操作码和地址码 ④顺序存放PC指示 ⑤以运算器为中心 ⑥<b>存储程序按地址执行</b>——最核心特征。"' + ',' + svg_additions["ch1_冯诺依曼"] + ',"c":"'
)

# 增强QUIZ数据 - 添加解析
quiz_parts = quiz_str.split('],["ch')
enhanced_quiz = quiz_parts[0]  # 'const QUIZ={"ch1"...'
for i, part in enumerate(quiz_parts[1:], 1):
    ch_id = "ch" + str(i)
    if ch_id in quiz_explanations:
        exps = quiz_explanations[ch_id]
        # 需要为每个题目数组添加第4个元素（解析）
        # 原始格式: ["question", ["A","B","C","D"], correctIndex]
        # 增强格式: ["question", ["A","B","C","D"], correctIndex, "explanation"]
        # 这里比较复杂，直接追加到解析字典中，在JS中处理
        
        # 简化：直接在quiz数据后附加一个额外的explanations对象
        pass

enhanced_quiz = quiz_str  # 暂时保持原样，在JS中通过字典处理解析

# 追加数据到输出文件
with open(OUT, 'a', encoding='utf-8') as f:
    f.write(chs_enhanced + ';\n')
    f.write(quiz_str + ';\n')
    f.write(parts_str + ';\n')
    # 添加题目解析字典
    f.write('const QEXP=' + json.dumps(quiz_explanations, ensure_ascii=False) + ';\n')

print("Step 2 done. Data appended.")
print(f"CHS length: {len(chs_enhanced)}, QUIZ length: {len(quiz_str)}")
