/**
 * 社会实践照片配置
 * 将你们拍摄的照片放入 images/ 目录，然后修改下方 image 路径即可
 *
 * 页面结构（共 11 页）：
 *   第 1 页：封面
 *   第 2–7 页：制作过程（6 步）
 *   第 8 页：成品展示（标题页）
 *   第 9–11 页：成品照片（仅图片，无文字）
 */
const PHOTOS = [
  {
    id: "intro",
    image: "images/photo-01.jpg",
    fallback: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&q=80",
    tag: "封面",
    title: "平遥推光漆器",
    subtitle: "千年工艺 · 光影之间",
    description: "推光漆器是山西省平遥县传统手工艺，以手掌推磨漆面至光亮如镜而得名，2006年列入国家级非物质文化遗产名录。",
    isIntro: true,
  },
  {
    id: "step-1",
    image: "images/photo-02.jpg",
    fallback: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=1920&q=80",
    tag: "第一步",
    title: "割漆",
    description: "中国农业三大宝“树割漆、蜂做蜜、蚕吐丝”，漆字象形字中为木人水，指在漆树树干割取倒着人字型刀口，取天然大漆，割漆时间最热三伏天，老百姓常说“百里千刀一斤漆”，用大漆髹饰过的器具耐高温、耐磨损、耐强碱强酸，防腐防潮、防虫蛀，俗语说“滴漆入土，千年不腐”。",
  },
  {
    id: "step-2",
    image: "images/photo-03.jpg",
    fallback: "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=1920&q=80",
    tag: "第二步",
    title: "实木制胎",
    description: "平遥漆器家具多为实木制胎，还有脱胎、铜胎、陶胎、纸胎。根据不同的器型选择不同的木料，有优质椴木、核桃木、老榆木、香樟木等，使用榫卯结构，各个构件之间的结点以榫卯相吻合，构成框架",
  },
  {
    id: "step-3",
    image: "images/photo-04.jpg",
    fallback: "https://images.unsplash.com/photo-1544967080-df0b8c2d4b0e?w=1920&q=80",
    tag: "第三步",
    title: "裱布挂灰",
    description: "木胎做好后，转入灰胎工艺，需在木胎上用大漆裱布挂灰。上灰工艺决定漆艺品漆层的牢固度和平整度平遥推光漆器在髹漆前需要进行裱布工序，将优质的棉麻布裱到木胎上，再上生漆土籽灰，循环4-5次，分为粗灰、中灰、细灰，这是一道非常重要的工艺程序，它会影响后面漆层的牢固度和平整度，作用是保护木胎，相当于在木胎上形成了保护层，隔绝空气，可以防潮，防变形。",
  },
  {
    id: "step-4",
    image: "images/photo-05.jpg",
    fallback: "https://images.unsplash.com/photo-1579783902614-a3fb3927b162?w=1920&q=80",
    tag: "第四步",
    title: "荫房荫干",
    description: "漆器制作须在无尘、密封的荫房中进行，温度保持在20~40℃、大气相对湿度为70～80％。漆器在每上一道漆之后，要在特制荫房中荫干。设置荫房，科学调整荫房温度湿度，是传统漆器必不可少的工序。",
  },
  {
    id: "step-5",
    image: "images/photo-06.jpg",
    fallback: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=80",
    tag: "第五步",
    title: "髹漆",
    description: "漆器制作中，髹漆最关键。每件产品，从底漆到面漆，一般需上五道到八道。每上完一道漆，干后需打磨，打磨后再上漆，上漆后再打磨，照此循环作业。",
  },
  {
    id: "step-6",
    image: "images/photo-07.jpg",
    fallback: "https://images.unsplash.com/photo-1513519245088-0e12902e35ca?w=1920&q=80",
    tag: "第六步",
    title: "手掌推光",
    description: "中国四大名漆器，平遥之所以叫推光漆器是以一种手掌推出光泽度而闻名的地方传统手工技艺，用细水砂纸推，卷起人发推，手蘸麻油推，掌心反复推，直至温如玉，亮如镜，体现了工匠精神。推光漆器分为先推光后彩绘，也有先彩绘后推光的。",
  },
  {
    id: "showcase",
    image: "images/photo-08.jpg",
    fallback: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&q=80",
    tag: "成品展示",
    title: "漆器成品",
    description: "一件推光漆器从制胎到完工，往往需要数月甚至更长。成品漆面光洁如镜，历久弥新，兼具实用价值与艺术价值。",
  },
  {
    id: "showcase-1",
    image: "images/photo-09.jpg",
    fallback: "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1920&q=80",
    title: "成品一",
    imageOnly: true,
    navParent: "showcase",
  },
  {
    id: "showcase-2",
    image: "images/photo-10.jpg",
    fallback: "https://images.unsplash.com/photo-1579783902614-a3fb3927b162?w=1920&q=80",
    title: "成品二",
    imageOnly: true,
    navParent: "showcase",
  },
  {
    id: "showcase-3",
    image: "images/photo-11.jpg",
    fallback: "https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1920&q=80",
    title: "成品三",
    imageOnly: true,
    navParent: "showcase",
  },
];

/**
 * AI 聊天配置
 *
 * 默认走前端直调豆包（见 js/ai-config.js + js/ai-client.js），
 * GitHub Pages 无需 Vercel / Node。
 * mockMode: true 时只用本地预设回答。
 */
const CHAT_CONFIG = {
  apiUrl: "/api/chat",
  /** true = 浏览器直调豆包；false 且非 mock 时走 apiUrl（本地 node server.js） */
  directMode: true,
  mockMode: false,
  topic: "lacquer",
  avatar: "漆",
  title: "推光漆器 AI 助手",
  subtitle: "为您答疑解惑",
  welcome:
    "您好！我是推光漆器 AI 助手，可以为您解答关于平遥推光漆器的历史、工艺、特点等问题。请随意提问！",
  quickQuestions: [
    "什么是推光漆器？",
    "推光工艺怎么做？",
    "制作需要多久？",
    "推光漆器有什么特点？",
  ],
};
