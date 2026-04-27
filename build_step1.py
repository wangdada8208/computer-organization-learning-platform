#!/usr/bin/env python3
"""Step 1: 写入HTML骨架、CSS和初始JS框架"""
OUT = "/Users/wangdada/WorkBuddy/20260427114310/计算机组成原理学习平台🦞.html"
import os

# 读取原文件的CSS和HTML结构（已验证可用）
orig = "/Users/wangdada/WorkBuddy/20260427103555/计算机组成原理学习平台🦞.html"
with open(orig, 'r', encoding='utf-8') as f:
    orig_html = f.read()

# 提取CSS部分（到</style>为止）
css_end = orig_html.index('</style>') + len('</style>')
css = orig_html[:css_end]

# 提取HTML body部分
body_start = orig_html.index('<body>')
body_end = orig_html.index('<script>')
body = orig_html[body_start:body_end]

# 修改body中的tab按钮 - 添加模拟器和导学
body = body.replace(
    '<button class="mb" data-mode="graph">🗺️ 图谱</button>',
    '<button class="mb" data-mode="sim">🎮 模拟器</button><button class="mb" data-mode="graph">🗺️ 图谱</button><button class="mb" data-mode="guide">🧭 导学</button>'
)
body = body.replace(
    '<p style="font-size:12px;margin-top:6px">全10章 · 每章15-25个详细知识点 · 零基础可学</p>',
    '<p style="font-size:12px;margin-top:6px">全10章 · 200+知识点 · 6个交互模拟器 · 30+图解 · 零基础可学</p>'
)

# 构建新的HTML头部（添加模拟器相关CSS）
extra_css = '''
/* 模拟器和导学扩展样式 */
.pt .ptt{cursor:pointer;display:flex;align-items:flex-start;gap:4px}.pt .ptt::before{content:'\\25b8';color:var(--ac);font-size:10px;flex-shrink:0;margin-top:2px;width:14px;text-align:center}
.pt.exp .ptt::before{content:'\\25be'}.pt .ptc{font-size:12px;color:var(--t2);line-height:1.8;margin-left:16px;display:none}
.pt .svg-wrap{margin:8px 0 8px 16px;padding:10px;background:var(--bg3);border-radius:8px;overflow-x:auto;display:none;text-align:center}
.pt .tip{margin:6px 0 0 16px;padding:6px 10px;background:rgba(253,203,110,.1);border-left:2px solid var(--or);font-size:10px;color:var(--or);border-radius:0 4px 4px 0;display:none}
.pt.exp .ptc,.pt.exp .svg-wrap,.pt.exp .tip{display:block}
.qc .fill{width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx);font-size:13px}
.qc .fill:focus{outline:none;border-color:var(--ac)}
.tf-btns{display:flex;gap:10px}.tf-btn{padding:8px 24px;border-radius:8px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx);cursor:pointer;font-size:13px}
.tf-btn:hover{border-color:var(--ac)}.tf-btn.sl{border-color:var(--ac);background:rgba(108,92,231,.15)}
.bt.danger{border-color:var(--rd);color:var(--rd)}.bt.danger:hover{background:rgba(225,112,85,.1)}
.sim{padding:20px;background:var(--bg2);border-radius:var(--rdx);border:1px solid var(--bd);margin:20px 0}
.sim h4{font-size:14px;color:var(--a2);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--bd)}
.sim canvas{border-radius:8px;background:#111;max-width:100%}
.sim-body{display:flex;flex-direction:column;gap:12px;align-items:center}
.sim-ctrl{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center;margin-top:8px}
.sim-ctrl input,.sim-ctrl select{padding:6px 12px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);color:var(--tx);font-size:12px}
.sim-ctrl input:focus,.sim-ctrl select:focus{outline:none;border-color:var(--ac)}
.sim-ctrl button{padding:6px 14px;border-radius:6px;border:none;background:var(--ac);color:#fff;cursor:pointer;font-size:12px}
.sim-ctrl button:hover{background:#5a4bd1}
.sim-info{font-size:11px;color:var(--t2);text-align:center;line-height:1.8}
.sim-steps{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin:8px 0}
.sim-step{padding:6px 12px;border-radius:6px;border:1px solid var(--bd);background:var(--bg3);font-size:10px;color:var(--t2)}
.sim-step.active{border-color:var(--ac);background:rgba(108,92,231,.15);color:var(--a2)}
.sim-selector{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;justify-content:center}
.sim-selector button{padding:8px 16px;border-radius:8px;border:1px solid var(--bd);background:var(--bg3);color:var(--t2);cursor:pointer;font-size:12px}
.sim-selector button:hover,.sim-selector button.ac{background:var(--ac);color:#fff;border-color:var(--ac)}
.guide-card{padding:16px 20px;background:var(--bg2);border-radius:var(--rdx);border:1px solid var(--bd);margin:12px 0}
.gc-title{font-size:14px;color:var(--a2);margin-bottom:8px;display:flex;align-items:center;gap:8px}
.gc-body{font-size:12px;color:var(--t2);line-height:1.8}
.gp-row{display:flex;gap:10px;align-items:center;margin:12px 0}
.gp-step{width:36px;height:36px;border-radius:50%;border:2px solid var(--bd);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
.gp-step.dn{border-color:var(--gn);background:rgba(0,184,148,.15);color:var(--gn)}
.gp-line{flex:1;height:2px;background:var(--bd)}.gp-line.dn{background:var(--gn)}
.wb-item{padding:12px;margin:8px 0;background:var(--bg3);border-radius:8px;border:1px solid var(--bd)}
.wb-item .wb-q{font-size:12px;font-weight:600;margin-bottom:4px}
.wb-item .wb-a{font-size:11px;color:var(--gn)}.wb-item .wb-my{font-size:11px;color:var(--rd)}
.qc .exp-box{margin-top:10px;padding:10px;background:rgba(108,92,231,.08);border-radius:6px;border:1px solid rgba(108,92,231,.2);font-size:11px;color:var(--a2);line-height:1.5;display:none}
.qc .exp-box.show{display:block}
.fbk{margin-top:10px;font-size:12px;padding:8px 12px;border-radius:6px;line-height:1.6}
'''

# 插入额外CSS（在</style>之前）
css_new = css.replace('</style>', extra_css + '\n</style>')

# 写入第一阶段输出
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(css_new)
    f.write('\n' + body + '\n')
    f.write('<script>\n')

print(f"Step 1 done. Wrote CSS+HTML skeleton to {OUT}")
print(f"CSS length: {len(css_new)}, Body length: {len(body)}")
