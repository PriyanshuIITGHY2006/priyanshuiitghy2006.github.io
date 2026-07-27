import type { ResumeData } from "../types";
import { LINKS } from "./links";

// Faithful transcription of the IITG LaTeX résumé.
// Inline <b>/<i> markup mirrors the bold/italic emphasis in the compiled PDF.
export const resume: ResumeData = {
  name: "Priyanshu Debnath",
  identity: [
    "Roll No.: 250102242",
    "B.Tech - Electronics and Electrical Engineering",
    "Minor in Mathematics",
    "Indian Institute Of Technology, Guwahati",
  ],
  contact: [
    [{ text: LINKS.phoneDisplay, href: `tel:${LINKS.phone}`, detail: "phone" }],
    [{ text: LINKS.emailPersonal, href: `mailto:${LINKS.emailPersonal}`, detail: "email" }],
    [{ text: LINKS.emailInstitute, href: `mailto:${LINKS.emailInstitute}`, detail: "email" }],
    [
      { text: "Github", href: "#/github", detail: "github" },
      { text: " | " },
      { text: "Website", href: LINKS.website, external: true, detail: "website" },
      { text: " | " },
      { text: "Blog", href: "#/blogs", detail: "blog" },
    ],
    [{ text: "linkedin.com/in/priyanshu-debnath-3a81711b3", href: LINKS.linkedin, external: true, detail: "linkedin" }],
  ],

  pdfUrl: "Priyanshu_Debnath_CV.pdf",
  pdfName: "Priyanshu_Debnath_CV.pdf",

  education: [
    {
      degree: "B.Tech. Major",
      institute: "Indian Institute of Technology, Guwahati",
      score: "9.52 (Current)",
      year: "2025-Present",
    },
    {
      degree: "B.Tech. Minor (Mathematics)",
      institute: "Indian Institute of Technology, Guwahati",
      score: "9.00 (Current)",
      year: "2026-Present",
    },
    {
      degree: "Senior Secondary",
      institute: "WBCHSE Board",
      score: "95.0%",
      year: "2025",
    },
  ],

  // Real repo URLs taken from the user's LaTeX source.
  projects: [
    {
      id: "prag-dristi",
      title: "Prag-Dristi: Assam Flood Forecasting Engine",
      date: "Apr. 2026 – Present",
      stack: "Python, PyTorch, LSTM, Bahdanau Attention, FastAPI, Streamlit",
      link: {
        text: "Github",
        href: "https://github.com/PriyanshuIITGHY2006/Prag-Dristi",
        external: true,
        detail: "prag-dristi",
      },
      bullets: [
        "<b>LSTM Encoder-Decoder with Bahdanau Attention</b> for 7-day Brahmaputra discharge forecasting on 23 yrs of ERA5/GloFAS data; flood-weighted MSE handles &lt;8% class imbalance",
        "Achieved <b>NSE = 0.924, KGE = 0.920, POD = 0.651</b> on unseen years; deployed via FastAPI backend and Streamlit dashboard for real-time monitoring",
      ],
    },
    {
      id: "memoryos",
      title: "MemoryOS: Persistent Memory Framework for Stateless LLMs",
      date: "Feb. 2026 – Present",
      stack: "Python, Neo4j, ChromaDB, FastAPI, Groq LLaMA-3.3-70B",
      link: {
        text: "Github",
        href: "https://github.com/PriyanshuIITGHY2006/Memory-Os",
        external: true,
        detail: "memoryos",
      },
      bullets: [
        "Three-tier memory system (Neo4j graph, ChromaDB vectors, active buffer) with automatic entity resolution; sustains <b>4,000+ turns</b> at constant ≈350 tokens/turn, <b>99.8% token savings</b> vs. linear history",
      ],
    },
    {
      id: "hackathon-squad",
      title: "Hackathon-Squad: Maximum Weight Independent Set Solver",
      date: "Apr. 2026",
      stack: "C++, Parameterized Algorithms, Max-Flow, Local Search",
      link: {
        text: "Github",
        href: "https://github.com/PriyanshuIITGHY2006/Hackathon-Squad",
        external: true,
        detail: "hackathon-squad",
      },
      bullets: [
        "Three-phase <b>C++</b> solver for the NP-hard <b>Maximum Weight Independent Set</b>: kernelization reduction rules, <b>Nemhauser–Trotter</b> LP reduction via <b>Dinic max-flow</b>, and hybrid exact tree-DP / <b>Iterated Local Search</b> (PROBE 1→k swap)",
        "Anytime design with SIGTERM/SIGINT guards under a 290s limit; <b>23/23 valid</b> benchmark solutions, beating expected values on <b>8 cases</b> with zero invalid outputs",
      ],
    },
    {
      id: "min-variance",
      title: "Minimum-Variance Portfolio Optimizer",
      date: "Dec. 2025 – Present",
      stack: "Python, NumPy, yfinance, PyPortfolioOpt, Modern Portfolio Theory",
      link: {
        text: "Github",
        href: "https://github.com/PriyanshuIITGHY2006/min-var-portfolio",
        external: true,
        detail: "min-variance",
      },
      bullets: [
        "Quantitative pipeline for lowest-risk long-only portfolios; <b>Ledoit-Wolf shrinkage</b> and nearest-PSD correction for covariance stability; no-short-selling constraints with weight normalization",
      ],
    },
    {
      id: "kelly-criterion",
      title: "Kelly Criterion for Fixed-Limit Games",
      date: "Dec. 2025 – Jan. 2026",
      stack: "Python, Game Theory, Stochastic Modeling",
      link: {
        text: "LinkedIn",
        href: LINKS.linkedin,
        external: true,
        detail: "kelly-criterion",
      },
      bullets: [
        "Derived the <b>Stochastic Gate</b>: converts optimal Kelly fraction <i>f*</i> into a Kelly Frequency for fixed-bet games; Python engine matches the optimal geometric growth curve under hard bet-size constraints",
      ],
    },
    {
      id: "cp-archive",
      title: "Automated Competitive Programming Archive",
      date: "Apr. 2026 – Present",
      stack: "Python, Codeforces REST API, Markdown Automation",
      link: {
        text: "Github",
        href: "https://github.com/PriyanshuIITGHY2006/codeforces-solutions",
        external: true,
        detail: "cp-archive",
      },
      bullets: [
        "Python archiver integrating the Codeforces REST API to catalogue Accepted C++ submissions; auto-generated Markdown README of <b>250+ problems</b> by rating (800–2400) and algorithmic tag distributions",
      ],
    },
  ],

  skills: [
    { label: "Programming", items: "C++, Python, C" },
    {
      label: "Libraries &amp; Tools",
      items:
        'PyTorch, NumPy, Pandas, Scikit-learn, UMAP, yfinance, PyPortfolioOpt, LangChain, FastAPI, Streamlit, Neo4j, ChromaDB, Git, <span class="latex">L<span class="latex-a">a</span>T<span class="latex-e">e</span>X</span>',
    },
    {
      label: "Key Concepts",
      items:
        "Deep Learning, Transformers, LSTM &amp; Attention, Stochastic Calculus, Modern Portfolio Theory, DSA, Game Theory, Risk Modeling",
    },
  ],

  positions: [
    {
      html: "<b>Deputy Coordinator,</b> Coding Club, IIT Guwahati (Competitive Programming Module)",
      date: "Jan. 2026 - Present",
    },
    {
      html: "<b>Associate,</b> Consulting &amp; Analytics Club, IIT Guwahati",
      date: "Dec. 2025 - Present",
    },
  ],

  achievements: [
    {
      id: "delta-2026",
      html: "<b>IICPC DELTA 2026,</b> Qualified for Interview Round — Technology Track OA Rank 5 (Optiver · HRT)",
      date: "Aug 2026",
    },
    {
      id: "kriti-2026",
      html: "<b>Kriti 2026,</b> Gold Medal — Artificial Intelligence Challenge, IIT Guwahati",
      date: "2026",
    },
    {
      id: "ams-derive-2026",
      html: "<b>AMS Derive 2026,</b> Rank 199 — PRIOR Round (Algorithms &amp; Mathematics Society)",
      date: "2026",
    },
    {
      id: "jee-advanced",
      html: "<b>JEE Advanced 2025,</b> All India Rank 1941 | Top 1% among 1.5 Lakh+ candidates",
      date: "2025",
    },
    {
      id: "jee-main",
      html: "<b>JEE Main 2025,</b> All India Rank 4738 | 99.69 percentile",
      date: "2025",
    },
    {
      id: "codeforces",
      // The rating and solved count are placeholders — main.ts swaps them
      // with live data fetched from the Codeforces API on page load.
      html:
        "<b>Competitive Programming,</b> " +
        '<a class="link" data-detail="codeforces" href="#/codeforces">' +
        '<span data-cf="title">Codeforces Specialist (Max 1473)</span>' +
        "</a>" +
        ' | CodeChef 2-Star | <span data-cf="solved">250+</span> problems solved',
      date: "2025-Present",
    },
  ],
};
