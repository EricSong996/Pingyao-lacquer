/**
 * 日升昌票号专题内容
 * 第 1 页：封面
 * 第 2 页：流程图前序章
 * 第 3–7 页：运转五步（交银开票 → 开出汇票 → 持票赴外 → 异地兑付 → 号内清算）
 */
const PHOTOS = [
  {
    id: "intro",
    image: "images/rishengchang-01.png",
    fallback: "",
    tag: "平遥古城 · 西大街",
    title: "日升昌：汇通天下",
    description:
      "日升昌票号创办于清道光年间的山西平遥，是中国最早专营异地汇兑的票号之一。它以汇票贯通商路，以信誉立号，被看作中国近代银行业的重要源头。走进这里，就是走近一段“汇通天下”的金融史。",
    isIntro: true,
  },
  {
    id: "flow-prelude",
    image: "images/rishengchang-02.png",
    fallback: "images/rishengchang-01.png",
    tag: "运转流程",
    title: "一纸汇票，银动四方",
    subtitle: "日升昌的运转之道",
    contentAlign: "top",
    lightOverlay: true,
  },
  {
    id: "flow-1",
    image: "images/rishengchang-03.png",
    fallback: "images/rishengchang-02.png",
    tag: "第一步",
    title: "交银开票",
    description: "商户在本地票号交存银两，说明汇往何地、交付何人，提出汇兑需求。",
    contentAlign: "right",
    lightOverlay: true,
  },
  {
    id: "flow-2",
    image: "images/rishengchang-04.png",
    fallback: "images/rishengchang-03.png",
    tag: "第二步",
    title: "开出汇票",
    description: "票号开具汇票作为兑付凭证，以票代现，避免长途携带大量现银。",
    contentAlign: "left",
    lightOverlay: true,
  },
  {
    id: "flow-3",
    image: "images/rishengchang-05.png",
    fallback: "images/rishengchang-04.png",
    tag: "第三步",
    title: "持票赴外",
    description: "商户持汇票赴外地，或交由指定收款人；银两不必随人同行，凭证先行流转。",
    contentAlign: "left",
    lightOverlay: true,
  },
  {
    id: "flow-4",
    image: "images/rishengchang-06.png",
    fallback: "images/rishengchang-05.png",
    tag: "第四步",
    title: "异地兑付",
    description: "外地分号核验汇票无误后，按约定兑付银两，完成“此地交银、彼地取用”。",
    contentAlign: "left",
    lightOverlay: true,
  },
  {
    id: "flow-5",
    image: "images/rishengchang-07.png",
    fallback: "images/rishengchang-06.png",
    tag: "第五步",
    title: "号内清算",
    description: "各分号之间进行账目往来与资金调拨，维持各地持续兑付能力，托底整套汇兑网络。",
    contentAlign: "right",
    lightOverlay: true,
  },
];

/**
 * 日升昌 AI 答疑配置
 */
const CHAT_CONFIG = {
  apiUrl: "/api/chat",
  directMode: true,
  mockMode: false,
  topic: "rishengchang",
  avatar: "票",
  title: "日升昌 AI 助手",
  subtitle: "汇通天下 · 答疑解惑",
  welcome:
    "您好！我是日升昌 AI 助手，可以为您介绍票号历史、晋商金融文化，以及“汇通天下”的运转之道。请随意提问！",
  quickQuestions: [
    "日升昌是什么？",
    "为什么叫汇通天下？",
    "汇票怎么运转？",
    "日升昌有什么历史意义？",
  ],
  mockAnswers: {
    日升昌是什么:
      "日升昌票号创办于清道光年间，总号在山西平遥西大街，是中国最早专营异地汇兑的票号之一，被看作中国近代银行业的重要源头，旧址今为中国票号博物馆。",
    汇通天下:
      "“汇通天下”形容日升昌以汇票贯通各地商路：商户不必长途押运现银，凭一纸汇票即可在外地兑付，信誉与分号网络支撑起跨地域金融流通。",
    汇票怎么运转:
      "大致五步：交银开票 → 开出汇票 → 持票赴外 → 异地兑付 → 号内清算。核心是“以票代现”，银两不必随人同行，凭证先行流转。",
    历史意义:
      "日升昌开创并推动了票号业发展，体现晋商诚信与金融智慧，促进了全国商贸流通，是理解中国传统金融史与平遥晋商文化的重要窗口。",
  },
  mockFallback:
    "感谢提问！日升昌是平遥晋商金融的代表。您可以问问「日升昌是什么」「汇票怎么运转」「为什么叫汇通天下」等。",
};
