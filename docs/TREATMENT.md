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

## 视觉规范（初稿，2026-09-30）
方向：**R3 瑞士平面海报 × R2 高保真产品界面**。一句话：Clawd 在一张会动的瑞士海报里写代码。海报是世界，编辑器是悬在海报上方的实物面板，镜头在这个空间里运动。样张在 `out/design/f1-fusion-commit.png`、`f2-fusion-red-tests.png`（样张只示意方向；图里的 Clawd 画得不准，一律以 `reference/clawd/` 为准）。

### 色板（token；代码里只许用 token，不许写死颜色）
| token | 值 | 用途 |
|---|---|---|
| `paper` | #F2EFE9 | 底色、纸面 |
| `ink` | #1B2A4A | 主色：大字、网格线、界面文字 |
| `ink-2` | ink 的 60% / 30% / 12% | 次级文字、细线、界面分隔、阴影 |
| `clay` | #D77757 | 唯一的强调色：Clawd、主题词、当前行高亮、大圆 |
| `fail` | 待定（一个红） | **语义色，只用于测试失败**：失败标记、失败计数 |
| `pass` | 待定（一个绿） | **语义色，只用于测试通过**：通过标记、通过计数 |
- ⚑ 待 Tim 确认：红、绿两个语义色是否允许（故事里「19 red → 19 green」离不开它们）。C 的提议是允许，但只出现在测试状态上，其他地方一律不用。
- 代码高亮不用彩虹色：关键字、字符串等用 ink 的不同深浅和字重区分；只有「主角那一个词」用 clay。
- Clawd 身体色用官方的 `rgb(215,119,87)`（#D77757），和 clay 是同一个颜色，这是有意的：Clawd 就是这张海报的强调色。

### 字体
- 大字：Archivo（引擎已带），用 Black / ExtraBlack 字重，宽度按版面在 62–125 之间调；全大写，可以被画框裁切。
- 代码和界面：IBM Plex Mono（引擎已带）。界面上的非代码文字（面板标题、按钮）暂用 Archivo 常规宽度、中等字重。
- 歌词行：等宽小字，对齐网格（像 R3 里「I need one more commit」那一行）。主题句用大字。

### 版式
- 12 列模块网格，网格线是 ink 的细线（1 px @1080p，4K 下保持细），常驻画面，但可以随镜头运动。
- 左对齐、非对称。大字贴边、被裁切；留白比元素多。
- 大圆（clay）是反复出现的构图元素，可以当落拍时的冲击，也可以当太阳或日期。

### 界面（编辑器等物件）
- 仿真程度：**布局高保真，品牌不仿**。保留活动栏、侧栏（文件树、源代码管理）、标签页、行号、终端面板的结构和细节；不用 VS Code 的图标、名字、窗口红黄绿按钮，也不用它的配色。图标自己画成简单的线性图标。
- 面板是有厚度的实物：在纸面上投下柔和的影子；可以斜着看（三分之四透视）。
- 景深：远处的面板或面板远端虚化。需要新写后期步骤，或者按距离给每个面板单独模糊（阶段 5 定）。

### 镜头
- 平面海报的「推、拉、摇、移」，加上面板在 3D 空间里的斜看和旋转。
- 硬切落在强拍上；刹车 → 落拍用的是同一个构图（见分镜表）。

### 禁用
- 描边、贴纸、夸张的卡通造型（第一轮设计图被否的原因）
- 写实光影：影棚渐变、反射、镜头光晕、辉光
- 黑底，或大面积的深色底
- 渐变
- VS Code 的品牌元素
- 生图里画错的 Clawd 形状

### 代码能不能做（C 逐项核对过 R3、R2 两张图）
- ✅ 超大粗体字、等宽代码、网格细线、平面圆、高亮条、纸面颗粒
- ✅ 3D 斜看的界面面板（three.js 平面 + Canvas2D 画的界面贴图；4K 输出时贴图用 2 倍分辨率）
- ✅ 面板的柔和投影
- ⚠️ 景深：引擎目前没有，要新写，中等工作量
- ❌ 写实光影、反射：不做
