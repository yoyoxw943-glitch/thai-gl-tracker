import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query } from './db.js'
import seedData from './seed-data.js'

const app = express()
app.use(cors())
app.use(express.json())

const JWT_SECRET = process.env.JWT_SECRET || 'thai-gl-tracker-secret-2026'
const JWT_EXPIRES = '7d'

function generateToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES })
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please login first' })
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET)
    next()
  } catch {
    return res.status(401).json({ error: 'Session expired, please login again' })
  }
}

async function adminMiddleware(req, res, next) {
  try {
    const result = await query('SELECT is_admin FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user || !user.is_admin) {
      return res.status(403).json({ error: 'Admin access required' })
    }
    next()
  } catch {
    res.status(500).json({ error: 'Permission check failed' })
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try { req.user = jwt.verify(header.split(' ')[1], JWT_SECRET) } catch {}
  }
  next()
}

// ─── Auth Routes ───

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body
    if (!username || !email || !password) return res.status(400).json({ error: 'All fields are required' })
    if (username.length < 2 || username.length > 20) return res.status(400).json({ error: 'Username must be 2-20 characters' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const exist = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username])
    if (exist.rows.length > 0) return res.status(409).json({ error: 'Username or email already registered' })

    // First user becomes admin
    const total = await query('SELECT COUNT(*)::int as count FROM users')
    const isAdmin = total.rows[0]?.count === 0

    const hash = bcrypt.hashSync(password, 10)
    const result = await query(
      'INSERT INTO users (username, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, email, hash, isAdmin]
    )
    const user = result.rows[0]
    const token = generateToken({ id: user.id, username: user.username })
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Registration failed' })
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Please enter email and password' })

    const result = await query('SELECT * FROM users WHERE email = $1', [email])
    const user = result.rows[0]
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const token = generateToken(user)
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Login failed' })
  }
})

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT id, username, email, is_admin, created_at FROM users WHERE id = $1', [req.user.id])
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json({ user })
  } catch (e) {
    res.status(500).json({ error: 'Failed to get user info' })
  }
})

