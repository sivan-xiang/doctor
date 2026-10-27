// 构建内容：解析 /content/**/*.md 的 frontmatter → 校验 → 生成索引与内联数据
// 用法：
//   node scripts/build-content.mjs              构建并输出
//   node scripts/build-content.mjs --check-only 仅校验（CI / 发布闸门）
// 校验失败时退出码为 1，且不写出任何产物（阻断发布）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const CONTENT_DIR = path.join(ROOT, 'content');
const ASSETS_DIR = path.join(ROOT, 'assets');
const CHECK_ONLY = process.argv.includes('--check-only');

const CATEGORIES = [
  { key: 'emergency', name: '应急处理', desc: '分秒必争的急救场景', icon: '🆘' },
  { key: 'daily-medicine', name: '日常医药', desc: '常见不适的家庭护理', icon: '💊' },
  { key: 'medicine-kit', name: '家庭药箱', desc: '储存、清理与常备原则', icon: '🧰' },
  { key: 'seek-care', name: '就医指引', desc: '何时就医、怎么准备、如何沟通', icon: '🏥' },
  { key: 'misconceptions', name: '常见误区', desc: '那些代代相传的错做法', icon: '🚫' },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const STATUS_KEYS = ['draft', 'reviewed', 'published', 'archived'];
const FORBIDDEN = ['确诊', '治愈', '替代就医', '保证有效', '包治', '立竿见影', '药到病除', '神药'];
// 中文没有词边界，合法复合词会包含违规子串（如「明确诊断」含「确诊」、「精神类药品」含「神药」）。
// 匹配前先剔除这些白名单短语，避免误报导致合规校验形同虚设。
const ALLOWED_PHRASES = [
  '明确诊断',
  '初步诊断',
  '鉴别诊断',
  '精神类药品',
  '神经类药物',
];

const ICONS = {
  burns: '🔥',
  bleeding: '🩹',
  nosebleed: '👃',
  choking: '😮',
  heatstroke: '🥵',
  allergy: '🤧',
  poisoning: '☠️',
  fever: '🤒',
  diarrhea: '💧',
  cold: '😷',
  storage: '📦',
  expiry: '🗑️',
  essential: '🧰',
  'nosebleed-headback': '🙅',
  'burns-toothpaste': '🙅',
  'fever-cover': '🙅',
  'wound-suck': '🙅',
  drowning: '🏊',
  'head-injury': '🤕',
  'eye-chemical': '👁️',
  fainting: '😵',
  'bee-sting': '🐝',
  headache: '🤯',
  stomachache: '😖',
  insomnia: '😴',
  'menstrual-pain': '🌸',
  eczema: '🧴',
  'kit-list': '🧾',
  topical: '🧴',
  'travel-kit': '🎒',
  'iv-drip': '💉',
  'herbal-safe': '🌿',
  'fever-diet': '🍲',
  'when-emergency': '🚑',
  'when-clinic': '🏥',
  'before-visit': '📋',
  'describe-symptoms': '🗣️',
  'call-120': '📞',
  'med-list': '💊',
};

const DEFAULT_DISCLAIMER =
  '本内容仅用于健康科普，不构成诊断、处方或治疗建议，紧急情况请拨打 120。';

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

function unquote(v) {
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"');
  }
  return s;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const data = {};
  let currentKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(unquote(item[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const val = kv[2].trim();
    currentKey = key;
    if (val === '') {
      data[key] = [];
    } else if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val
        .slice(1, -1)
        .split(',')
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
    } else {
      data[key] = unquote(val);
    }
  }
  // 空值且未被列表填充的字段，视为空字符串
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k]) && data[k].length === 0 && !['keywords', 'steps', 'donts'].includes(k)) {
      data[k] = '';
    }
  }
  return { data, body: m[2].trim() };
}

function mdToHtml(md) {
  if (!md) return '';
  const lines = md.split(/\r?\n/);
  const out = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };
  const inline = (s) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      out.push(`<h4>${inline(line.slice(4))}</h4>`);
    } else if (line.startsWith('## ')) {
      closeList();
      out.push(`<h3>${inline(line.slice(3))}</h3>`);
    } else if (line.startsWith('- ')) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

const errors = [];
const seenSlugs = new Map();
const articles = [];

