# Treatment：故事、歌曲、画面

> 状态：阶段 1 初稿（2026-09-30，C 写）。Tim 已定：风格 A、主题句 H1、Clawd 第一人称。故事的 bug 和歌词稿没有单独确认，默认按现稿进阶段 2。

## 一句话
Clawd（Claude Code 的橙色像素小螃蟹）从接到 issue 写到合并，唱的是自己的一天。歌是英文的，风格参照 pdoom 的 Claude-Pop 版本，时长约 2 分钟。

## 音乐参考：pdoom（Claude-Pop 版，Suno 制作）
原曲在 `reference/pdoom/audio/pdoom.mp3`，只供本地参考。下面是**客观数据**，来自 `reference/pdoom/data/audio.json`、`lyrics.json`，以及上游 `analysis/analyze.py` 的注释。2026-09-30 按数据复核过，和上游注释不一致的地方以数据为准：

- 132 BPM，4/4 拍，全长 156.7 秒，速度恒定。
- 和弦：主歌是 Eb–Bb–Cm–Ab（Eb 大调的 I–V–vi–IV），每个和弦 2 小节。
- 编曲上的「招数」：
  - **主歌 1 整段没有鼓**，鼓在预副歌才进来。鼓的包络在第 0–8 小节都是 0.00，第 9 小节（预副歌第一小节）起升到约 0.2；底鼓计数也是从第 9 小节开始。上游注释写的是「no drums until bar 7」，和数据不符。
  - 预副歌只有 3 小节。
  - **弱起和贝斯停都在副歌的第 1 小节里**，不在副歌之前。预副歌结束后，副歌第 1 小节是「停顿 + 弱起」小节：贝斯在第 2–4 拍降到约 0（包络 0.00–0.01），同时唱出「I'm up-ping my P-」这 5 个音节，从第 2 拍后半开始；主题词「DOOM」落在副歌第 2 小节的第 1 拍。四遍副歌的位置完全一样。
  - 第三段预副歌是 breakdown：鼓和贝斯都退出（第 49–51 小节底鼓计数为 0）。
  - 第三遍副歌做成安静版：轻鼓、没有贝斯。
  - 最后一遍副歌结尾有一个停顿小节，接着是全乐队的尾奏。
- 段落（小节数）：前奏 1 / 主歌 8 / 预副歌 3 / 副歌 8 / 过门 1 / 主歌 8 / 预副歌 3 / 副歌 9 / 主歌 8 / 预副歌 3 / 副歌（安静版）8 / 桥段 8 / 副歌 9 / 尾奏 约 7 + 渐弱。
- 歌词密度：46 行、227 个词、157 秒。副歌每行 4–5 个词，大约 1–2 小节一行。

**Claude 听不到的部分**，即音色、人声质感、配器和情绪，由 Tim 描述。Tim 的关键词（2026-09-30）是**欢快、电子**，展开后的候选见下文「风格候选」。

## Suno v6 怎么写（资料核实，2026-09-30）

只采信 2026-09-09（v6 发布）之后的资料。v6 才出来三周，下面大多是用户实测报告，不是官方规格。**官方明确的只有 Variety 和 Max Mode 两条。**

### 来源

