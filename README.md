# 计算机组成原理学习平台 🦞

> **基于唐朔飞《计算机组成原理》（第3版）教材的交互式学习平台**  
> 全10章 · 200+知识点 · 30+ SVG 图解 · 6个交互模拟器 · 零基础可学

[![GitHub stars](https://img.shields.io/github/stars/wangdada8208/computer-organization-platform?style=flat-square)](https://github.com/wangdada8208/computer-organization-platform/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

---

## 🚀 快速体验

直接打开即可使用，无需安装任何软件：

**👉 [https://wangdada8208.xyz](https://wangdada8208.xyz)**

---

## ✨ 功能概览

### 📒 笔记模式
- 10章完整知识点，按教材章节结构组织
- 每章开头有内容概览和页码索引
- **可折叠知识点卡片**——先看标题回忆，点击展开查看详细内容
- **30+ 内嵌 SVG 图解**——冯·诺依曼结构、总线仲裁、存储器层次等核心概念一目了然
- **学习提示**——关键知识点配有口诀和记忆技巧

### ✍️ 刷题模式
- **300+ 道选择题**覆盖全部10章，每题含详细解析
- **判断题 + 填空题**混合题型，全面检验知识掌握程度
- **自动评分**——交卷后即时出分，答案高亮（绿=正确/红=错误）
- **解析展开**——每道题配有知识讲解，不懂的题一键看解析
- **错题本**——自动记录做错的题目，方便针对性复习
- **重做功能**——随时重新刷题

### 🎮 模拟器模式
- **6个交互式硬件模拟器**，在浏览器中直观理解硬件工作原理：
  - 寄存器传送级模拟
  - 加法器/ALU 模拟
  - 存储器读写模拟
  - 总线仲裁模拟
  - 指令流水线模拟
  - 中断处理模拟

### 🗺️ 知识图谱
- 可视化展示知识点之间的关联关系
- 帮助建立计算机组成原理的整体知识框架

### 🧭 导学模式
- 引导式学习路径，按"是什么→为什么→怎么用"三步走
- 明确每个知识点的学习目标和掌握要求

### 📊 学习进度追踪
- 自动记录每个章节的完成状态
- 进度条实时显示整体完成度（浏览器 localStorage 持久化）
- 支持跨会话的进度保持
- 支持注册账号、登录同步、跨设备恢复学习进度

---

## 📖 章节结构

按教材组织，分为四篇共10章：

| 篇章 | 章 | 内容 | 页码 |
|------|----|------|------|
| **📘 概论** | 第1章 | 计算机系统概论 | P3-19 |
| | 第2章 | 计算机的发展及应用 | P20-40 |
| **📙 硬件结构** | 第3章 | 系统总线 | P41-67 |
| | 第4章 | 存储器 | P68-123 |
| | 第5章 | 输入输出系统 | P124-180 |
| **📗 CPU** | 第6章 | 计算机的运算方法 | P181-260 |
| | 第7章 | 指令系统 | P261-336 |
| | 第8章 | CPU的结构和功能 | P337-374 |
| **📕 控制单元** | 第9章 | 控制单元的功能 | P375-394 |
| | 第10章 | 控制单元的设计 | P395-422 |

---

## 🛠️ 交互特性

### SVG 图解一览

平台内置 30+ 精心设计的 SVG 矢量图，涵盖所有核心概念：

- 冯·诺依曼计算机硬件框图
- 计算机系统层次结构
- 总线的三线结构（数据/地址/控制）
- 链式查询/计数器定时查询/独立请求仲裁示意图
- 存储器层次结构金字塔
- Cache-主存地址映射（直接映射/组相联）
- DMA 工作流程
- 补码加减运算的溢出判断
- 指令流水线的五段结构
- 中断响应与处理流程
- RISC vs CISC 对比
- 组合逻辑 vs 微程序控制对比
- ……

### 响应式设计

- **桌面端（>1024px）**：经典左右分栏布局，侧边栏常驻
- **平板（768-1024px）**：侧边栏可折叠，内容区自适应
- **手机（<768px）**：抽屉式侧边栏，触摸友好
- 支持汉堡菜单切换

### 视觉风格

- 深色主题（Dark Mode），保护视力
- 紫色系主色调（#6c5ce7），配合绿/橙/红语义色
- 代码风格知识点卡片，沉浸式阅读体验

---

## 🖥️ 本地使用

### 方式一：直接打开（推荐）
1. 下载 `计算机组成原理学习平台🦞.html` 到本地
2. 双击用浏览器打开即可使用
3. 所有数据存储在浏览器中，离线也可使用

### 方式二：Python 构建（进阶）
平台附带 3 个构建脚本，可用于重新生成 HTML 文件：

```bash
# 按顺序执行
python3 build_step1.py   # 写入 HTML 骨架、CSS 和初始 JS 框架
python3 build_step2.py   # 提取原文件数据，增强后追加
python3 build_step3.py   # 修复重复、加入核心 JS 逻辑、闭合 HTML
```

构建脚本用于从原始源文件二次加工，普通用户无需执行。

---

## 📦 技术栈

| 方面 | 技术 |
|------|------|
| 前端 | 纯 HTML + CSS + JavaScript |
| 后端 | Python 标准库 API + SQLite |
| 图表 | 内嵌 SVG 矢量图 |
| 存储 | 浏览器 localStorage + 账号云同步 |
| 依赖 | 无 npm 依赖，后端无需额外 Python 包 |
| 兼容 | 所有现代浏览器（Chrome/Firefox/Safari/Edge） |

---

## 🌐 部署

### 在线访问
- **域名**：[https://wangdada8208.xyz](https://wangdada8208.xyz)
- **HTTPS**：Let's Encrypt 自动续期
- **反向代理**：Nginx，HTTP 301 自动跳转 HTTPS
- **账号同步 API**：同域名 `/api/*`，由 Python 服务提供

### GitHub
- 仓库：[https://github.com/wangdada8208/computer-organization-platform](https://github.com/wangdada8208/computer-organization-platform)
- 欢迎 Star ⭐ 和 Fork！

---

## 🗂️ 项目文件结构

```
computer-organization-platform/
├── index.html                        # 静态站入口
├── app.js                            # 前端状态、渲染、同步逻辑
├── styles.css                        # 样式
├── data/                             # 章节与题库数据
├── backend/                          # 账号与进度同步 API
├── ops/                              # 服务器部署脚本
├── 计算机组成原理学习平台🦞.html   # 旧单文件版本
├── build_step1.py                    # 构建脚本 1：骨架写入
├── build_step2.py                    # 构建脚本 2：数据增强
├── build_step3.py                    # 构建脚本 3：逻辑补充
├── README.md                         # 本文件
└── .gitignore                        # Git 忽略规则
```

---

## 📜 许可证

本项目基于 MIT 许可证开源。详见 [LICENSE](LICENSE) 文件。

```
MIT License

Copyright (c) 2026 wangdada8208

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files...
```

---

## 🤝 贡献

- 发现了 Bug？[提交 Issue](https://github.com/wangdada8208/computer-organization-platform/issues)
- 有改进想法？欢迎 Pull Request
- 觉得有用的话，点个 ⭐ 支持一下！

---

*基于唐朔飞《计算机组成原理》（第3版）教材 · 适用于期末复习、考研备考、自学入门*