async function seedIfEmpty() {
  try {
    const count = await query('SELECT COUNT(*)::int as count FROM series')
    if (count.rows[0]?.count > 0) return false

    const dbType = process.env.POSTGRES_URL ? 'pg' : 'sqlite'
    for (let i = 0; i < seedData.length; i++) {
      const s = seedData[i]
      const sortOrder = s.sortOrder != null ? s.sortOrder : i
      if (dbType === 'pg') {
        await query(`INSERT INTO series (id, title_zh, title_en, title_th, poster, platform, start_date,
          total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
          [s.id, s.titleZh, s.titleEn, s.titleTh || '', s.poster || '', s.platform, s.startDate,
           s.totalEpisodes, s.airedEpisodes, s.updateDay || '', s.cpName || '', s.synopsis || '',
           s.status, JSON.stringify(s.watchLinks || []), sortOrder])
      } else {
        await query(`INSERT OR IGNORE INTO series (id, title_zh, title_en, title_th, poster, platform, start_date,
          total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [s.id, s.titleZh, s.titleEn, s.titleTh || '', s.poster || '', s.platform, s.startDate,
           s.totalEpisodes, s.airedEpisodes, s.updateDay || '', s.cpName || '', s.synopsis || '',
           s.status, JSON.stringify(s.watchLinks || []), sortOrder])
      }
    }
    return true
  } catch (e) {
    console.error('Auto-seed failed:', e.message)
    return false
  }
}

async function migratePosterPaths() {
  try {
    const count = await query("SELECT COUNT(*)::int as count FROM series WHERE poster LIKE '%.svg'")
    if (count.rows[0]?.count === 0) return
    await query("UPDATE series SET poster = REPLACE(poster, '.svg', '.jpg') WHERE poster LIKE '%.svg'")
    console.log(`Migrated ${count.rows[0].count} poster paths from .svg to .jpg`)
  } catch (e) {
    // Ignore migration errors — column might not exist yet
  }
}

async function migrateFixHometownRomance() {
  try {
    await query("UPDATE series SET update_day = 'Friday' WHERE id = 6 AND update_day = 'Thursday'")
  } catch (e) {
    // Ignore if column or row doesn't exist
  }
}

async function migrateDayNamesToEnglish() {
  const map = {
    '周一': 'Monday', '周二': 'Tuesday', '周三': 'Wednesday',
    '周四': 'Thursday', '周五': 'Friday', '周六': 'Saturday', '周日': 'Sunday',
  }
  try {
    for (const [cn, en] of Object.entries(map)) {
      await query('UPDATE series SET update_day = $1 WHERE update_day = $2', [en, cn])
    }
  } catch (e) {
    // Ignore
  }
}

async function migrateSynopsesToEnglish() {
  try {
    const synopses = {
      1: "Bookworm Pingrak has crushed on cool senior P'Charm for years but was repeatedly rejected. Years later, after a glamorous makeover, she becomes a rich heiress and the two reunite as on-screen lovers in a GL series, blurring the lines between fiction and reality. Ugly duckling transformation meets show-within-a-show.",
      2: "Sun secretly loves her best friend's older sister Rafah, a luxury car executive. To win her heart, Sun enters the cutthroat entertainment industry. Scandals, jealousy, and a separated twin sister's secret — a love story about courage and being true to yourself. Star Hunter Entertainment.",
      3: "A tight-knit friend group spirals into emotional chaos. Ad agency partners Prim and Min, Prim's ex Bambi returning as a client, model Shasha, stylist Gorya and photographer Praew — tangled relationships explode. GMMTV all-star GL lineup. 12 episodes, finale June 1.",
      4: "Arisa seeks revenge against a capitalist for her mother's sake but unexpectedly falls for the enemy's daughter Lalin. A dark GL tale of vengeance and forbidden love with cinematic noir aesthetics. Faye Peraya's follow-up after 'Blank'. Fabel Entertainment. Completed May 16.",
      5: "Single mom Inging manages an amusement park. New CEO Lilin plans to demolish it for a tutoring center. As they clash, they grow closer. Thai film award-winner Yada Narilya ('The Medium') makes her GL debut. Channel 3.",
      6: "City socialite Si is forced into an engagement with country girl Klao to renew her family's land lease. To prove herself, she moves to the countryside where two completely different worlds collide in a story of love and growth. Based on a popular novel. LMSY's third collaboration. Finale May 22.",
      7: "Six students and one teacher at an elite all-girls school each hide dark secrets. Scandals of the digital age threaten to expose everything — forbidden love, identity deception, and campus noir. FRT Entertainment's first GL series. Thai version aired 4/18, international uncut version on YouTube 6/6.",
      8: "College sweethearts Aioon and Pafun marry, dreaming of starting a family. When adoption proves difficult, their friend Nubnueng returns with an offer that changes everything. Thailand's first GL series focused on a married lesbian couple. Director Nay Saratswadee ('The Secret of Us').",
      9: "Princess Catherine of the fictional kingdom Madelin visits Thailand when an assassination attempt forces police officer Wayo to protect her. On the run, they develop a forbidden intimacy. FreenBecky's follow-up to 'The Loyal Pin'. Kantana, airing on iQIYI.",
      10: "Fresh graduate Mon lands a job at a major corporation only to discover CEO Sam is an arrogant, cold woman. Forced together daily, their animosity slowly turns into something more — but an 8-year age gap and class divide make this relationship a battlefield. The series that launched Thailand's GL boom. IdolFactory.",
      11: "Small-town girl Meena enters a beauty pageant and meets the dazzling reigning champion Cherine. As they spend time together, subtle feelings blossom. EngLot's debut collaboration — a sweet love story set in the world of pageantry. Grand Her Entertainment.",
      12: "Dawan keeps dreaming about the same mysterious girl. When new neighbors move in, she discovers the daughter Khimhan is the girl from her dreams. As they grow closer, Dawan realizes these dreams may not be hers alone. A supernatural romance. Star Hunter.",
      13: "Freshman Manaow, under the strict senior-junior system of the Engineering faculty, falls for second-year student council member Gyoza. AndaLookkaew's signature work. Star Hunter Entertainment.",
      14: "An ensemble story of multiple couples navigating romance and friendship, centered around dormitory life and campus love.",
      15: "A lighthearted GL mini-series about the sweet romance between two girls. A feel-good short story.",
      16: "A GL side story from Club Friday Season 16 featuring EngLot in a special guest appearance as two women caught between love and circumstances.",
      17: "A 16-year age-gap romance. Young Nueng, at her lowest point, meets older Anueng, and the two heal each other as they fall deeply in love. FayeYoko's breakout hit — emotionally intense with explosive performances. NineStar Studios.",
      18: "Transfer student Sun secretly crushes on senior Ongsa online using the alias 'Earth'. When she's found out, a mix of sweet and awkward school romance ensues. GMMTV's first GL series. MilkLove's refreshing campus love story. Netflix.",
      19: "Two girls meet through work and go from strangers to something more in this sweet love story. BmineNear collaboration.",
      20: "Doctor Fahlada suffered a painful breakup with her ex Earn. Years later, Earn returns as the hospital's new brand ambassador, forcing them to face the feelings that never healed. Channel 3's first GL series. LingOrm's explosive debut. Netflix.",
      21: "1950s. Princess Anin and noble girl Pin grew up together. After studying in England, Anin realizes she loves Pin — but returns to find Pin betrothed to another. FreenBecky's period romance epic. IdolFactory. Netflix.",
      22: "Childhood friends Wan and Pleng are torn apart by family misfortune. Reunited years later, they now belong to different worlds. A gut-wrenching emotional rollercoaster. LMSY's first starring GL, hailed as a masterpiece of angst. Kongthup.",
      23: "Two sisters possess extraordinary powers — one sees the future, the other reverses time. When fate forces them to choose, love becomes the most uncontrollable variable. Fantasy GL series. Kantana, Netflix.",
      24: "A girl regains her sight and searches for the voice that comforted her in the darkness. OrmFolk's bittersweet romance, adapted from a Chao Planoy novel. Kongthup.",
      25: "A rich heiress falls for her innocent, pure-hearted childhood friend. GraceOaey's signature work. Zense Entertainment.",
      26: "Twin sisters Ob-oom and Ai-oon are polar opposites. When Ob-oom falls into a coma on her wedding night, Ai-oon must impersonate her — only to discover Ob-oom's secret lover May, and realize May might not be who she thought. NamtanFilm's GMMTV debut. A story of identity, deception, and unexpected love.",
      27: "Rookie detective Tul is assigned to partner with forensic doctor Cherran on a murder case. Their conflicting styles clash — but as the trail leads to an elusive serial killer from 18 years ago, they must join forces. EngLot crime thriller. GMMTV/MGI. Netflix.",
      28: "18-year-old Dokrak meets dentistry student Pam at a cafe and falls at first sight — but her brother Kawi also falls for Pam and asks Dokrak to play matchmaker. Torn between family and love, a heartbreaking story unfolds. OrmFolk's second pairing. Kongthup.",
      29: "A fantasy romance that transcends time — two souls from different eras meet and fall in love. Channel 3.",
      30: "To save her family's failing grocery store, a girl returns to her hometown and reunites with a childhood friend. Together at the whale-themed shop, they rediscover life's meaning and love. MilkLove's second pairing. A warm, healing GL from GMMTV. Netflix.",
      31: "A dangerous love story shrouded in secrets. LMSY's second pairing. High-production dark romance by Change2561.",
      32: "A bodyguard is assigned to protect a famous singer. Trapped together day and night, mutual annoyance slowly turns into hidden feelings. LingOrm's second pairing. Action + romance. Channel 3, Netflix.",
      33: "An engineer and a VP — two complete opposites — collide on a project and sparks fly. FayMay's third pairing. A romantic comedy from IdolFactory.",
      34: "Two women from completely different backgrounds accidentally swap bodies and are forced to live in each other's worlds. Enemies-to-lovers body-swap comedy. WeTV exclusive.",
      35: "Architect Aokbab returns from Japan to take over her late mother's firm, only to discover ex-lover Mind once plagiarized her design for a competition. Ex-lovers become workplace rivals, and genius architect Rin makes their triangle even more complicated. GraceOaey. Zense.",
      36: "Four Elements series: Earth. A geologist and a farmer meet in a remote mountain village, where stories between the land and the heart unfold. Freen and Engfa cameo. North Star Entertainment.",
      37: "Childhood sweethearts reunite after years apart. Can a childhood promise be kept? Channel 3, Netflix.",
      38: "A love story as toxic as it is unbreakable. North Star Entertainment's highly-rated GL series.",
      39: "Two souls meet within dreams in this fantasy romance GL series.",
      40: "Multiple couples weave together a tapestry of love stories. EngLot reunites. MGI / TV Thunder.",
      41: "AndaLookkaew reunite in this story of love and choices. Star Hunter Entertainment.",
      42: "Two women navigate survival and love within the walls of a prison. Mine Media.",
      43: "Cake shop owner Vicky, daughter of a high-ranking police officer, survives an assassination attempt and is sent by her father to a 7-day VIP police training program. There she meets Captain Thara — a disciplined female officer who once saved her life. Mono Original's first GL series.",
      44: "Four Elements series: Water. The second installment starring Engfa Waraha and Charlotte Austin. North Star Entertainment.",
      45: "Two department heads are sworn office enemies — until a one-night accident leads to a secret friends-with-benefits arrangement. GMMTV's 2026 GL powerhouse.",
      46: "A forbidden love between an angel and a mortal. Penny Studio, airing on iQIYI.",
      49: "A powerful queen and an ordinary girl caught in a dangerous love game. S.Nur Entertainment.",
      47: "Pun hires someone for a fake marriage but gets scammed out of her money. To uncover the truth, she must get close to actress Ploy, who holds a crucial secret. A love game born from deception — who's the real player? Heart Pop Studio, from the director of 'Petrichor'.",
      48: "35-year-old Rin, betrayed by her ex-girlfriend and heartbroken, is forced by her father to marry 23-year-old Khem for two years in exchange for inheritance and the CEO position. Rin plans to divorce after two years, but Khem is determined to melt this ice queen's heart. Contract marriage + age gap. Copy A Bangkok's first GL.",
      50: "Singer Pure, still hung up on ex-girlfriend Air who sacrificed their love for family obligations, can't move on. At a bar, she runs into Air — but it's Air's sister-in-law Loft who falls for Pure at first sight. Caught between unforgettable old love and sincere new passion, what will Pure choose? Motion Minds Entertainment's first GL.",
      51: "After losing her parents, Lalin runs the family resort alone until she meets Dawan, a girl with amnesia, and reunites with longtime friend Lan. Three hearts intertwine in a complex emotional triangle. MCOT x IDX Entertainment. Sparked controversy for bold intimate scenes.",
      52: "Aran has secretly loved senior Lene for years. Rejected on graduation day, she leaves town. Five years later, a mysterious letter brings her back — only to find Lene has been murdered. Killed herself, she somehow travels back five years in time. This time, she'll become Lene's personal bodyguard and save her at all costs. MeMindY's first GL. Mystery time-travel romance.",
      53: "Two young women who can't stand each other are forced to live under the same roof. Daily life slowly transforms their initial disgust into unspoken feelings. Kongthup Production. PraifahBebell's first GL starring role. Short-form, 12 minutes per episode.",
      54: "Winrawi has only 168 hours to live — hunted by a relentless vengeful spirit. Desperate, she seeks help from Boon, a psychic's daughter, who coldly refuses. As time runs out, she must face the dark secrets of her past. Baanchan Production. Horror suspense GL, adapted from a Zonlicht novel.",
      55: "Actress Mookmanee rose to fame playing villains. She once fell for reality show partner Grace, only to be torn apart by Grace's mother. Hardened against love, she frequents lesbian club Hera Club. When she meets her future sister-in-law Prangdao, things become impossibly complicated. Two seasons, 11 episodes total.",
    }
    for (const [id, syn] of Object.entries(synopses)) {
      await query('UPDATE series SET synopsis = $1 WHERE id = $2', [syn, id])
    }
  } catch (e) { /* ignore */ }
}

async function migrateNewSeries() {
  const newSeries = [
    [43, '心之密码', 'Heart Code', 'รหัสลับ(รัก) มาเฟีย', '/posters/43.jpg', 'Monomax', '2026-01-12', 7, 7, '', 'Tungpang × Jessie', '蛋糕店老板Vicky是高级警官的女儿，遭遇暗杀未遂后被父亲安排参加7天VIP警察训练。在那里她遇到了救过她的Captain Thara。Mono Original 首部GL剧集。', 'completed', JSON.stringify([{platform:'Monomax',url:'https://www.monomax.me/'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Heart%20Code%20Thai%20GL'}])],
    [44, '水之魅影', '4 Elements: The Water', 'น้ำคำณเวท', '/posters/44.jpg', 'iQIYI', '2026-04-11', 8, 8, '', 'Engfa × Charlotte', '四元素系列第二部《水》。North Star Entertainment 出品，Engfa Waraha 与 Charlotte Austin 主演。', 'completed', JSON.stringify([{platform:'iQIYI',url:'https://www.iq.com/search/4%20Elements%20The%20Water'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=4%20Elements%20The%20Water'}])],
    [45, '宿敌恋人', 'Enemies With Benefits', 'ลัลล์ไม่ชอบไวน์', '/posters/45.jpg', 'GMMTV / YouTube', '2026-05-03', 10, 0, 'Sunday', 'Jan × Jingjing', '两个部门主管在公司里水火不容，却在一夜意外之后开始了秘密的床伴关系。GMMTV 2026年GL力作。', 'airing', JSON.stringify([{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Enemies+With+Benefits+Thai+GL'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Enemies%20With%20Benefits%20Thai%20GL'}])],
    [46, '只属于我的天使', 'Be My Angel', '', '/posters/46.jpg', 'iQIYI', '2026-05-07', 8, 8, '', 'BamBam × Baipor', '天使与凡人的禁忌爱情。Penny Studio 出品，iQIYI 同步播出。', 'completed', JSON.stringify([{platform:'iQIYI',url:'https://www.iq.com/search/Be%20My%20Angel'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Be%20My%20Angel%20Thai%20GL'}])],
    [49, '女王危爱', 'Dangerous Queen', '', '/posters/49.jpg', 'S.Nur Entertainment / YouTube', '2025-11-08', 8, 8, '', 'Tangkwa × Nur', '一位权势滔天的女王与一位普通女孩的危险爱情游戏。S.Nur Entertainment 出品。', 'completed', JSON.stringify([{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Dangerous+Queen+Thai+GL'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Dangerous%20Queen%20Thai%20GL'}])],
    [47, '爱情玩家', 'Player', 'ไม่อาจห้ามรัก', '/posters/47.jpg', 'iQIYI / YouTube', '2025-10-03', 12, 12, '', 'Ice × Memi', 'Pun雇人假结婚却被骗走钱财，为追查真相她必须接近掌握关键秘密的女演员Ploy。一场始于欺骗的爱情游戏，谁才是真正的玩家？Heart Pop Studio出品，导演曾执导Petrichor。', 'completed', JSON.stringify([{platform:'iQIYI',url:'https://www.iq.com/search/Player%20Thai%20GL'},{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Player%20Thai%20GL'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Player%20Thai%20GL'}])],
    [48, '不被爱的爱', 'Denied Love', 'รินไม่มีวันรัก', '/posters/48.jpg', 'WeTV', '2025-05-29', 10, 10, '', 'Enjoy × June', '35岁的Rin被前女友背叛后心灰意冷，父亲要求她与23岁的Khem结婚两年以换取遗产和总裁之位。Rin打算两年后离婚，但Khem却决心用真心融化这座冰山。契约婚姻+年龄差，Copy A Bangkok首部GL。', 'completed', JSON.stringify([{platform:'WeTV',url:'https://wetv.vip/'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Denied%20Love%20Thai%20GL'}])],
    [50, '情感过山车', 'Roller Coaster', '', '/posters/50.jpg', 'Channel 3 / YouTube', '2025-08-13', 8, 8, '', 'Neko × Aom × Shelly', '歌手Pure被前女友Air为家族婚姻牺牲而分手，一直无法释怀。在酒吧偶遇Air时，却被Air的小姨子Loft一见钟情。夹在难以忘怀的旧爱和真诚热烈的新欢之间，Pure该如何抉择？Motion Minds Entertainment首部GL。', 'completed', JSON.stringify([{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Roller+Coaster+Thai+GL'},{platform:'Channel 3',url:'https://ch3plus.com/'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Roller%20Coaster%20Thai%20GL'}])],
    [51, '闺蜜以上', 'B-Friend', 'เจตนา (ไม่) ลืม', '/posters/51.jpg', 'MCOT / WeTV', '2025-05-31', 12, 12, '', 'Pai × Nam × FayFay', 'Lalin失去父母后独自经营家族度假村，遇到失忆女孩Dawan，又与久别重逢的Lan重聚。三人之间暗生情愫，形成复杂的情感三角。MCOT × IDX Entertainment出品，因大胆的亲密戏引发热议。', 'completed', JSON.stringify([{platform:'WeTV',url:'https://wetv.vip/'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=B-Friend%20Thai%20GL'}])],
    [52, '逾梦深情', 'Love Beyond Dreams', 'เพื่อเธออีกครั้ง', '/posters/52.jpg', 'iQIYI', '2026-05-06', 10, 2, 'Wednesday', 'Aya × Mie', 'Aran暗恋学姐Lene多年，毕业那天表白被拒后远走他乡。五年后收到神秘信件归来却发现Lene已遇害。自己被杀后竟穿越回五年前——这一次她要成为Lene的贴身保镖，不惜一切代价拯救她。MeMindY首部GL，悬疑穿越题材。', 'airing', JSON.stringify([{platform:'iQIYI',url:'https://www.iq.com/search/Love%20Beyond%20Dreams'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Love%20Beyond%20Dreams%20Thai%20GL'}])],
    [53, '爱之阴影', 'Shadow of Love', '', '/posters/53.jpg', 'YouTube', '2026-03-24', 24, 24, '', 'Praifah × Bebell', '两个互相看不顺眼的年轻女孩被迫住在同一屋檐下。日常相处让最初的厌恶慢慢转变为不可言说的情愫。Kongthup Production出品，PraifahBebell首次主演GL，短剧形式每集12分钟。', 'completed', JSON.stringify([{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Shadow+of+Love+Thai+GL'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Shadow%20of%20Love%20Thai%20GL'}])],
    [54, '逃亡', 'Runaway', 'หนีไปก็ตายเปล่า', '/posters/54.jpg', 'Channel 3 / YouTube', '2025-11-04', 8, 8, '', 'Music × Plaifah', 'Winrawi只剩168小时可活——被无情的怨灵追杀。绝望中她向灵媒之女Boon求助却遭冷酷拒绝。随时间流逝，她必须直面过去黑暗的秘密。Baanchan Production出品，恐怖悬疑GL，改编自Zonlicht小说。', 'completed', JSON.stringify([{platform:'YouTube',url:'https://www.youtube.com/results?search_query=Runaway+Thai+GL'},{platform:'Channel 3',url:'https://ch3plus.com/'},{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=Runaway%20Thai%20GL'}])],
    [55, '我是恶魔', 'I Am Devil', 'เตือนแล้วนะ... ว่าฉันร้าย', '/posters/55.jpg', 'Channel 9 MCOT HD', '2024-12-25', 7, 7, '', 'Mook × Pinky', '演员Mookmanee因饰演反派走红，曾与真人秀搭档Grace相恋却被对方母亲拆散。对爱情绝望后频繁光顾女同俱乐部Hera Club。当她遇到未来的小姑子Prangdao时，事情变得无比复杂。两季共11集。', 'completed', JSON.stringify([{platform:'Bilibili',url:'https://search.bilibili.com/all?keyword=I+Am+Devil+Thai+GL'}])]
  ]
  try {
    const dbType = process.env.POSTGRES_URL ? 'pg' : 'sqlite'
    for (const s of newSeries) {
      const exists = await query('SELECT COUNT(*)::int as count FROM series WHERE id = $1', [s[0]])
      if (exists.rows[0]?.count > 0) continue
      if (dbType === 'pg') {
        await query(`INSERT INTO series (id, title_zh, title_en, title_th, poster, platform, start_date, total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, [...s, s[0] - 1])
      } else {
        await query(`INSERT OR IGNORE INTO series (id, title_zh, title_en, title_th, poster, platform, start_date, total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...s, s[0] - 1])
      }
      console.log('Migrated: added series', s[0], s[1])
    }
  } catch (e) {
    console.error('Migration new series failed:', e.message)
  }
}

// ─── Series Routes ───

async function autoCompleteSeries() {
  try {
    const airing = await query("SELECT * FROM series WHERE status = 'airing'")
    for (const row of airing.rows) {
      const aired = calcAired(row)
      if (aired >= row.total_episodes && row.total_episodes > 0) {
        await query("UPDATE series SET status = 'completed', aired_episodes = $1 WHERE id = $2", [aired, row.id])
        console.log(`Auto-completed: ${row.title_zh} (${aired}/${row.total_episodes})`)
      }
    }
  } catch (e) {
    console.error('Auto-complete check failed:', e.message)
  }
}

app.get('/api/series', async (req, res) => {
  try {
    await seedIfEmpty()
    await migratePosterPaths()
    await migrateFixHometownRomance()
    await migrateDayNamesToEnglish()
    await migrateSynopsesToEnglish()
    await migrateNewSeries()
    await autoCompleteSeries()
    const result = await query('SELECT * FROM series ORDER BY sort_order ASC, start_date DESC')
    res.json({ series: result.rows.map(formatSeries) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to get series list' })
  }
})

app.get('/api/series/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'Series not found' })
    res.json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    res.status(500).json({ error: 'Failed to get series' })
  }
})

app.post('/api/series', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks } = req.body
    if (!titleZh || !platform || !startDate) {
      return res.status(400).json({ error: 'Title, platform and start date are required' })
    }
    // Get max sort_order to place new series at the end
    const maxOrder = await query('SELECT COALESCE(MAX(sort_order), -1)::int as max_order FROM series')
    const nextOrder = maxOrder.rows[0]?.max_order + 1
    const result = await query(`
      INSERT INTO series (title_zh, title_en, title_th, poster, platform, start_date,
        total_episodes, aired_episodes, update_day, cp_name, synopsis, status, watch_links, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *
    `, [titleZh, titleEn || '', titleTh || '', poster || '', platform, startDate,
      totalEpisodes || 0, airedEpisodes || 0, updateDay || '', cpName || '', synopsis || '',
      status || 'upcoming', JSON.stringify(watchLinks || []), nextOrder])
    res.status(201).json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to add series' })
  }
})

app.put('/api/series/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Series not found' })
    const existing = r.rows[0]
    const { titleZh, titleEn, titleTh, poster, platform, startDate,
      totalEpisodes, airedEpisodes, updateDay, cpName, synopsis, status, watchLinks } = req.body
    const result = await query(`
      UPDATE series SET title_zh=$1, title_en=$2, title_th=$3, poster=$4, platform=$5,
        start_date=$6, total_episodes=$7, aired_episodes=$8, update_day=$9,
        cp_name=$10, synopsis=$11, status=$12, watch_links=$13
      WHERE id=$14 RETURNING *
    `, [
      titleZh ?? existing.title_zh, titleEn ?? existing.title_en,
      titleTh ?? existing.title_th, poster ?? existing.poster,
      platform ?? existing.platform, startDate ?? existing.start_date,
      totalEpisodes ?? existing.total_episodes, airedEpisodes ?? existing.aired_episodes,
      updateDay ?? existing.update_day, cpName ?? existing.cp_name,
      synopsis ?? existing.synopsis, status ?? existing.status,
      watchLinks ? JSON.stringify(watchLinks) : existing.watch_links,
      req.params.id,
    ])
    res.json({ series: formatSeries(result.rows[0]) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to update series' })
  }
})

app.delete('/api/series/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM series WHERE id = $1', [req.params.id])
    if (r.rows.length === 0) return res.status(404).json({ error: 'Series not found' })
    await query('DELETE FROM series WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete series' })
  }
})

app.put('/api/series/:id/reorder', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { direction, toIndex } = req.body

    // Get all series in current display order, with id as tiebreaker for equal sort_order
    const all = await query('SELECT id FROM series ORDER BY sort_order ASC, id ASC')
    const ids = all.rows.map(r => r.id)
    const idx = ids.indexOf(Number(req.params.id))

    if (idx === -1) return res.status(404).json({ error: 'Series not found' })

    let newIdx

    if (toIndex != null) {
      // Drag to specific position
      newIdx = Math.max(0, Math.min(ids.length - 1, Number(toIndex)))
      if (newIdx === idx) return res.json({ swapped: false })
      ids.splice(idx, 1)
      ids.splice(newIdx, 0, Number(req.params.id))
    } else if (direction === 'up' || direction === 'down') {
      newIdx = direction === 'up' ? idx - 1 : idx + 1
      if (newIdx < 0 || newIdx >= ids.length) {
        return res.json({ swapped: false, message: 'Already at first/last position' })
      }
      ;[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
    } else {
      return res.status(400).json({ error: 'direction or toIndex parameter required' })
    }

    // Re-assign sequential sort_order to all series
    for (let i = 0; i < ids.length; i++) {
      await query('UPDATE series SET sort_order = $1 WHERE id = $2', [i, ids[i]])
    }

    res.json({ swapped: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Reorder failed' })
  }
})

// ─── Cron Routes ───

app.get('/api/cron/update-aired-episodes', async (req, res) => {
  const isVercelCron = req.headers['x-vercel-cron'] === '1'
  const hasSecret = process.env.CRON_SECRET && req.query.secret === process.env.CRON_SECRET
  if (!isVercelCron && !hasSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await autoCompleteSeries()
    const result = await query("SELECT * FROM series WHERE status = 'airing'")
    let updatedCount = 0

    for (const row of result.rows) {
      const computed = calcAired(row)
      if (computed !== row.aired_episodes) {
        await query('UPDATE series SET aired_episodes = $1 WHERE id = $2', [computed, row.id])
        updatedCount++
      }
    }

    res.json({ success: true, updated: updatedCount, total: result.rows.length, timestamp: new Date().toISOString() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Cron job failed' })
  }
})

function formatSeries(row) {
  return {
    id: row.id,
    titleZh: row.title_zh,
    titleEn: row.title_en,
    titleTh: row.title_th,
    poster: row.poster,
    platform: row.platform,
    startDate: row.start_date,
    totalEpisodes: row.total_episodes,
    airedEpisodes: calcAired(row),
    updateDay: row.update_day,
    cpName: row.cp_name,
    synopsis: row.synopsis,
    status: row.status,
    watchLinks: typeof row.watch_links === 'string' ? JSON.parse(row.watch_links) : row.watch_links,
    sortOrder: row.sort_order ?? 0,
    created_at: row.created_at,
  }
}

function calcAired(row) {
  if (row.status !== 'airing' || !row.start_date || !row.update_day) return row.aired_episodes
  const start = new Date(row.start_date)
  const today = new Date()
  if (today < start) return 0

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const targetDay = dayNames.indexOf(row.update_day)
  if (targetDay === -1) return row.aired_episodes

  const firstAir = new Date(start)
  firstAir.setDate(start.getDate() + (targetDay - start.getDay() + 7) % 7)
  const diffDays = Math.floor((today - firstAir) / (1000 * 60 * 60 * 24))
  return Math.min(Math.max(Math.floor(diffDays / 7) + 1, 0), row.total_episodes)
}

// ─── Review Routes ───

app.get('/api/reviews/:seriesId', optionalAuth, async (req, res) => {
  try {
    const reviews = await query(
      'SELECT id, series_id, user_id, username, rating, comment, created_at FROM reviews WHERE series_id = $1 ORDER BY created_at DESC',
      [req.params.seriesId]
    )
    const avg = await query(
      'SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating, COUNT(*)::int as count FROM reviews WHERE series_id = $1',
      [req.params.seriesId]
    )
    res.json({
      reviews: reviews.rows,
      avgRating: avg.rows[0]?.avg_rating || 0,
      reviewCount: avg.rows[0]?.count || 0,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to get reviews' })
  }
})

app.post('/api/reviews', authMiddleware, async (req, res) => {
  try {
    const { seriesId, rating, comment } = req.body
    if (!seriesId || !rating || !comment) return res.status(400).json({ error: 'Please enter rating and comment' })
    if (rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' })
    if (comment.length < 2) return res.status(400).json({ error: 'Comment must be at least 2 characters' })

    const exist = await query('SELECT id FROM reviews WHERE series_id = $1 AND user_id = $2', [seriesId, req.user.id])
    if (exist.rows.length > 0) return res.status(409).json({ error: 'You already reviewed this series' })

    const result = await query(
      'INSERT INTO reviews (series_id, user_id, username, rating, comment) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [seriesId, req.user.id, req.user.username, rating, comment]
    )
    res.json({ review: result.rows[0] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Failed to post review' })
  }
})

app.put('/api/reviews/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Review not found' })
    if (r.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Can only edit your own review' })

    const { rating, comment } = req.body
    const result = await query(
      'UPDATE reviews SET rating = $1, comment = $2 WHERE id = $3 RETURNING *',
      [rating || r.rows[0].rating, comment || r.rows[0].comment, req.params.id]
    )
    res.json({ review: result.rows[0] })
  } catch (e) {
    res.status(500).json({ error: 'Update failed' })
  }
})

app.delete('/api/reviews/:id', authMiddleware, async (req, res) => {
  try {
    const r = await query('SELECT * FROM reviews WHERE id = $1', [req.params.id])
    if (!r.rows[0]) return res.status(404).json({ error: 'Review not found' })
    if (r.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Can only delete your own review' })

    await query('DELETE FROM reviews WHERE id = $1', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' })
  }
})

export default app