| # | 来源 | 日期 | 性质 |
|---|---|---|---|
| S1 | [Suno 官方发布说明](https://suno.com/release-notes/introducing-v6) | 2026-09-09 | 官方 |
| S2 | [Suno 官方 v6 FAQ](https://help.suno.com/en/articles/13924481) | v6 发布后（页面无日期） | 官方 |
| S3 | [HookGenius：发布当天实测](https://hookgenius.app/learn/suno-v6-guide/) | 2026-09-09 | 实测，有具体数字 |
| S4 | [Undetectr：v6 前奏和结尾](https://undetectr.com/blog/suno-v6-intro-outro-prompts) | 2026-09-11 | 汇总用户报告 + 官方文档 |
| S5 | [Undetectr：v6 单乐器](https://undetectr.com/blog/suno-v6-solo-instrument-prompts)、[v6 摇滚编曲](https://undetectr.com/blog/suno-v6-rock-prompts) | 2026-09（v6 系列） | 汇总用户报告 |
| S6 | [Roo's Newsletter：v6 提示词重写](https://roo.beehiiv.com/p/best-suno-prompts-v6) | 2026-09-27 | 二手汇总，作者自称 24 条提示词多数没跑过 |
| S7 | [ぱぴろん：v6 发布两周总结](https://note.com/papiron/n/nec17b1068cbe?hl=en) | 约 2026-09-23 | 二手汇总 + 个人经验 |
| S8 | [r/SunoAI：非官方 v6 提示词指南](https://www.reddit.com/r/SunoAI/comments/1wcyryw/unofficial_suno_v6_prompting_guide_what_has_been) | 约 2026-09-13 | 单个用户经验 |
| S9 | [r/SunoAI：「v6 像个生模型」](https://www.reddit.com/r/SunoAI/comments/1wjmlpj/suno_v6_feels_like_a_raw_model_why_tracks_sound) | 约 2026-09-20 | 单个用户经验，评论区有人反驳 |
| S10 | [ytyng.com：v6 评测](https://www.ytyng.com/en/blog/suno-v6-review-variety-max-mode-spectrum)、[Jack Righteous 汇总](https://jackrighteous.com/blogs/news/suno-v6-repair-manual-launch-announcement) | 2026-09 | 负面报告汇总 |

没采信的：undetectr 的通用提示词指南正文（2026-03 写的，只有顶部的 v6 更新提示是新的）；layer3labs 的读音建议（写于 v5.5 时期）。

### 结论：风格框（Styles）
- **写成 2–3 句话，说清每件乐器在干什么，不要堆逗号标签。** 流派放第一句，写 BPM。建议 250–600 字符，上限 1000。（S6、S7；S3 实测上限 1000 / 歌词 5000）
- **不要在风格框里写否定句。** 「no humming」会被当成要加入 humming，有用户越写越多（S3、S4、S7）。不要的东西写进 **Exclude Styles**，每项一个短名词，5–6 项以内（S4）。
- **不能写真实歌手或乐队的名字**，会被拒或被静默删掉（S6）。
- 描述人声时写「位置」比写「质量」有用：`close-miked, dry, in front of the mix` 比 `crisp, professional` 有效（S7）。这也对应 v6 最多的抱怨：声音闷、人声被埋（S10）。对我们尤其重要，因为人声越干越靠前，Demucs 分离和逐词对齐越好做。

### 结论：歌词框里的段落标签
- **v6 会读段落标签里的指令**，格式是 `[Verse 1 | whispered, close-mic]`。证据：S3 的歌只在段落标签里写了「法语、耳语」，v6 自己生成的歌曲描述里就出现了「whispered French bridge」（S3）。
- 每个标签只写一两条指令，要短（S6、S8）。标签里的指令要和风格框里的说法**一致**，两处矛盾时模型会把编曲削薄（S5）。
- **前奏和结尾要写死小节数**：不写前奏，开头容易冒出哼唱；只写 `[Outro]`，结尾会拖很长；歌词写到最后一秒，容易被截断在半句（S4、S7、S8）。建议写法：`[Intro | 2 bars, instrumental]`，结尾 `[Outro | instrumental, 4 bars, fade out]` 加 `[End]`。
- 单写 `[Pause]` 或 `[Instrumental]`，停顿可能只有约 1 秒，要写时长（S9，单方说法）。
- 这些标签全都是**提示，不是命令**（S4、S5、S7）。

### 结论：设置（More Options）
- **Variety 调到 0**。官方原话：Variety 会「调整和改写你的风格提示词」，想完全控制就调到 0（S2）。
- **Style Influence 默认 50%**（S3）。S7 建议 75–90%，但没人测过最优值。
- **My Taste / Personalize 关掉**，它会把风格往你的历史偏好上拉（S7）。
- **Duration 设成 Custom**。同一段提示词，v5.5 出 2:42–2:47，v6 出 3:08–3:16（S3）。在风格框里写总时长，「多数时候」会被遵守（S4）。
- **Max Mode**：官方说适合「两分钟以上」和「整首风格、人声保持一致」，要多花积分（S2）。我们正好 2 分钟，建议定稿那几次开，试探阶段关。
- **同一次生成的两个版本（take）之间的差异，可能大于你改一个词带来的差异**（S3）。判断一段提示词好不好，至少听 3–5 个 take。
- 模型：**以 v6 为主**。v6-wild 会偏离提示词（官方定位就是「探索」），有测试者报告约一半的 wild 生成坏掉不能用（S6 转述，S10）。wild 只拿来找点子，少量试几次。
- 用自然语言改段落、改单个词是 v6 的新功能（S1），但**不稳定**：有制作人三次要求只改一句，三次都拿回了一首不同的歌（S4 转述）。

### 读音
没找到针对 v6 的缩写读音测试。通行做法是**把会读错的词直接写成读音**（v6 之后的几条用户帖子也说自己在这么做，S10 一类）。我们的策略是尽量不用缩写，实在要用就写读音，见下文「读音对照」。

### 开放问题的答案：v6 会不会听从「主歌前几小节没有鼓」「副歌前贝斯停」？
**没有找到任何针对这两种指令的 v6 专门测试。** 间接证据指向「部分会，不可靠」：

- **段落级的配器变化有机会被执行。** 证据有三条：段落标签会被读（S3）；前奏写小节数有效（S4、S7）；有人按 `[Pre-Chorus | drums enter]` 这种格式写（S6，但他没说测过）。
- **「某段只留某几件乐器」经常被违反。** 发布首周的讨论里，有人要求前奏只有鼓，结果吉他也进来了（S5）。
- **小节以下的精度基本靠运气**。贝斯停 3 拍、「停半小节」都属于这一类。连停顿都可能被压成约 1 秒（S9）。

**所以做法是：**
1. 照样写进风格框和段落标签，两处说法一致，并且用肯定句（「verse one is just bass and synths」，不写「no drums」）。
2. **不把它当成硬性验收标准。** 阶段 2 由 C 用 Demucs 分轨**测量**每个候选：主歌 1 鼓的能量、副歌第 1 小节贝斯的能量，出一张「编曲要点命中表」，跟 BPM 等数据一起交给 Tim。
3. **副歌的冲击力主要靠歌词的重音来保证，而不是靠贝斯停。** 主题句的设计见下文：英语单词自带的重音会落在首拍上，这比编曲指令可靠。画面上的「刹车」也挂在歌词的弱起时间点上（逐词对齐数据），不挂在贝斯的包络上。这样即使 Suno 没让贝斯停，画面照样成立。
4. 某一版整体很好、只差这一处时，再试 v6 的段落编辑。

## 风格候选：把「欢快、电子」展开（2026-09-30 Tim 选 A）

四组都按 132 BPM、大调来写。Clawd 用第一人称唱，**所以这个声音就是 Clawd 的声音**。Clawd 有没有官方设定的性别，我没查到。人声性别是 Tim 定的事，每组都可以换。

| | A 明亮电子流行 | B 芯片流行 | C 迪斯科电子放克 | D 未来贝斯 / 可爱电子 |
|---|---|---|---|---|
| 流派 | electropop，四踩底鼓 | chiptune pop（bitpop） | nu-disco / electro-funk | future bass，kawaii 方向 |
| 标志音色 | 弹跳的合成器贝斯、拨弦琶音、拍手；副歌里用 8-bit 方波主旋律点缀 | 8-bit 方波旋律和快速琶音为主，底下垫现代的底鼓、军鼓 | 滤波的迪斯科钢琴和弦、slap 合成贝斯、反拍开镲、弦乐短音 | 宽的 supersaw 和弦、闪亮的铃音、切碎的人声采样 |
| 人声 | 女声，俏皮、自信，咬字清脆 | 男高音，明亮、有点书呆子气 | 男声，温暖、带笑意 | 女声，轻、甜 |
| 唱法 | 主歌近讲、副歌放开，副歌叠录双轨 | 主歌半说半唱、有节奏感，副歌大声唱 | 顺滑地唱，副歌句尾加假声即兴 | 气声，副歌的人声采样可能被做成音高变化 |
| 对画面的好处 | 最直接的「欢快、电子」，方波音色和像素 Clawd 呼应，但不喧宾夺主 | 和像素螃蟹最搭 | 律动最强，适合 Clawd 跳舞、卡拍 | 最「可爱」，和 Clawd 的形象最近 |
| 风险 | 最接近 Suno 的默认流行音色，可能「平」 | 方波主旋律和人声抢频段，影响听清和对齐；Tim 说过「太像素风」（虽然那是说画面） | 假声和即兴会增加对齐难度，要限制在句尾 | 人声采样、音高变化的人声会显著拉低 Whisper 吻合率和对齐质量；drop 会盖住人声 |

**C 的倾向**：A 当基准，C 当对照，阶段 2 两组都生成。B 可以当 A 的一个变体（把方波音色加重）。D 对阶段 3 的对齐最不友好，不推荐，除非 Tim 就想要这个味道。

## 结构：约 2 分钟（132 BPM，1 小节 ≈ 1.82 秒，66 小节 ≈ 120 秒）
沿用 pdoom 的骨架，去掉第三段主歌和安静版副歌。时间是按 132 BPM 算的理论值，真歌出来以后以分析数据为准。

| 段落 | 小节 | 理论时间 | 编曲要点 | 故事 |
|---|---|---|---|---|
| 前奏 | 2 | 0.0–3.6 | 只有合成器琶音 | 编辑器里光标在闪，Clawd 在睡觉 |
| 主歌 1 | 8 | 3.6–18.2 | **整段没有鼓**（按 pdoom 实测修正），只有贝斯和合成器 | 9 点，issue 到了：日历里多出一个 10 月 32 号 |
| 预副歌 1 | 3 | 18.2–23.6 | 鼓进来，情绪往上推 | 读代码、列计划、打勾 |
| 副歌 1 | 8 | 23.6–38.2 | 第 1 小节：停顿 + 弱起；主题词落在第 2 小节首拍（约 25.5 秒） | 狂写代码，一次次提交；「在我电脑上是好的」 |
| 过门 | 1 | 38.2–40.0 | 不写标签，让 Suno 自己处理 | |
| 主歌 2 | 8 | 40.0–54.5 | 全编制 | 跑测试：19 个红，报错像下雨 |
| 预副歌 2 | 3 | 54.5–60.0 | 贝斯退出，急 | 慌了，重跑、再重跑 |
| 副歌 2 | 8 | 60.0–74.5 | 比第一次更满（弱起同上，约 61.8 秒落拍） | git log 里全是 fix、fix、fix |
| breakdown | 3 | 74.5–80.0 | 鼓和贝斯退出，只剩铺底和人声 | 沿调用栈往下潜，安静 |
| 桥段 | 8 | 80.0–94.5 | 一小节一小节推起来 | 第 42 行找到 bug，剪掉一条横线，测试逐条变绿 |
| 最后一遍副歌 | 9 | 94.5–110.9 | 最满（约 96.4 秒落拍）；最后 1 小节停顿 | 最后一次提交，发 PR，对方回复「looks good to me」，合并 |
| 尾奏 | 5 | 110.9–120.0 | 器乐，渐弱 | Clawd 趴下睡觉，终端显示 `exit 0` |

Suno 不会严格遵守小节数。时间线是从分析数据自动推出来的，所以不怕有偏差；但段落的**顺序和主题句的落拍**必须对上。

## 故事线：Clawd 的一天

**视角**：Clawd 用第一人称唱（「I」），「you」是给它提 issue、最后审代码的人类开发者（2026-09-30 Tim 定）。

**Bug 选的是「差一错误」（off-by-one）**：日历显示 10 月有 32 天。选它有三个原因：
1. 一眼就懂，不懂编程的人也觉得好笑。
2. 画面好做：日历网格里多出一格。
3. 整首歌的高潮是删掉**一个字符**。循环条件 `d <= days` 改成 `d < days`，在带连字的等宽字体里，`≤` 下面那条横线就是要删的东西，Clawd 用钳子把它剪掉。两分钟的折腾最后落在一个字符上，这是程序员最有共鸣的笑点。

预副歌 2 里 Clawd「数到十」却数到了 11，给这个 bug 埋了伏笔。

**一天的节奏**：
1. 早上 9 点，issue 通知把 Clawd 叫醒（前奏、主歌 1）
2. 读代码，列待办清单，逐项打勾（预副歌 1）。待办清单是 Claude Code 的标志性界面元素。
3. 写得飞快，一次次提交，本地看起来好了（副歌 1）
4. 跑测试，19 个全红（主歌 2）
5. 慌，重跑（预副歌 2）
6. 越修越乱，提交记录全是 fix（副歌 2）
7. 静下来，沿调用栈往下找（breakdown）
8. 找到了，剪掉一条横线，19 个全绿（桥段）
9. 发 PR，人类回复 looks good to me，合并（最后一遍副歌）
10. 睡觉（尾奏）

**场景划分草案**（阶段 4 细化，计划是 5–7 个，这里是 7 个）：
| 场景 | 覆盖段落 | 主角 |
|---|---|---|
| S1 开机 | 前奏、主歌 1 | 编辑器、通知、多出一格的日历 |
| S2 计划 | 预副歌 1 | 待办清单 |
| S3 提交连击 | 三遍副歌共用，每遍升级 | 提交哈希、git log |
| S4 红色测试 | 主歌 2、预副歌 2 | 测试列表、报错雨 |
| S5 下潜 | breakdown | 调用栈 |
| S6 修复 | 桥段 | 第 42 行、测试逐条变绿 |
| S7 合并 | 最后一遍副歌后半、尾奏 | PR 页面、多个屏幕、睡着的 Clawd |

S3 是副歌场景，出现三次，按计划最先做。

## 主题句（hook）（2026-09-30 Tim 选 H1）

要求：约 3 拍的弱起，然后重音落在下一小节第一拍。pdoom 的做法是 `I'm up-ping my P- | DOOM`：弱起 5 个音节，从第 2 拍后半开始，**一个词被小节线劈成两半**，重音落在后半。

| 候选 | 弱起（第 2 拍后半 → 第 4 拍后半） | 落拍 | 好处 | 问题 |
|---|---|---|---|---|
| **H1** `I need one more com- \| MIT` | I · need · one · more · com（5 个音节） | **MIT** | commit 的重音本来就在第二个音节（kuh-MIT），**英语自带的重音会把它推到强拍上**，不靠 Suno 听话；和 P-\|DOOM 一样劈开一个词；-it 押韵的词很多（fit, quit, bit, it, admit）；故事上能从 one more 变成 one last | 「再来一次提交」本身有点拖延的意味，需要歌词把它唱成兴奋而不是疲惫 |
| H2 `Say it looks good to \| ME` | say · it · looks · good · to（5 个音节） | **ME** | looks good to me 就是 LGTM，代码审查的标志用语，写成完整的英文，不用读缩写 | 落拍的是弱代词 me，冲击力不如 H1；而且它是评审者说的话，放进 Clawd 的每遍副歌不合逻辑 |
| H3 `Watch the tests all go \| GREEN` | watch · the · tests · all · go（5 个音节） | **GREEN** | 画面最强：落拍瞬间整屏变绿 | 副歌 1、2 的时候测试还没变绿，只能唱成愿望；到最后才兑现 |

**C 的推荐：H1。** 下面的歌词按 H1 写。H2 已经用在最后一遍副歌里，作为评审者的那句话。H3 的画面（变绿）已经放进桥段。换成 H2 或 H3 的话，三段副歌要重写。

## 歌词（英文，每句标画面）

说明：
- 段落标签按 v6 的格式写（`[段落 | 指令]`），和风格框的说法一致。
- 下表是「显示版」，屏幕上出现的是这些字。贴进 Suno 的版本见下一节，两者只差读音拼写。
- 画面描述只写内容和动作，**不涉及配色和底色**（阶段 4 再定，要避开「像素加黑底」）。
- 共 35 行，约 230 个词。按秒算比 pdoom 密（pdoom 227 词 / 157 秒，但它有更长的尾奏和器乐段）。主歌每行 8–10 个音节，副歌每行 5–7 个。v6 有「歌词太多就被截断或拉长」的报告（S4），生成后如果时长超标，先删主歌 2 或桥段的词。

| 段落 | 歌词 | 画面 |
|---|---|---|
| **[Intro \| 2 bars, instrumental]** | （器乐） | 编辑器里光标闪两下；Clawd 缩在侧栏角落里睡觉 |
| **[Verse 1 \| sparse, bass and synths only]** | Nine o'clock, a ping on my screen | 通知弹出 `Issue #1031`，Clawd 睁开一只眼 |
| | Got a bug report, the weirdest I've seen | issue 页面展开，标题 `Calendar shows October 32` |
| | There's a thirty-second day in October | 日历网格里多出一格「32」，一闪一闪 |
| | So I crack my claws and read it all over | Clawd 活动钳子；文件树像抽屉一样一层层拉开，Clawd 横着爬过代码行 |
| **[Pre-Chorus \| drums enter, energy lifts]** | Read the code, write a plan, check, check, check | 右侧是待办清单，三项随三下军鼓逐个打勾 |
| | Claws on the keys and I'm not looking back | 钳子落到键盘上，镜头猛推到光标 |
| **[Chorus \| half-bar stop, then full band]** | I need one more commit | 唱「I need one more com-」时画面冻结，只剩光标在闪（整首歌第一次刹车）；「-MIT」落拍，一行提交哈希从光标里弹出来，整屏跟着鼓点跳 |
| | Every bracket's gonna fit | 括号从四面八方飞来，一拍一对扣上 |
| | Tap-tap-tapping, never quit | Clawd 的腿轮流敲键盘（动作库的招牌动作） |
| | I need one more commit | 同第一句，哈希变成两行 |
| | 'Cause it works on my machine | 本地预览里日历只剩 31 格了，Clawd 对镜头竖起钳子；唱到「machine」时画面轻轻抖一下（伏笔） |
| **[Verse 2 \| full band]** | So I run the tests, I'm waiting for a pass | 终端里跑测试，进度点一拍跳一个 |
| | Nineteen red, and they're shattering like glass | 19 行红色的失败标记像玻璃一样碎开 |
| | Stack traces falling like rain from the sky | 报错堆栈从屏幕上方落下来；Clawd 举钳子挡 |
| | Undefined, undefined, and I don't know why | 「undefined」这个词像雨滴一样一个个砸在 Clawd 头上 |
| **[Pre-Chorus \| bass drops out, urgent]** | Run it again, run it again, again | 同一条命令被敲三次，每次终端更红，镜头更近 |
| | Clear the cache and count to ten | Clawd 闭眼用腿数数，数到 11（差一错误的伏笔） |
| **[Chorus \| bigger, doubled vocals]** | I need one more commit | 同副歌 1 的刹车和落拍，但这次落拍弹出的是 git log |
| | "Fix," and "fix," and "fix a bit" | 提交信息一拍一条往上堆：`fix` / `fix` / `fix a bit` |
| | Every test is throwing fits | 测试列表里的条目一个个抽搐乱跳 |
| | I need one more commit | git log 堆满全屏 |
| | But it works on my machine! | 分屏：左边本地是绿的，右边 CI 是红的，两屏对撞 |
| **[Breakdown \| 3 bars, pads and voice only]** | Down the call stack, quiet down here | 镜头随 Clawd 一层层往下沉，每层是一个函数名的横条，越往下越安静 |
| | Frame by frame, and the bug is near | 最底层有一样东西在微微发光 |
| **[Bridge \| builds bar by bar]** | There it is, on line forty-two | 画面定在第 42 行：`for (let d = 0; d <= days; d++)` |
| | "Less than or equal" — well, that won't do | `≤` 放大到占满屏幕，下面那条横线在发抖 |
| | Snip the extra line and set October free | Clawd 用钳子剪掉那条横线，`≤` 变成 `<`；日历上的「32」像气泡一样破掉 |
| | One goes green, and two, and three | 测试列表开始一条条变绿 |
| | Green and green and green and green | 变绿越来越快，像多米诺骨牌，跟着合成器往上爬 |
| | Nineteen green! | 计数停在 19/19，整屏一亮 |
| **[Final Chorus \| biggest, doubled vocals]** | I need one last commit | 同样的刹车和落拍，这次弹出的哈希是金色的 |
| | Pull request, and that is it | PR 页面展开，标题 `Fix October 32nd` |
| | Then you wrote, "Looks good to me" | 评审者（人类）的头像弹出，带一个对勾；这是整首歌里唯一一句别人说的话 |
| | Merged to main, and now we're free | 按下合并，分支线汇进主线，彩纸落下 |
| | And it works on every machine | 电脑、平板、手机的屏幕同时亮起，每个日历都是 31 天 |
| **[Stop \| 1 bar of silence]** | （停顿一小节） | 画面冻结，只有光标还在闪 |
| **[Outro \| instrumental, 4 bars, fade out]** | （器乐，渐弱） | Clawd 在侧栏里趴下睡着；终端最后一行 `exit 0`；日历停在 10 月 31 日 |
| **[End]** | | |

### 读音对照
原则：能不用缩写就不用。下表列出可能读错或需要对齐时特殊处理的词。「Suno 版」是贴进 Suno 的拼写，「显示版」是屏幕上的字；阶段 3 对齐时，两者的对应关系写进 `analysis/pron.py`（上游已有「显示词 → 读音」的映射机制）。

| 词 | 读法 | Suno 版 | 显示版 | 说明 |
|---|---|---|---|---|
| commit | kuh-MIT，重音在后 | commit | commit | 主题句靠这个重音落拍 |
| cache | 读作 cash | **cash** | cache | 唯一一处两个版本不同的词。Suno 可能读成 catch |
| forty-two | 普通数字 | forty-two | forty-two | 不写 42 |
| thirty-second | 普通序数词 | thirty-second | thirty-second | 不写 32nd |
| nineteen | 普通数字 | nineteen | nineteen | 不写 19 |
| less than or equal | 普通英语 | less than or equal | less than or equal | 不写 `<=` |
| looks good to me | 普通英语 | looks good to me | looks good to me | 就是 LGTM，不写缩写 |
| pull request | 普通英语 | pull request | pull request | 不写 PR |
| Nine o'clock | 普通英语 | Nine o'clock | Nine o'clock | 不写 9 a.m. |
| undefined | un-dee-FINED | undefined | undefined | 常用词，不改写 |
| Tap-tap-tapping | 三个音节组 | Tap-tap-tapping | Tap-tap-tapping | 对齐时拆成 tap / tap / tapping |

### Suno 粘贴版（歌词框）
机器读的副本在 `lyrics/song.suno.txt`（分析工具用它）。改歌词时两处一起改，以本节为准。
```
[Intro | 2 bars, instrumental]

[Verse 1 | sparse, bass and synths only]
Nine o'clock, a ping on my screen
Got a bug report, the weirdest I've seen
There's a thirty-second day in October
So I crack my claws and read it all over

[Pre-Chorus | drums enter, energy lifts]
Read the code, write a plan, check, check, check
Claws on the keys and I'm not looking back

[Chorus | half-bar stop, then full band]
I need one more commit
Every bracket's gonna fit
Tap-tap-tapping, never quit
I need one more commit
'Cause it works on my machine

[Verse 2 | full band]
So I run the tests, I'm waiting for a pass
Nineteen red, and they're shattering like glass
Stack traces falling like rain from the sky
Undefined, undefined, and I don't know why

[Pre-Chorus | bass drops out, urgent]
Run it again, run it again, again
Clear the cash and count to ten

[Chorus | bigger, doubled vocals]
I need one more commit
"Fix," and "fix," and "fix a bit"
Every test is throwing fits
I need one more commit
But it works on my machine!

[Breakdown | 3 bars, pads and voice only]
Down the call stack, quiet down here
Frame by frame, and the bug is near

[Bridge | builds bar by bar]
There it is, on line forty-two
"Less than or equal" — well, that won't do
Snip the extra line and set October free
One goes green, and two, and three
Green and green and green and green
Nineteen green!

[Final Chorus | biggest, doubled vocals]
I need one last commit
Pull request, and that is it
Then you wrote, "Looks good to me"
Merged to main, and now we're free
And it works on every machine

[Stop | 1 bar of silence]

[Outro | instrumental, 4 bars, fade out]

[End]
```

## Suno 风格描述（Styles 框）（用 A；B、C 留作对照）

三版分别对应风格候选 A、B、C。都按 v6 的写法：成句、流派放第一句、写 BPM、说清每件乐器干什么、写人声的位置、写总时长、不写否定句、不写人名。每版约 650 字符（上限 1000）。选了 D 的话再单独写。

**A｜明亮电子流行（女声）** · 661 字符
```
Bright, bouncy electropop at 132 BPM in a major key, four-on-the-floor. The song opens on a plucky synth arpeggio; verse one is just that arpeggio and a rubbery synth bass, and the drums come in at the pre-chorus. Each chorus starts with a half-bar stop, then the singer's pickup lands on a full-band downbeat with claps and a bright square-wave lead answering the vocal. Female lead vocal, playful and confident, crisp diction, close-miked, dry and in front of the mix; the chorus is doubled. A short breakdown of pads and voice before the bridge builds back up. Punchy, bright, clean modern mix. About two minutes long, ending with a short instrumental outro.
```
Exclude Styles：`autotune, vocoder, humming, spoken intro, rock guitar` · Vocal Gender：Female

**B｜芯片流行（男声）** · 645 字符
```
Chiptune pop at 132 BPM: 8-bit square-wave melodies and fast arpeggios over a modern punchy kick and snare, driving eighth-note synth bass. Verse one is arpeggios and bass only; the drums enter at the pre-chorus. Before each chorus the band stops for half a bar and the singer's pickup crashes into a full-band downbeat. Male tenor vocal, bright and a little nerdy, rhythmic half-sung verses and a big sung chorus, every word clear, close-miked and dry in front of the chiptune. A short breakdown with only a soft pad and voice, then a rising build. Energetic, cheerful, clean mix. About two minutes long, ending with a short instrumental outro.
```
Exclude Styles：`autotune, vocoder, humming, spoken intro, rock guitar` · Vocal Gender：Male

**C｜迪斯科电子放克（男声）** · 约 650 字符
```
Nu-disco electro-funk pop at 132 BPM. Filtered disco piano chords and a funky slap synth bass drive the groove, handclaps on two and four, offbeat open hi-hats. Verse one is just the bass and filtered chords; drums arrive at the pre-chorus. Each chorus opens with a half-bar stop before the singer's pickup lands on a big full-band downbeat with string stabs. Warm male vocal, smooth and grinning, falsetto ad-libs only at the ends of chorus lines, lead vocal close-miked, dry and upfront. A short breakdown of chords and voice, then a filter-sweep build. Warm, glossy, danceable mix. About two minutes long, ending with a short instrumental outro.
```
Exclude Styles：`autotune, vocoder, humming, spoken intro, rock guitar` · Vocal Gender：Male

**阶段 2 的设置清单**（依据见上文「Suno v6 怎么写」）：
- Custom 模式；模型 v6（v6-wild 只少量试几次找点子）
- Variety 0；Style Influence 75–90%；My Taste 关
- Duration：Custom，约 2:00
- Max Mode：试探阶段关，定稿那几次开
- Weirdness：保持默认。没查到可靠的建议值，不编数字
- 每组提示词至少听 3–5 个 take 再下结论

## 视觉规范 v2（最终定调，2026-10-01）

> v1（纸面海报 × 悬浮面板，全片一种画法）被 Tim 否定：「背景很单一，没什么动态变化，远不如 pdoom」。v2 是 C 在逐场分析 pdoom 场景代码之后定的调，Tim 已认可方向，本节是最终版。

### 对 pdoom 的量化分析（`reference/pdoom/scenes`，17 场约 19,600 行）
| 手段 | pdoom | 我们的 v1 |
|---|---|---|
| 每场代码量 | 800–1700 行 | S08 约 300 行 |
| 每场自己的全屏着色器背景 | 17/17 场 | 0（静止的 Canvas 纸面） |
| 生成式细线（LineBatch） | 12 场 | 0 |
| 排线 / 雕刻着色（`hatch` / `engrave`） | 7 场 | 0 |
| 3D 光线步进 | 3 场 | 0 |
| 贯穿全片的母题（火花） | 14 场 | 没有 |
| 每场单独调后期 | 17/17 场 | 一个统一预设 |
| 明暗节奏 | 暗场和纸面场交替 | 全程纸面 |

它的背景是活的。以 stack 为例，全屏着色器里有随镜头视差滚动的绘图网格、远处的纵深雾、只在运动时出现的条纹，还接收底鼓脉冲。**pdoom 的丰富不靠镜头数，它只有 23 个时间线条目，靠的是每一场都是独立精做的作品，场内一直在动。**

### 定调：一套语法，每场一种画法
**全片共享的（统一感来自这里）**：色板、字体系统、颗粒、Clawd 精灵、光标母题、镜头语法。
**每场自己的（丰富感来自这里）**：底色、背景着色器、画法、镜头设计、歌词融入画面的方式。

### 三种底色（明暗节奏）
| 底色 | 构成 | 用在 |
|---|---|---|
| **PAPER** 纸 | `paper` 底，`ink` 细线和字 | 公文、清单、日历、测试这类「白天办公」场 |
| **INK** 墨 | `ink`（#1B2A4A，墨蓝，**不是黑**）底，`paper` 细线和字，`clay` 发光 | 启动、终端、报错雨、下潜、夜里这类「机器内部」场 |
| **CLAY** 橙 | 整屏 `clay`，`paper` 和 `ink` 的字 | **只用于主题词冲击**的那几拍 |
底色切换只发生在小节第一拍或主题词重音上，作为「翻页」式的硬切。

### 放开和保留的规则
- **发光**：只有 `clay`（Clawd、光标、主题词）可以发光，而且只在 INK 底上；纸面上一律不发光。语义红绿不发光。
- **明暗和纵深**：允许排线 / 雕刻着色（引擎自带 `hatch` / `engrave`），允许 INK 底上的纵深雾。**禁止**写实光影、反射、镜头光晕、渐变填充。
- **背景必须是活的**：每场有自己的全屏背景着色器，至少包含一样随音乐或镜头变化的元素（视差网格、底鼓脉冲、运动条纹、流动的等高线、半调网点……）。
- 仍然禁止：描边、贴纸、卡通化的世界、VS Code 品牌元素、生图画错的 Clawd。

### 光标母题（对应 pdoom 的火花）
一个 `clay` 色的方块光标 ▍，会闪烁，会拖出一条细线，贯穿全片：S01 在黑暗里闪 → 打出第一句歌词 → S04 在日历城里画出路线 → S08 弹出成为提交哈希 → S11 被报错雨淹没 → S14 像铅垂线一样坠入调用栈 → S15 成为剪刀剪下的那一点 → S17 画出合并的那一笔 → S18 又开始闪。

### 镜头语法（照 pdoom）
- 总有东西在动；大的变化落在拍子上：硬切落在小节第一拍，冲击落在重音上，镜头运动缓进到下一个第一拍。
- 用强缓动（`outExpo`、`inOutCubic`、弹簧），先停住再猛地一动，不要漂浮式的屏保运动。
- 场内也有子切换、重新构图、猛推猛拉。
- 歌词在每场以不同方式融进画面（被光标打出、刻在物体上、沿路径走、被盖章……），主题句的冲击每次升级。

### 每场的画法
| 场景 | 底色 | 画法 | 主要技术 |
|---|---|---|---|
| S01 冷启动 | INK | 黑暗中一个发光的光标；欢迎框用 paper 细线一笔笔画出；Clawd 一格格亮起 | 背景着色器（视差绘图网格 + 纵深雾），LineBatch |
| S02 通知 | INK→PAPER | 唱到「ping」时整屏翻成纸面（全片第一次明暗翻转） | 硬切翻转 |
| S03 Issue | PAPER | 公文式：issue 是一张正式表格，`bug` 橡皮章砸下（油墨质感、震屏） | Canvas + 着色器油墨纹理 |
| S04 日历城 | PAPER | 日期格子拉伸成一座 3D 城市，镜头贴着「街道」飞过 1–31 号，第 32 号从地里升起 | 实例化方块 + 排线着色，底鼓让楼顶脉动 |
| S05 代码平台 | INK | 横版卷轴：代码行是三层视差的平台，Clawd 横着走；文件树是墨底上的蓝图 | LineBatch 蓝图，视差 |
| S06 待办 | PAPER | 光标像绘图笔一样画出勾选和删除线，每一勾落在军鼓上 | 单笔画字体（`stroke.ts`） |
| S07 键盘 | INK | 键盘是一片 3D 地形，波浪滚过；镜头俯冲进 Enter 键，接到副歌的光标（匹配剪辑） | 实例化键帽 + 排线着色 |
| S08 副歌 1 | PAPER + CLAY | 主题词冲击第 1 级：重音上整屏翻成橙；括号飞入；三机位快切 | 现有 S08 升级 |
| S09 终端 | INK | 测试进度做成示波器扫描线，光标画出轨迹，每拍一个点 | LineBatch + 余辉 |
| S10 红墙 | PAPER | 19 行失败是 19 块玻璃板，在「shattering」上碎开 | 3D 碎片（确定性） |
| S11 报错雨 | INK | 有纵深的文字风暴：三层不同远近的堆栈文字，undefined 巨字砸下，Clawd 很小 | 文字粒子 + 按距离模糊 |
| S12 重跑 | PAPER | 同一条命令像复印件一样一张比一张失真；数腿的数字用 Archivo 宽度动画数到 11 | 着色器复印噪点 |
| S13 副歌 2 | CLAY + INK | 主题词冲击第 2 级；git log 无限上滚的瀑布；本地和 CI 两屏对撞 | 升级版 S08 语法 |
| S14 下潜 | INK | 无限深的调用栈竖井，镜头一层层坠落（照 pdoom stack），「near」上猛地停住 | 背景着色器（视差网格、雾、条纹） |
| S15 第 42 行 | INK→PAPER | `≤` 是一座排线雕刻的 3D 纪念碑，Clawd 很小；「Snip」上闪白翻成纸面 | 光线步进字形 + `engrave` |
| S16 变绿 | PAPER | 19 块测试牌像多米诺骨牌倒下，每块倒下时翻绿，越来越快 | 实例化 3D + 排线 |
| S17 发布 | CLAY→PAPER | 主题词冲击第 3 级（最大）；diff 的一个字符巨大化；光标画出合并线；拉远看到设备墙拼成巨大的 Clawd | 升级版 S08 语法 + 设备墙 |
| S18 第二天 | INK→PAPER | 夜：当天所有提交连成一片细线星图，配合尾奏的「oh」合唱；天亮翻成纸面，新的 issue 弹出 | LineBatch 星图 |

### 色板（token；代码里只许用 token）
| token | 值 | 用途 |
|---|---|---|
| `paper` | #F2EFE9 | PAPER 底；INK 底上的细线和字 |
| `ink` | #1B2A4A | INK 底；PAPER 底上的细线和字 |
| `ink-2` | ink 的 60% / 30% / 12% | 次级文字、细线、分隔、阴影 |
| `clay` | #D77757 | 强调色：Clawd、光标、主题词；CLAY 底 |
| `fail` / `pass` | #C8453B / #3F8F5F（初值） | 语义色：只用于测试状态和 PR diff |

### 字体
- Archivo：主题句和大字，**宽度 62–125、字重 300–900 都做动画**（长音时拉宽，紧张时压窄）。
- IBM Plex Mono：机器的声音，终端、代码、标签。
- 单笔画字体（`stroke.ts`）：被光标「写」出来的字。

### 代码能不能做
引擎继承自 pdoom，上表里的每项技术 pdoom 都用过（着色器背景、LineBatch、`hatch` / `engrave`、光线步进、实例化 3D、后期逐场调），所以都能做。代价是工作量：每场要按 600–1200 行的精度来做，而不是 300 行拼组件。

## 歌词排版 v3（2026-10-01，C 设计，Tim 授权「大胆设计」，下一阶段实现）

> 起因：Tim 看完整片预览 v1，「整体效果很满意」，但**英文歌词的存在感太低，在整片里设计感不足**。v1 的歌词大多是等宽小字（最大 32 px，未唱的词只有 30% 不透明度），放在底部或角落，看起来像字幕，和界面文字混在一起。
> Tim 的提醒：**歌词是主角之一，不是唯一主角。** 全片有三个主角：**Clawd、每场的世界、歌词**。它们轮流领舞，任何时刻都只有一个是焦点，另外两个让位，但不能消失。
> 质量标准（Tim）：要让观众看完惊叹「这真的是 AI 做出来的吗」。

### 一、三个主角怎么分配焦点
| 段落 | 焦点 | 歌词的规模 |
|---|---|---|
| 主歌（S02–S05、S09–S11） | 世界和 Clawd 讲故事 | 歌词**长在世界里**：印在、刻在、写在场景里的物体上，占画面 15–30%，清楚可读，但它属于画面的一部分 |
| 预副歌（S06、S07、S12） | 歌词开始抢戏 | 25–45%，逐词越来越大、越来越紧，为副歌蓄力 |
| 副歌（S08、S13、S17） | **歌词是焦点** | 主题句 40–100%，整屏冲击；Clawd 和世界退为节奏 |
| 间奏、breakdown、尾奏（S01、S14、S18） | Clawd 和世界 | 歌词安静，小而精，但依然有设计 |
要求：一句歌词出现时，它是**画面里对比度最高的文字**。世界里别的字（界面、代码、标签）一律压低，不和歌词抢。

### 二、一个声音，一套字
- **唱出来的词只用 Archivo**（粗体无衬线，可变宽度 62–125、字重 300–900）。这是「人声」。
- **IBM Plex Mono 只给机器**：代码、终端、标签、注释。v1 的问题之一就是歌词用了机器的字体，所以隐没在界面里。
- 例外：S01 和 S09 的「被光标敲出来」可以用 Mono，因为那一刻歌词就是被机器打出来的。这是有意的，要做得明显。

### 三、歌词跟着声音长出来（声音到形态的映射）
- **逐词诞生**：每个词在唱到的那一刻出现，绝不早于人声。下一句可以提前 0.3 秒以 55% 不透明度预示（v1 是 30%，太弱）。
- **长音拉宽**：一个词唱多久，它的宽度就在这段时间里从 87.5 拉到 125。长音看起来就是「被拉长的字」。
- **力度变字重**：用人声包络（`f.a.vocal`）驱动字重，300 到 900。轻声细唱时字是细的，唱到重音时字变粗。
- **重读音节用 clay**：每句最重的那个词（对齐数据里的重音）用陶土橙，其余用 ink 或 paper。
- **底鼓微脉冲**：每次底鼓，整句缩放 1–2%，让字跟着节奏呼吸。
- **退场**：下一句开始时，上一句以「残影」退到 12% 不透明度，停留一拍后消失，留下一点余韵。

### 四、动作库（可复用的招牌动作，做成 `kit/lyric-moves.ts`）
| 动作 | 是什么 | 用在 |
|---|---|---|
| **网格落位** Grid snap | 每个词落进瑞士网格的一个格子，落下时那个格子的边线闪一下 | 主歌的默认动作 |
| **光标敲出** Type-on | clay 光标按音节速度逐字敲出这个词，光标停在词尾闪 | S01、S09、S06 |
| **盖章** Stamp | 词像橡皮章一样砸下来，油墨晕开，震屏 | S03、S12 |
| **长在物体上** Surface | 词贴在 3D 物体表面，跟着透视、跟着物体动（楼顶、玻璃板、骨牌、栈帧） | S04、S10、S14、S16 |
| **雕刻** Engrave | 词用排线雕刻的方式刻进 3D 表面 | S15 |
| **纵深风暴** Depth storm | 歌词混在多层纵深的文字粒子里，正在唱的词从虚到实、飞到焦平面上 | S11 |
| **沿路行走** Path ride | 词沿着光标画出的线走 | S04、S17 |
| **堆叠** Stack | 每个新词把前面的往上推，像 git log | S13 |
| **碎裂重组** Shatter | 词碎成字形碎片，再在下一拍拼回来 | S10 |
| **计数器** Odometer | 数字词（Nineteen、forty-two、ten）像里程表一样滚到位 | S10、S12、S15、S16 |
| **整屏冲击** Slam | 主题词整屏砸下（已有），逐级升级 | S08、S13、S17 |

### 五、文字游戏（让歌词和画面互相成全）
- 「**Undefined**, undefined」：第一个词完整，第二个词的字形缺失、变成空白方框，像「字形未定义」。
- 「count to **ten**」：数到 ten 时，字母自己也被数了一遍，最后多出一个格子（11，差一错误的伏笔）。
- 「**Less than or equal**」：这四个词排成 `≤` 的形状，下一句「Snip」剪掉的就是这个形状底下的那一笔。
- 「set October **free**」：FREE 冲出网格，是全片唯一一个出了网格边线的词。
- 「**Looks good to me**」：以评审评论的样式出现，但巨大，占满半屏。
- 「**Merged** to main」：Merged 和 main 两个词的字母，像两条分支一样汇合成一行。
- 「works on **every machine**」：这句在设备墙的每一块屏幕上同时唱出，拉远时所有屏幕上的字合成一句大字。
- 主题词的升级：第 1 级 COMMIT 整屏砸下（已有）；第 2 级 COMMIT 像提交记录一样一遍遍叠满屏幕；第 3 级 COMMIT 的每个字母从设备墙的不同屏幕里飞出来，汇成一个字。

### 六、每场的歌词设计
| 场景 | 句子 | 设计 |
|---|---|---|
| S01 | （器乐） | 光标在黑暗里闪；欢迎框打出 `Works on My Machine`（歌名），Mono，克制 |
| S02 | Nine o'clock, a ping on my screen | 「ping」随通知一起弹出，Archivo 粗体；墨蓝翻成纸白的那一刻，整句被翻页带进来 |
| S03 | Got a bug report, the weirdest I've seen | 「bug」被盖章砸下（与 `bug` 标签同一个章）；其余词填进公文表格的字段里，但字号是正文的 3 倍 |
| S04 | There's a thirty-second day in October / So I crack my claws… | 歌词印在楼顶和街道上，沿光标路线行走；「thirty-second」用计数器滚到 32，落在第 32 号楼顶上 |
| S05 | …read it all over | 词是横版平台的一部分，Clawd 踩在「read」上走过去 |
| S06 | Read the code, write a plan, check, check, check | 三个 check 各自盖一个勾；每个 check 的字重 300→900 递增 |
| S07 | Claws on the keys and I'm not looking back | 每个词落在一颗键帽上，按下就亮；「back」落在 Enter 上，俯冲接副歌 |
| S08 | 副歌 1 | 已有整屏冲击；非主题句改用网格落位，占半屏 |
| S09 | So I run the tests, I'm waiting for a pass | 被光标敲出（Mono，有意为之），「pass」停在示波器扫描线的尽头闪 |
| S10 | Nineteen red, and they're shattering like glass | 「Nineteen」计数器滚到 19；整句刻在玻璃板上，在「shattering」上和玻璃一起碎 |
| S11 | Stack traces falling… / Undefined, undefined… | 纵深风暴；第二个 undefined 字形缺失 |
| S12 | Run it again… / Clear the cache and count to ten | 三个「run」盖章，一个比一个歪；「ten」的字母被数一遍，多出一格 |
| S13 | 副歌 2 | 主题词第 2 级：COMMIT 叠满屏幕；「fix」「fix」「fix a bit」按 git log 堆叠 |
| S14 | Down the call stack… / Frame by frame… | 每层栈帧上刻一个词，镜头下坠时一路读下去；「near」停住时整句定格 |
| S15 | There it is, on line forty-two / Less than or equal… / Snip… | 「forty-two」计数器；「Less than or equal」排成 ≤；「Snip」剪掉底下那笔；「free」冲出网格 |
| S16 | One goes green… / Nineteen green! | 每个词印在一块骨牌上，倒下时翻绿；「Nineteen green!」整屏，计数器 19/19 |
| S17 | 副歌 3 | 主题词第 3 级；「Looks good to me」巨大的评审评论；「Merged to main」字母汇合；「every machine」在设备墙上合成一句 |
| S18 | （尾奏「oh」合唱） | 「oh」不写成字：每一声「oh」在星图上点亮一颗 clay 星；片尾字幕用网格落位 |

### 七、硬性规则
- 卡拉 OK 永远不能早于人声；逐词时间只来自 `data/lyrics.json`。
- 文字放在安全区里（离边缘至少 96 px），除非是有意的出血裁切。
- 一句歌词在画面上停留的时间，至少要够读完（短句不少于 0.8 秒）。
- 字距和标点遵守 `docs/ENGINE.md` 的 Typography 一节（逐字形字距、弯引号）。
- 同一时刻只有一句歌词是焦点。

## 歌词 v3 与分镜对齐：定稿（2026-10-01，C；吸收 Codex 的 pdoom 源码分析和 T 对 S04/S11 样片的意见）

> 依据：`docs/reference/pdoom-analysis-codex-20261001.md`（pdoom 把歌词、场景变化、场景交接一起设计）；T 看 S04/S11 样片：「方向对，有优化，设计效果和层级比分镜图还差一点」。
> 本节是第 6.5 阶段铺开的唯一依据，和上面「歌词排版 v3」冲突时以本节为准。
>
> **优先级（T 2026-10-01）：分镜图第一。** 「分镜图效果做得很好，继续往分镜图的效果靠。」每场以 `out/storyboard/v2/kf-SNN.png` 为目标画面：构图、主导元素的大小和位置、镜头角度、材质（雕刻排线、油墨和网点颗粒、有厚度的实体块、出血裁切的巨字、留白）尽量还原。下面的歌词机制、交接物只在**不改变分镜图构图**的前提下做，冲突时按分镜图。效果好不好只由 Tim 判断。

### 一、层级规则（可量化，每场都要满足）
分镜图好在层级：**一个主导、三级字号、极少标注**。
1. **一个主导元素**：每个镜头的关键帧里，必须有一个元素占画面面积 ≥ 30%（超大裁切字，或一个实体物件）。多数场景里它就是**正在唱的那个词**（见下表）。
2. **只用三级字号**：巨字（大写高 ≥ 200 px，可以出血裁切）／歌词（大写高 50–110 px）／标注（Plex Mono 14–22 px）。不允许第四种字号；相邻两级的大写高至少差 2.5 倍。
3. **标注 ≤ 2 处**：同一时刻画面上最多两处 mono 标注（每处一两行 + 一条细线）。删掉装饰性的说明文字（`DATE GRID / STREET SURVEY` 这类）。
4. **歌词对比度最高**：有歌词时，界面、代码、标签文字的不透明度 ≤ 60%（clay 例外）。
5. **安全区 96 px**，巨字的有意出血除外。

### 二、每场的歌词机制（每场一种，由场景的世界决定）
唱出来的词一律用 `kit/vartype.ts`（连续 Archivo）+ `kit/lyric-moves.ts` 的 `Voice`，不用 `F.archivo` 离散档、不用 `lyricsTypeState`/`sungLine`/`drawLyricsLine` 画唱词。

| 场 | 主导元素（≥30%） | 歌词机制 |
|---|---|---|
| S01 | 欢迎框 + Clawd | 器乐；欢迎框里 `Works on My Machine` 由光标敲出（Mono，例外）。S01 末尾的「Nine o’clock, a」用歌词级 Archivo 在框下方逐词出现 |
| S02 | **PING** 巨字（横贯，跨墨/纸分割线颜色反转） | 「ping」就是巨字，砸下时整屏翻纸；「on my screen」歌词级在巨字下方网格落位 |
| S03 | 公文表格 | 歌词填进表格字段：「Got a bug report」是 TITLE 字段的巨字两行；「bug」= clay 橡皮章（`stamp`）；「the weirdest I’ve seen」进 NOTES 字段，歌词级 |
| S04 | 日历城 + **OCTOBER** | 已做（计数器 + OCTOBER 标题）。按层级规则收：去掉多余标注，OCTOBER 残影不低于 0.6（它是这场的标题），「So I…」歌词级 |
| S05 | **month.ts** 巨字 + 代码平台 | 歌词是平台：每个词是一段平台上的 Archivo 字，Clawd 踩着「read」走过；`month.ts` 巨字在底部出血（机器字，Mono 例外允许） |
| S06 | **CHECK** 巨字 | 三个「check」= 巨字 CHECK 被光标笔逐次描粗（字重 300→600→900）；「Read the code / write a plan」是清单行，歌词级，划线 |
| S07 | 键盘地形 + **ENTER** | 每个词落在一颗键帽上（贴图，`Plate`），按下即亮；「back」落在 Enter，Enter 变 clay 接 S08 |
| S08 | **COMMIT** 巨字（clay 满屏） | 主题词第 1 级（已有，换成连续 Archivo，宽度跟 MIT 长音）；其余句子网格落位，歌词级；括号四角 |
| S09 | 示波器波形 + **19** | 被光标敲出（Mono，有意）：「So I run the tests」逐字打在扫描线上方；「pass」停在扫描头，闪 |
| S10 | 19 块玻璃板 + **19 failed** | 「Nineteen」计数器滚到 19（`odometer`）；其余词刻在玻璃板上，在「shattering」和玻璃一起碎 |
| S11 | 风暴 + **undefined** | 已做（纵深风暴 + 缺字）。按层级规则收：底部「and I don’t know why」升到歌词级 |
| S12 | **1…11** 巨型数字 + 复印件 | 三个「run」盖章（`stamp`），一个比一个歪；「count to ten」= 底部巨型数字行逐拍数，第 11 个是 clay（多出的一格） |
| S13 | **COMMIT**（clay 半屏）+ git log 瀑布 | 主题词第 2 级：COMMIT 像提交一样一遍遍叠满半屏；「fix / fix / fix a bit」按 git log 堆叠（`stack`），「fix a bit」clay |
| S14 | 栈井 | 每层栈帧上刻一个词（贴图），镜头逐拍下坠读下去；「near」骤停，整句定格 |
| S15 | **≤** 雕塑 | 「forty-two」计数器；「Less than or equal」排成 ≤ 的两条笔画；「Snip」剪掉下面那一笔；「free」冲出网格（全片唯一出网格的词） |
| S16 | **GREEN** 巨字 + 骨牌 | 「green」= 巨字 GREEN（每唱一次换一种宽度）；数字词印在骨牌上翻绿；「Nineteen green!」计数器 19/19 |
| S17 | 巨型 Clawd 设备墙 + diff 巨字 | 主题词第 3 级；「Looks good to me」评审评论样式，占半屏；「Merged to main」两行字母汇合成一行；「every machine」在设备墙每块屏上同时出现 |
| S18 | 星图 | 「oh」不写成字：每一声点亮一颗 clay 星；片尾字幕网格落位，标注级 |

### 三、场景交接物（17 个切点，数值写在 `app/src/kit/handoff.ts`，两边场景都 import 它）
pdoom 把交接常量复制在两个文件里，改一边另一边就不同步；我们只存一份。规则：上一场最后 1 拍把交接物移到约定的位置和尺寸，下一场第 1 帧就在那里接手。

| 切点 | 交接物 | 约定 |
|---|---|---|
| S01→S02 | clay 光标 | 光标停在 `cursor01`；S02 的墨→纸翻页从光标的 x 开始横向擦过 |
| S02→S03 | 通知卡 | 卡片矩形 = S03 表格顶栏矩形 `card02`（S03 从顶栏展开整张表） |
| S03→S04 | 迷你日历 | S03 右上角的迷你日历矩形 = S04 开场俯视月历在屏幕上的外框 `month03`；32 上的 clay 圈 = S04 计数器的起点 |
| S04→S05 | Clawd | Clawd 的屏幕位置和像素尺寸 `clawd04` 原样交给 S05 的平台 |
| S05→S06 | clay 高亮行 | 读到的那行代码的下划线 = S06 第一条删除线 `strike05` |
| S06→S07 | 笔尖光标 | 画勾的笔尖位置 = S07 第一颗亮起的键帽 `pen06` |
| S07→S08 | 光标（已有） | 沿用现有匹配剪辑 |
| S08→S09 | 哈希那一行的细线 | 收成水平线 = S09 示波器基线 `base08`（y = 540） |
| S09→S10 | 数字 19 | 左上角「19」的位置和大写高 `nineteen09` 两场一致 |
| S10→S11 | 碎片的下落方向 | 碎片最后的速度方向 = S11 风暴的倾角（`ROLL`），速度连续 |
| S11→S12 | 缺字方框 | 9 个 .notdef 方框的一排 = S12 复印件的一排 `boxes11` |
| S12→S13 | clay 的 11 | 「11」放大到满屏成为 S13 的 clay 半屏 |
| S13→S14 | git log 的上滚 | 上滚速度 = S14 下坠速度（方向相反、相对运动连续），行距 = 栈帧间距 |
| S14→S15 | 井底的 clay 发光线 | = S15 底部 `line 42` 注释行上方的细线 `line14` |
| S15→S16 | 剪下的那一截 | 下落的横杠 = S16 第一块骨牌 `domino15` |
| S16→S17 | 第 19 块骨牌 | 骨牌的面 = S17 clay 满屏的起点矩形 `domino16` |
| S17→S18 | git graph 的节点 | 节点位置 = S18 星图的前 N 颗星 `nodes17` |

### 四、同步的层次（照 pdoom，不合成一条规则）
切点 = 歌词附近的拍（分镜锚点，已有）；文字 = 逐词起止（不早于人声）；主题词冲击 = 音节（com-**MIT** 用 `syl: 2`）；连续动作 = 底鼓、包络（`f.a.kick`、`Voice.env`）；世界的重复动作 = 逐拍网格（`kit/time.ts`）。