for (const file of walk(CONTENT_DIR)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const parsed = parseFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!parsed) {
    errors.push(`${rel}: 缺少合法的 frontmatter（需以 --- 开始并以 --- 结束）`);
    continue;
  }
  const { data: fm, body } = parsed;
  const dirCategory = path.basename(path.dirname(file));
  const label = fm.slug || rel;

  const required = [
    'title',
    'slug',
    'category',
    'scenario',
    'summary',
    'steps',
    'donts',
    'when_to_seek_help',
    'source',
    'reviewer',
    'reviewed_at',
    'updated_at',
    'version',
    'status',
  ];
  for (const key of required) {
    const v = fm[key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      errors.push(`${rel}: 缺少必填字段 ${key}`);
    }
  }

  if (fm.category && !CATEGORY_KEYS.includes(fm.category)) {
    errors.push(`${rel}: category「${fm.category}」不在枚举内`);
  }
  if (fm.category && dirCategory !== fm.category) {
    errors.push(`${rel}: 目录(${dirCategory}) 与 category(${fm.category}) 不一致`);
  }
  if (fm.status && !STATUS_KEYS.includes(fm.status)) {
    errors.push(`${rel}: status「${fm.status}」不在枚举内`);
  }

  if (fm.status === 'published') {
    for (const key of ['source', 'reviewer', 'reviewed_at', 'updated_at', 'version']) {
      if (!fm[key]) errors.push(`${rel}: published 内容缺少 ${key}，禁止发布`);
    }
  }

  if (fm.title && [...fm.title].length > 20) errors.push(`${label}: title 超过 20 字`);
  if (fm.summary && [...fm.summary].length > 40) errors.push(`${label}: summary 超过 40 字`);

  const steps = Array.isArray(fm.steps) ? fm.steps : [];
  if (steps.length < 3 || steps.length > 6) {
    errors.push(`${label}: steps 必须为 3–6 条（当前 ${steps.length}）`);
  }
  steps.forEach((s, i) => {
    if ([...s].length > 50) errors.push(`${label}: steps[${i}] 超过 50 字`);
  });

  const donts = Array.isArray(fm.donts) ? fm.donts : [];
  if (donts.length < 1) errors.push(`${label}: donts 至少 1 条`);
  donts.forEach((s, i) => {
    if ([...s].length > 30) errors.push(`${label}: donts[${i}] 超过 30 字`);
  });

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  for (const key of ['reviewed_at', 'updated_at']) {
    if (fm[key] && !dateRe.test(fm[key])) errors.push(`${label}: ${key} 必须为 YYYY-MM-DD`);
  }
  if (dateRe.test(fm.reviewed_at || '') && dateRe.test(fm.updated_at || '')) {
    if (fm.updated_at < fm.reviewed_at) errors.push(`${label}: updated_at 早于 reviewed_at`);
  }

  if (fm.slug) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.slug)) {
      errors.push(`${label}: slug 只能使用英文小写字母、数字和短横线`);
    }
    if (seenSlugs.has(fm.slug)) {
      errors.push(`${label}: slug「${fm.slug}」与 ${seenSlugs.get(fm.slug)} 重复`);
    } else {
      seenSlugs.set(fm.slug, rel);
    }
  }

  const checkText = [fm.title, fm.summary, ...steps, ...donts, fm.when_to_seek_help, body]
    .filter(Boolean)
    .join(' ');
  let scanText = checkText;
  for (const phrase of ALLOWED_PHRASES) scanText = scanText.split(phrase).join('');

  for (const word of FORBIDDEN) {
    if (scanText.includes(word)) errors.push(`${label}: 出现违规表述「${word}」`);
  }

  if (fm.slug && fm.title) {
    articles.push({
      slug: fm.slug,
      title: fm.title,
      category: fm.category || dirCategory,
      scenario: fm.scenario || '',
      summary: fm.summary || '',
      priority: Number(fm.priority || 99),
      keywords: Array.isArray(fm.keywords) ? fm.keywords : [],
      steps,
      donts,
      when_to_seek_help: fm.when_to_seek_help || '',
      special_groups: fm.special_groups || '',
      source: fm.source || '',
      reviewer: fm.reviewer || '',
      reviewed_at: fm.reviewed_at || '',
      updated_at: fm.updated_at || '',
      version: String(fm.version || ''),
      status: fm.status || 'draft',
      disclaimer: fm.disclaimer || DEFAULT_DISCLAIMER,
      icon: ICONS[fm.slug] || '📄',
      body,
      bodyHtml: mdToHtml(body),
      text: [
        fm.title,
        fm.scenario,
        fm.summary,
        ...(Array.isArray(fm.keywords) ? fm.keywords : []),
        ...steps,
        ...donts,
        fm.when_to_seek_help,
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
}

if (errors.length) {
  console.error(`\n✗ 内容校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error('  - ' + e);
  console.error('\n构建已终止（未写出任何产物）。');
  process.exit(1);
}

articles.sort((a, b) => {
  const ca = CATEGORY_KEYS.indexOf(a.category);
  const cb = CATEGORY_KEYS.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.title.localeCompare(b.title, 'zh');
});

const categories = CATEGORIES.map((c) => ({
  ...c,
  count: articles.filter((a) => a.category === c.key).length,
}));

const payload = {
  generatedAt: new Date().toISOString(),
  version: '1.0',
  categories,
  articles,
};

console.log(`✓ 校验通过：${articles.length} 篇内容，${categories.length} 个分类`);

if (CHECK_ONLY) {
  process.exit(0);
}

fs.mkdirSync(ASSETS_DIR, { recursive: true });

// 1) 可供检视 / 复用的索引
fs.writeFileSync(path.join(ROOT, 'content.json'), JSON.stringify(payload, null, 2), 'utf8');

// 2) 搜索索引（精简字段）
const searchIndex = articles.map((a) => ({
  slug: a.slug,
  title: a.title,
  scenario: a.scenario,
  category: a.category,
  summary: a.summary,
  keywords: a.keywords,
  text: a.text,
}));
fs.writeFileSync(path.join(ROOT, 'search-index.json'), JSON.stringify(searchIndex, null, 2), 'utf8');

// 3) 内联数据：使页面在 file:// 与静态托管下都能直接运行
fs.writeFileSync(
  path.join(ASSETS_DIR, 'content-data.js'),
  `// 自动生成，请勿手动编辑。源目录：content\nwindow.__CONTENT__ = ${JSON.stringify(payload)};\n`,
  'utf8'
);

console.log('✓ 已生成 content.json / search-index.json / assets/content-data.js');
