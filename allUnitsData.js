// allUnitsData.js

const ALL_UNITS_DATA = [
  {
    unitId: 'unit1',
    displayName: "Unit 1: Exploring One-Variable Data", // Added/Updated
        examWeight: "15-23%",     // Unique identifier for the unit
    // This 'topics' array IS the 'pdfFiles' array definition from Unit 1's index.html
    // Ensure it reflects the granular structure with nested 'videos' and 'quizzes' arrays.
    topics: [
      // --- PASTE Unit 1's pdfFiles ARRAY CONTENT HERE ---
      {
        id: "1-1",
        name: "Topic 1.1",
        description: "Introducing Statistics: What Can We Learn from Data?",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/708w9bpk60?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1wEbNmDM4KBUWvvoRoQIgIYKYWxG3x6Cv/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
    },
    {
        id: "1-2",
        name: "Topic 1.2",
        description: "The Language of Variation: Variables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/o7atnjt521?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1cJ3a5DSlZ0w3vta901HVyADfQ-qKVQcD/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.2_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.2_answers.pdf",
                quizId: "1-2_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-3",
        name: "Topic 1.3",
        description: "Representing a Categorical Variable with Tables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/5umo3jmlhy?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1F9_jLryrjHyXUN21eZmNHrTIGATBhhDw/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.3_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.3_answers.pdf",
                quizId: "1-3_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-4",
        name: "Topic 1.4",
        description: "Representing a Categorical Variable with Graphs",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/nnomwwtzqc?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1vo3zsZu4wZAAkf-fPTuCmKXudgs0Gnl4/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/yd2t974opr?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1Hp7GWdTzjPQNvcAnnrrt_QYXV27gCEHh/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.4_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.4_answers.pdf",
                quizId: "1-4_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-5",
        name: "Topic 1.5",
        description: "Representing a Quantitative Variable with Graphs",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/o142s0yu7e?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1jlopxNducZRaqXtU9c2NvXxq_tGK90ue/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.5_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.5_answers.pdf",
                quizId: "1-5_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-6",
        name: "Topic 1.6",
        description: "Describing the Distribution of a Quantitative Variable",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/q0wwgrkzqb?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1oWGqzk4meQ6HuXE-mTDHMStp-qOGDUZJ/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.6_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.6_answers.pdf",
                quizId: "1-6_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-7",
        name: "Topic 1.7",
        description: "Summary Statistics for a Quantitative Variable",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/99bxa5glos?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1JpzXso3aZ8P8MXQ8b8f1kpjlq_ciaQCK/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/99h7sgooy8?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1_LYoOie55jPT2tM-o3spuiqbVxga9VPv/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.7_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.7_answers.pdf",
                quizId: "1-7_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-8",
        name: "Topic 1.8",
        description: "Graphical Representations of Summary Statistics",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/rm76rrgb3t?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1sKc6XpjX5RUjGv5wbjUl7R1QEYLXG6W8/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.8_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.8_answers.pdf",
                quizId: "1-8_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-9",
        name: "Topic 1.9",
        description: "Comparing Distributions of a Quantitative Variable",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/27s7exmq1d?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1zUev1tHzgJLMi337FjuxY49siAJJf_w8/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.9_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.9_answers.pdf",
                quizId: "1-9_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-10",
        name: "Topic 1.10",
        description: "The Normal Distribution",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/0ps3pcvbfn?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1vTOitP631CGaZJMJjE6VVw53kiOa0zGv/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/wualxc69hl?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1UF7VafU4agY3JcxHnp61EEjpOv959wZ8/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/3fev7ihoms?sui=33,1",
                altUrl: "https://drive.google.com/file/d/1aYbhplXukoDHOpWYCNG5OOTGVYZOcyCV/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_section1.10_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_section1.10_answers.pdf",
                quizId: "1-10_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
    },
    {
        id: "1-capstone",
        name: "Unit 1 Progress Check",
        description: "Capstone Assessment",
        videos: [],
        quizzes: [
            {
                questionPdf: "pdfs/unit1/unit1_pc_frq_quiz.pdf",
                answersPdf: "pdfs/unit1/unit1_pc_frq_answers.pdf",
                quizId: "1-capstone_q1",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit1/unit1_pc_mcq_parta_answers.pdf",
                answersPdf: null,
                quizId: "1-capstone_q2",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit1/unit1_pc_mcq_partb_answers.pdf",
                answersPdf: null,
                quizId: "1-capstone_q3",
                completed: false,
                completionDate: null
            }
        ],
        isCapstone: true,
        current: false
      }
      // --- END OF PASTED Unit 1 DATA ---
    ]
  },
  {
    unitId: 'unit2',
    displayName: "Unit 2: Exploring Two-Variable Data",
    examWeight: "5-7%", // Unique identifier for Unit 2
    // This 'topics' array IS the 'pdfFiles' array definition from Unit 2's index.html
    topics: [
       // --- PASTE Unit 2's pdfFiles ARRAY CONTENT HERE ---
      {
        id: "2-1",
        name: "Topic 2.1",
        description: "Introducing Statistics: Are Variables Related?",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/n766cdx9w9?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1epQNhpTqA0qMv8ceTpH5IagjDDUlOPC0/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "2-2",
        name: "Topic 2.2",
        description: "Representing Two Categorical Variables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/6piak9dz9w?sui=33,2",
                altUrl: "https://drive.google.com/file/d/170yFl1LoVYwYZ8a6coNhfQkfkFiHD1gg/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.2_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.2_answers.pdf",
                quizId: "2-2_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-3",
        name: "Topic 2.3",
        description: "Statistics for Two Categorical Variables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/5xlg4390iu?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1IZIAXWtHsQfr1o7GZIJ2nnYXaQZt6Xyh/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.3_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.3_answers.pdf",
                quizId: "2-3_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-4",
        name: "Topic 2.4",
        description: "Representing the Relationship Between Two Quantitative Variables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/mistxmwcx2?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1RCEtVGX87UjgbneQqQKc5rNYhAQb4jPS/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/gf7ybqjkpt?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1ZpPac1ofe4Bot2yrLgwLPvSHdMUHvK4J/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.4_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.4_answers.pdf",
                quizId: "2-4_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-5",
        name: "Topic 2.5",
        description: "Correlation",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/15jvfeyacb?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1UnF2HFBgzzgj7M7_SIxhzJxrWiQQ7Itm/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/xz46lkcplm?sui=33,2",
                altUrl: "https://youtu.be/bPrP6wb497M",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.5_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.5_answers.pdf",
                quizId: "2-5_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-6",
        name: "Topic 2.6",
        description: "Linear Regression Models",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/8dyu2x687t?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1O_VPIl1W7TNAOi2wWNs0Uphbw11Mlagj/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/5hphawrnfm?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1_NOitEc1RuIwOgfx9lWcjOkq5yDdXToa/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.6_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.6_answers.pdf",
                quizId: "2-6_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-7",
        name: "Topic 2.7",
        description: "Residuals",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/1nld3zauyo?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1bk2KcUGXtM_uqBiv4IHwiXImazzX8S0k/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/gqn51yxt67?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1UjY1FF2ztFtcT5tk6brklCxRanMhFmOf/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.7_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.7_answers.pdf",
                quizId: "2-7_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-8",
        name: "Topic 2.8",
        description: "Least Squares Regression",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/tcc9dyd84p?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1_rLSLHvicUEZYr0YJ49e4rn5ezLP6cGX/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/3oo2fwicoe?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1XuzJlAW6HfR6E4L2DSSYxf66yqbG15dg/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/ikvel44wq7?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1Ghvv9jo8PH9KmX25-23oSRLVlLlUZX7N/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.8_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.8_answers.pdf",
                quizId: "2-8_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-9",
        name: "Topic 2.9",
        description: "Analyzing Departures from Linearity",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/mnkem3n2pk?sui=33,2",
                altUrl: "https://drive.google.com/file/d/19OKlAS6U2MyiT0E3LMsR8Hxu9LHWt78Q/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/h1a9n9iqpk?sui=33,2",
                altUrl: "https://drive.google.com/file/d/1Y0qapTVLcbLj02JjkzA11uEEWFYPe7Cr/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_section2.9_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_section2.9_answers.pdf",
                quizId: "2-9_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "2-capstone",
        name: "Unit 2 Progress Check",
        description: "Capstone Assessment",
        videos: [],
        quizzes: [
            {
                questionPdf: "pdfs/unit2/unit2_pc_frq_quiz.pdf",
                answersPdf: "pdfs/unit2/unit2_pc_frq_answers.pdf",
                quizId: "2-capstone_q1",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit2/unit2_pc_mcq_parta_answers.pdf",
                answersPdf: null,
                quizId: "2-capstone_q2",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit2/unit2_pc_mcq_partb_answers.pdf",
                answersPdf: null,
                quizId: "2-capstone_q3",
                completed: false,
                completionDate: null
            }
        ],
        isCapstone: true,
        current: false  
      }
       // --- END OF PASTED Unit 2 DATA ---
    ]
  },
  {
    unitId: 'unit3',
    displayName: "Unit 3: Collecting Data",
    examWeight: "12-15%",
    topics: [
      // --- PASTE Unit 3's pdfFiles ARRAY CONTENT HERE ---
      {
        id: "3-1",
        name: "Topic 3.1",
        description: "Introducing Statistics: Do the Data We Collected Tell the Truth?",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/bszm5v38o5?sui=33,3",
                altUrl: "https://drive.google.com/file/d/1TvZluuFXhx8theWMpU0hSs19vvP39Vua/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "3-2",
        name: "Topic 3.2",
        description: "Introduction to Planning a Study",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/zntfxmmdts?sui=33,3",
            altUrl: "https://drive.google.com/file/d/121AAheYGEysRFC58l3KVJVkBVJmPo--U/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.2_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.2_answers.pdf",
            quizId: "3-2_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-3",
        name: "Topic 3.3",
        description: "Random Sampling and Data Collection",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/0we2mcfcam?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1ogJAzU5hvGomK2eZGCkMza7EOpU67BaT/view?usp=drive_link",
            completed: false,
            completionDate: null
          },
          {
            url: "https://apclassroom.collegeboard.org/d/ljd0cb2e7u?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1jiVMlN3Y_xdARYHGB1ASbOSwroRfuFCB/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.3_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.3_answers.pdf",
            quizId: "3-3_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-4",
        name: "Topic 3.4",
        description: "Potential Problems with Sampling",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/tndkb7he2i?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1o3YuZt7Kai5qovHysWo4vaXlHp3WXtc9/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.4_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.4_answers.pdf",
            quizId: "3-4_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-5",
        name: "Topic 3.5",
        description: "Introduction to Experimental Design",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/k19v0dbk86?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1PVA-SIVNccjFYexZsUrHbdCps1wlKeBl/view?usp=drive_link",
            completed: false,
            completionDate: null
          },
          {
            url: "https://apclassroom.collegeboard.org/d/z5lwfxjjdv?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1x43Gy-QtIflBQXHe39LqIkABco0qrkMi/view?usp=drive_link",
            completed: false,
            completionDate: null
          },
          {
            url: "https://apclassroom.collegeboard.org/d/0xfkk5691j?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1pp-KwUGnBS-6RWvB4U5eKxopkCOYQ9KD/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.5_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.5_answers.pdf",
            quizId: "3-5_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-6",
        name: "Topic 3.6",
        description: "Selecting an Experimental Design",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/2ausyc2u4j?sui=33,3",
            altUrl: "https://drive.google.com/file/d/14I05d33AzFvCrjTAFSxtAlPiFLEuspZK/view?usp=drive_link",
            completed: false,
            completionDate: null
          },
          {
            url: "https://apclassroom.collegeboard.org/d/01da23635a?sui=33,3",
            altUrl: "https://drive.google.com/file/d/1DQZQMZVzesDILUqzVetIysD7DB94UYVT/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.6_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.6_answers.pdf",
            quizId: "3-6_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-7",
        name: "Topic 3.7",
        description: "Inference and Experiments",
        videos: [
          {
            url: "https://apclassroom.collegeboard.org/d/cgkp7vw65d?sui=33,3",
            altUrl: "https://drive.google.com/file/d/10TnxIb09QzsRvYQm-G3eiWQ5CSrELuJz/view?usp=drive_link",
            completed: false,
            completionDate: null
          }
        ],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_section3.7_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_section3.7_answers.pdf",
            quizId: "3-7_q1",
            completed: false,
            completionDate: null
          }
        ],
        current: false
      },
      {
        id: "3-capstone",
        name: "Unit 3 Progress Check",
        description: "Capstone Assessment",
        videos: [],
        quizzes: [
          {
            questionPdf: "pdfs/unit3/unit3_pc_frq_quiz.pdf",
            answersPdf: "pdfs/unit3/unit3_pc_frq_answers.pdf",
            quizId: "3-capstone_q1",
            completed: false,
            completionDate: null
          },
          {
            questionPdf: "pdfs/unit3/unit3_pc_mcq_parta_answers.pdf",
            answersPdf: null,
            quizId: "3-capstone_q2",
            completed: false,
            completionDate: null
          },
          {
            questionPdf: "pdfs/unit3/unit3_pc_mcq_partb_answers.pdf",
            answersPdf: null,
            quizId: "3-capstone_q3",
            completed: false,
            completionDate: null
          }
        ],
        isCapstone: true,
        current: false
      }
      // --- END OF PASTED Unit 3 DATA ---
    ]
  },
  {
    unitId: 'unit4',
    displayName: "Unit 4: Probability, Random Variables, and Probability Distributions",
        examWeight: "10-20%",
    topics: [
      {
        id: "4-1",
        name: "Topic 4.1",
        description: "Introducing Statistics: Random and Non-Random Patterns?",
        videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/7vn9faj6p9?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1lNfQZIrnUbG6JkCzw4wB-kcYNHpckwc-/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [],
    current: false
  },
  {
    id: "4-2",
    name: "Topic 4.2",
    description: "Estimating Probabilities Using Simulation",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/lbulj7eskd?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1qdvG72sMnfrQAavaoLV7x4wa1o_uE5Eh/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/v5phdup7pz?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1ksMiLGYx5cFCg1-Zosq4m_D_mlt2M7qo/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.2_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.2_answers.pdf",
            quizId: "4-2_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
  },
  {
    id: "4-3",
    name: "Topic 4.3",
    description: "Introduction to Probability",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/3naih8n3ar?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1eAYcRNceHy01t7bmARB3vtTDZnNNqmOV/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.3_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.3_answers.pdf",
            quizId: "4-3_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.4
{
    id: "4-4",
    name: "Topic 4.4",
    description: "Mutually Exclusive Events",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/owppp11zpq?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1TRJBAVaIbAWWLREvsDgRCxf0sNcFkpxf/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.4_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.4_answers.pdf",
            quizId: "4-4_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.5
{
    id: "4-5",
    name: "Topic 4.5",
    description: "Conditional Probability",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/d4g6056pk8?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1fpXLiPwBKO3kqppTWm4FpqjCcHX3Qf84/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.5_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.5_answers.pdf",
            quizId: "4-5_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.6
{
    id: "4-6",
    name: "Topic 4.6",
    description: "Independent Events and Unions of Events",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/nsd56rqpjj?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1TwLZF8dM35fcduBwRzmQUWgSTCynk5tV/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/5dfvjr08nh?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1qOQsPzsOeNQJHu18PJwUbfsQyjrdP2pV/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/j9zx3pjmpi?sui=33,4",
            altUrl: null,
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.6_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.6_answers.pdf",
            quizId: "4-6_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.7
{
    id: "4-7",
    name: "Topic 4.7",
    description: "Introduction to Random Variables and Probability Distributions",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/qgm2j1noql?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1UgJNPPVuG8ZGUobUD-KfM_EQz9AKfgAX/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/a7hqt3u3mr?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1cpK16Dp_3xVifQQahdMiahq44Jha-FKc/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.7_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.7_answers.pdf",
            quizId: "4-7_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.8
{
    id: "4-8",
    name: "Topic 4.8",
    description: "Mean and Standard Deviation of Random Variables",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/qcoxl3r54z?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1KgvrdwR0U9ScngjSq4AS7WJ2ecuQzswu/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.8_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.8_answers.pdf",
            quizId: "4-8_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.9
{
    id: "4-9",
    name: "Topic 4.9",
    description: "Combining Random Variables",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/fr03ec4ajm?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1welWQ8TTKlI1gBl4MrWzsd_NGeXZNanh/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/eekak8j8le?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1Jqewt6n4TxqMtoQ_AAOXYfzyq9gh-x6M/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.9_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.9_answers.pdf",
            quizId: "4-9_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.10
{
    id: "4-10",
    name: "Topic 4.10",
    description: "Introduction to the Binomial Distribution",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/wut3wgzwsd?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1JC95sdBTR6XF2W9STnF9ENg8ki85B2oM/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.10_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.10_answers.pdf",
            quizId: "4-10_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.11
{
    id: "4-11",
    name: "Topic 4.11",
    description: "Parameters for a Binomial Distribution",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/5b5h0x75vo?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1Yb5FnTa4R-JbWUaAqNsWJtYtbMaWw2gd/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.11_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.11_answers.pdf",
            quizId: "4-11_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Topic 4.12
{
    id: "4-12",
    name: "Topic 4.12",
    description: "The Geometric Distribution",
    videos: [
        {
            url: "https://apclassroom.collegeboard.org/d/bqu99yuglu?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1PVmey_huN37gyeaxXfKMOJRKhdWpPY_N/view?usp=drive_link",
            completed: false,
            completionDate: null
        },
        {
            url: "https://apclassroom.collegeboard.org/d/pjrxy0uy47?sui=33,4",
            altUrl: "https://drive.google.com/file/d/1ZsUp6flFbcAnpDP6U2Jj_3iBbi3rfkjz/view?usp=drive_link",
            completed: false,
            completionDate: null
        }
    ],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_section4.12_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_section4.12_answers.pdf",
            quizId: "4-12_q1",
            completed: false,
            completionDate: null
        }
    ],
    current: false
},

// Unit 4 Capstone
{
    id: "4-capstone",
    name: "Unit 4 Progress Check",
    description: "Capstone Assessment",
    videos: [],
    quizzes: [
        {
            questionPdf: "pdfs/unit4/unit4_pc_frq_quiz.pdf",
            answersPdf: "pdfs/unit4/unit4_pc_frq_answers.pdf",
            quizId: "4-capstone_q1",
            completed: false,
            completionDate: null
        },
        {
            questionPdf: "pdfs/unit4/unit4_pc_mcq_parta_answers.pdf",
            answersPdf: null,
            quizId: "4-capstone_q2",
            completed: false,
            completionDate: null
        },
        {
            questionPdf: "pdfs/unit4/unit4_pc_mcq_partb_answers.pdf",
            answersPdf: null,
            quizId: "4-capstone_q3",
            completed: false,
            completionDate: null
        },
        {
            questionPdf: "pdfs/unit4/unit4_pc_mcq_partc_answers.pdf",
            answersPdf: null,
            quizId: "4-capstone_q4",
            completed: false,
            completionDate: null
        }
    ],
    isCapstone: true,
    current: false
  }
]
  },
  {
    unitId: 'unit5',
    displayName: "Unit 5: Sampling Distributions",
    examWeight: "7-12%",
  topics: [
    {
      id: "5-1",
      name: "Topic 5.1",
      description: "Introducing Statistics: Why Is My Sample Not Like Yours?",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/951j439qxl?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1QtdgRvz6FDzTKK4UgACKVxdqJMyZDGR8/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [],
      current: false
    },
    {
      id: "5-2",
      name: "Topic 5.2",
      description: "The Normal Distribution, Revisited",
      videos: [
        {
              url: "https://apclassroom.collegeboard.org/d/3ahfseusno?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1JFYjH0zXcPRk4Z18dTnbqWQLhu6IM_y3/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/xas8ymbml4?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1pRBVyjLPY1aEPGbkTdYzt5aPlQIy9FDW/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/5cjfnynb4w?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1HVGa0OuHML6pHhGdp4UOln6oncX3n53_/view?usp=drive_link",
          completed: false,
          completionDate: null
        }
      ],
      quizzes: [
        {
              questionPdf: "pdfs/unit5/unit5_section5.2_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.2_answers.pdf",
              quizId: "5-2_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-3",
      name: "Topic 5.3",
      description: "The Central Limit Theorem",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/sayt12b4ew?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1N5xTQ9hpOwIDTxbF0AxIzPxxaCbmOWaA/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/7vvumt4qzm?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1Lrf2azQI_qx0zLOyp0Yn-TS11zK4fb5u/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.3_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.3_answers.pdf",
              quizId: "5-3_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-4",
      name: "Topic 5.4",
      description: "Biased and Unbiased Point Estimates",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/0k9y4dbl6i?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1n0CE4BjYdx_bRDz-iEH2FyK7sfgcG3Mj/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.4_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.4_answers.pdf",
              quizId: "5-4_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-5",
      name: "Topic 5.5",
      description: "Sampling Distributions for Sample Proportions",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/n68xwj4nrz?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1y1iW173PGADlfmDuZuvUYwg-czY2FKCo/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/3hds9p8qlq?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1EosOt0OTG3faHrdnkhQy-SrFdAxRndjF/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.5_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.5_answers.pdf",
              quizId: "5-5_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-6",
      name: "Topic 5.6",
      description: "Sampling Distributions for Differences in Sample Proportions",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/hl9fyvkpih?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1XufYZpotzaSRppEfFckSzr6mVavfTWoX/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/ik3wqrxnwg?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1_C6vTO44i3ypH5wU2XYU53BOa4whSZxW/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.6_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.6_answers.pdf",
              quizId: "5-6_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-7",
      name: "Topic 5.7",
      description: "Sampling Distributions for Sample Means",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/9a15613osy?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1ovisJH6Caxyyg8bLqPfGINveGYqQGD39/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/em70n6vdbf?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1J9UirY-l46WkrwlJRC-kX42vYd2t7_26/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.7_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.7_answers.pdf",
              quizId: "5-7_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-8",
      name: "Topic 5.8",
      description: "Sampling Distributions for Differences in Sample Means",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/vdhw7lx8zh?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1zaan99AFqpAEwbvLob9LwBqV-dji4Yli/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/8tey1w8y00?sui=33,5",
              altUrl: "https://drive.google.com/file/d/1s-fZYap_45Cl2DKzsZV3l4UNs8RzCxNr/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_section5.8_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_section5.8_answers.pdf",
              quizId: "5-8_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "5-capstone",
      name: "Unit 5 Progress Check",
      description: "Capstone Assessment",
      videos: [],
      quizzes: [
          {
              questionPdf: "pdfs/unit5/unit5_pc_frq_quiz.pdf",
              answersPdf: "pdfs/unit5/unit5_pc_frq_answers.pdf",
              quizId: "5-capstone_q1",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit5/unit5_pc_mcq_parta_answers.pdf",
              quizId: "5-capstone_q2",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit5/unit5_pc_mcq_partb_answers.pdf",
              quizId: "5-capstone_q3",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit5/unit5_pc_mcq_partc_answers.pdf",
              quizId: "5-capstone_q4",
              completed: false,
              completionDate: null
          }
      ],
      isCapstone: true,
      current: false
      }
      // --- END OF PASTED Unit 5 DATA ---
    ]
  },
  {
    unitId: 'unit6',
    displayName: "Unit 6: Inference for Categorical Data: Proportions",
        examWeight: "12-15%",
    topics: [
        {
            id: "6-1",
            name: "Topic 6.1",
            description: "Introducing Statistics: Why Be Normal?",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/w7b6pfew1i?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1fKcwvZJ-k_1_W4oNdavj1PhE5HdxpwiA/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [],
            current: false
          },
          {
            id: "6-2",
            name: "Topic 6.2",
            description: "Constructing a Confidence Interval for a Population Proportion",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/cue0tavkxg?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1Z1IVxhFEx4Bul3FfJHBqBSn8LyTDMfOB/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/sa1jzello1?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1fq3GJRjLgVz9HOo5_1SkHtCOd306KBrw/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/ho2mfeuu5x?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1jmaj_VpyrN_KyBLEm3rfPx8Bo-cQiEjG/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.2_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.2_answers.pdf",
                    quizId: "6-2_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-3",
            name: "Topic 6.3",
            description: "Justifying a Claim Based on a Confidence Interval for a Population Proportion",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/5096or6fs1?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1jeFQcdB2pJN0iZbYzB_MZcvotx00A0mr/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/9nl593n5le?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1VkVgzdGiy73QAzXzBevf-Rb-kcFBRXNr/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/avzy7twn1u?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1Tv1o7BEvI0vaM8Ec09E2MuDjFwpUGo1X/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.3_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.3_answers.pdf",
                    quizId: "6-3_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-4",
            name: "Topic 6.4",
            description: "Setting Up a Test for a Population Proportion",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/pde094fkxp?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/11xz3nOZxcbyVkG5zbq62s0A1Bjl4hSaL/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/mg1k959s5t?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1WcGkierE6UKER-UtAX-7HbGtwbmJlbZv/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.4_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.4_answers.pdf",
                    quizId: "6-4_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-5",
            name: "Topic 6.5",
            description: "Interpreting p-Values",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/xkvphnx7qu?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1K1SjzRvRK_7YmJCDwktQvqDKrZl0hXes/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/crg48hjihw?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1_C9FAHoG_78nqXAcBh-REYx7a79zC7Cl/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.5_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.5_answers.pdf",
                    quizId: "6-5_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-6",
            name: "Topic 6.6",
            description: "Concluding a Test for a Population Proportion",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/7tp98ixuv7?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1DMt9tQ1_QTmBEQtOZAAukjxirGcMBrUf/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/a2xb71gu0q?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1SwyAJpXZF5U7GUm2jUNMlx5dV9JfX5rx/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.6_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.6_answers.pdf",
                    quizId: "6-6_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-7",
            name: "Topic 6.7",
            description: "Potential Errors When Performing Tests",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/6tvg0n0vow?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1xbhiSuRKc4cfXW3Ppb7iItQoh1FM_QRX/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/0nelp4z6as?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/12sJrnadHPSRJ6RUauB-VWpUnhMEunCvH/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.7_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.7_answers.pdf",
                    quizId: "6-7_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-8",
            name: "Topic 6.8",
            description: "Confidence Intervals for the Difference of Two Proportions",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/2722ixl0j3?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1mRfi7bTMSHtadxhLc2pAEmAMjmLpgvZn/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/ylbup5g6tt?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1cH5jaDvcEOCQ6RGeLZxaqGVOFFt1nT5F/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.8_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.8_answers.pdf",
                    quizId: "6-8_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-9",
            name: "Topic 6.9",
            description: "Justifying a Claim Based on a Confidence Interval for a Difference of Population Proportions",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/dpnop7yqy7?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1LqtzJe8MTykYtX8mVcf4pbU1BtVcvwfb/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/px2wxa1pql?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1pBYs6pAkS_RyUVfNMxoaKvg8tuapkNFe/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.9_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.9_answers.pdf",
                    quizId: "6-9_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-10",
            name: "Topic 6.10",
            description: "Setting Up a Test for the Difference of Two Population Proportions",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/ycy5l5nclj?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1dIRMyHdePpkx7pCJFcAkRHIPj2Q8RtqG/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/etzlkyzo8u?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1SDYELDZa9kcJldq_qf1DsOOMhrjzfkio/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.10_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.10_answers.pdf",
                    quizId: "6-10_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-11",
            name: "Topic 6.11",
            description: "Carrying Out a Test for the Difference of Two Population Proportions",
            videos: [
                {
                    url: "https://apclassroom.collegeboard.org/d/f1fyz21kv4?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1nJ5tGJ5m9ft1c8yieYqHjCQAvZLotnD1/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/xjd28ei312?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1rEKSvHoivPVRtsq63NOys-A5x-xtMjoG/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                },
                {
                    url: "https://apclassroom.collegeboard.org/d/8xwgbceh02?sui=33,6",
                    altUrl: "https://drive.google.com/file/d/1K9ZtMx2HhFlPWXq6Ip-7slWaY0zJDMOU/view?usp=drive_link",
                    completed: false,
                    completionDate: null
                }
            ],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_section6.11_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_section6.11_answers.pdf",
                    quizId: "6-11_q1",
                    completed: false,
                    completionDate: null
                }
            ],
            current: false
          },
          {
            id: "6-capstone",
            name: "Unit 6 Progress Check",
            description: "Capstone Assessment",
            videos: [],
            quizzes: [
                {
                    questionPdf: "pdfs/unit6/unit6_pc_frq_quiz.pdf",
                    answersPdf: "pdfs/unit6/unit6_pc_frq_answers.pdf",
                    quizId: "6-capstone_q1",
                    completed: false,
                    completionDate: null
                },
                {
                    questionPdf: null,
                    answersPdf: "pdfs/unit6/unit6_pc_mcq_parta_answers.pdf",
                    quizId: "6-capstone_q2",
                    completed: false,
                    completionDate: null
                },
                {
                    questionPdf: null,
                    answersPdf: "pdfs/unit6/unit6_pc_mcq_partb_answers.pdf",
                    quizId: "6-capstone_q3",
                    completed: false,
                    completionDate: null
                },
                {
                    questionPdf: null,
                    answersPdf: "pdfs/unit6/unit6_pc_mcq_partc_answers.pdf",
                    quizId: "6-capstone_q4",
                    completed: false,
                    completionDate: null
                },
                {
                    questionPdf: null,
                    answersPdf: "pdfs/unit6/unit6_pc_mcq_partd_answers.pdf",
                    quizId: "6-capstone_q5",
                    completed: false,
                    completionDate: null
                }
            ],
            isCapstone: true,
            current: false
        }
    ]
  },
  {
    unitId: 'unit7',
    displayName: "Unit 7: Inference for Quantitative Data: Means",
    examWeight: "10-18%",
    topics: [
      {
        id: "7-1",
      name: "Topic 7.1",
      description: "Introducing Statistics: Should I Worry About Error?",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/3t8pczvov0?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1DRCmH8ENSMJwf75yG-M_hPnUWcF2uww4/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [],
      current: false
    },
    {
      id: "7-2",
      name: "Topic 7.2",
      description: "Constructing a Confidence Interval for a Population Mean",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/tapwqbw3dq?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1QOnc8wCvA10U9AvoAfl9ksdmnzC7rIi1/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/utu3y3bkag?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1CaDaKiUhi3e954ZcpVYUEVpWZdKgNi0o/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/pytemtrew7?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1eQUfrAiMrRCz1GpDzzQJ4ueBD3IQiD6z/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.2_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.2_answers.pdf",
              quizId: "7-2_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-3",
      name: "Topic 7.3",
      description: "Justifying a Claim About a Population Mean Based on a Confidence Interval",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/b1ywa7d80z?sui=33,7",
              altUrl: "https://drive.google.com/file/d/12f3_LWkXq3ezMJwDaFfGlxobizRKvj1I/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/xk5a52ajgk?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1ie_ChlondI_Y1tiTlEum5OZAGovX5R2u/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/lghtcfwy1x?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1VP_COxmeIU2S0jC24EgYgAnRqnsJz9B6/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.3_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.3_answers.pdf",
              quizId: "7-3_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-4",
      name: "Topic 7.4",
      description: "Setting Up a Test for a Population Mean",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/kyfddpb99h?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1ugAdsbFI9jyFAClJPphWtmva2DWNron2/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/2ufhcaan1t?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1093Dkx-RAxtiFVsWnnZ22rS1E6Tkhau6/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.4_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.4_answers.pdf",
              quizId: "7-4_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-5",
      name: "Topic 7.5",
      description: "Carrying Out a Test for the Population Mean",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/6vq538ni85?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1h5r9eDoSwjLJye7PeHcz68AI5p-RDFeR/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/pc2evx8bvr?sui=33,7",
              altUrl: "https://drive.google.com/file/d/14CEJsy6KqSjm-kPilGkdhzSidogpeRf6/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/n1c6957pbw?sui=33,7",
              altUrl: "https://drive.google.com/file/d/13htsG5jUJZbwNCi9gAr1DEglECxHE-j5/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.5_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.5_answers.pdf",
              quizId: "7-5_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-6",
      name: "Topic 7.6",
      description: "Confidence Intervals for the Difference of Two Means",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/9i05oi3975?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1fIwr8VpJ1OfuMxmweLAYOL88CLUVpzvF/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/q64qp5gkag?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1dju4ZGQzNLFdFbR5oCoz4e9bzQHapIVk/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.6_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.6_answers.pdf",
              quizId: "7-6_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-7",
      name: "Topic 7.7",
      description: "Justifying a Claim About the Difference of Two Means Based on a Confidence Interval",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/rgaf9khpy1?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1bkfmDJMIaDxbg2XTAnRfdpamFMSCFfM-/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/fbif6dujgq?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1njeWzbSUOPWw0fZHWoYBU7uca9RbduBU/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.7_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.7_answers.pdf",
              quizId: "7-7_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-8",
      name: "Topic 7.8",
      description: "Setting Up a Test for the Difference of Two Population Means",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/kf1yd6gpdi?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1uLGTaehZ2mRh5el69Zu88SnsWfwiKwRR/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/9xskxlobvm?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1PAx6MB_d4DDsF5KHYAbxjOf7VUP0_-E5/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.8_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.8_answers.pdf",
              quizId: "7-8_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-9",
      name: "Topic 7.9",
      description: "Carrying Out a Test for the Difference of Two Population Means",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/2kkmkj7ric?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1329C4d76DZoxl1yQQql_T9SAeoHedObV/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/j22ffmh28e?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1bJ-id40s9xbnD2UZp9bzfBAKxUwtOT2q/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/ox9np4xfys?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1BWoDK2CpQFkIjMsZtzrHb3VjiaJCQlw-/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_section7.9_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_section7.9_answers.pdf",
              quizId: "7-9_q1",
              completed: false,
              completionDate: null
          }
      ],
      current: false
    },
    {
      id: "7-10",
      name: "Topic 7.10",
      description: "Skills Focus: Selecting, Implementing, and Communicating Inference Procedures",
      videos: [
          {
              url: "https://apclassroom.collegeboard.org/d/p1yut2e5pp?sui=33,7",
              altUrl: "https://drive.google.com/file/d/19SaxraKugKUY6Q1xjbanPY81njG45xBH/view?usp=drive_link",
              completed: false,
              completionDate: null
          },
          {
              url: "https://apclassroom.collegeboard.org/d/dkerwbidln?sui=33,7",
              altUrl: "https://drive.google.com/file/d/1LiE45fJPP_XMvutGZzVtr3QfNicJedMi/view?usp=drive_link",
              completed: false,
              completionDate: null
          }
      ],
      quizzes: [],
      current: false
    },
    {
      id: "7-capstone",
      name: "Unit 7 Progress Check",
      description: "Capstone Assessment",
      videos: [],
      quizzes: [
          {
              questionPdf: "pdfs/unit7/unit7_pc_frq_quiz.pdf",
              answersPdf: "pdfs/unit7/unit7_pc_frq_answers.pdf",
              quizId: "7-capstone_q1",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit7/unit7_pc_mcq_parta_answers.pdf",
              quizId: "7-capstone_q2",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit7/unit7_pc_mcq_partb_answers.pdf",
              quizId: "7-capstone_q3",
              completed: false,
              completionDate: null
          },
          {
              questionPdf: null,
              answersPdf: "pdfs/unit7/unit7_pc_mcq_partc_answers.pdf",
              quizId: "7-capstone_q4",
              completed: false,
              completionDate: null
          }
      ],
      isCapstone: true,
      current: false
      }
    ]
  },
  {
    unitId: 'unit8',
    displayName: "Unit 8: Inference for Categorical Data: Chi-Square",
    examWeight: "2-5%",
    topics: [
      {
        id: "8-1",
        name: "Topic 8.1",
        description: "Introducing Statistics: Are My Results Unexpected?",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/ej0nzh9akp?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1kw-NYDqOcOUP8zvAsSuzIfuQ9KXow99C/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "8-2",
        name: "Topic 8.2",
        description: "Setting Up a Chi-Square Goodness of Fit Test",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/y7ikpxw7jp?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1Aup8w5fYTy69zWogOdtsXCO6kl6UNCCT/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/3uua57pe0x?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1Y7lopnXRCIbckoMM9csk8h1uCixX3LKd/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/z0hykwj3ge?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1FMDpI5aNP3UoB4YppkX3ba7llfvfhLba/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_section8.2_quiz.pdf",
                answersPdf: "pdfs/unit8/unit8_section8.2_answers.pdf",
                quizId: "8-2_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "8-3",
        name: "Topic 8.3",
        description: "Carrying Out a Chi-Square Test for Goodness of Fit",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/9fkzxeaa5b?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1NemHYSwgnig3l3FUeyDYcDdt80aIYfd4/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/1rm91jvq1n?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1A3t8-9QW7ubguCrQdApGKf4GkZWb1qBi/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/nayiwphnlr?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1tqgSvs4IHjltdUWtH7WmyqbPWGCMMoXb/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_section8.3_quiz.pdf",
                answersPdf: "pdfs/unit8/unit8_section8.3_answers.pdf",
                quizId: "8-3_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "8-4",
        name: "Topic 8.4",
        description: "Expected Counts in Two-Way Tables",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/hmyh34raqt?sui=33,8",
                altUrl: "https://drive.google.com/file/d/16dgP2zYBVUN2qzFlGRXKZ5aqErJv8FyQ/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_section8.4_quiz.pdf",
                answersPdf: "pdfs/unit8/unit8_section8.4_answers.pdf",
                quizId: "8-4_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "8-5",
        name: "Topic 8.5",
        description: "Setting Up a Chi-Square Test for Homogeneity or Independence",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/0bnpabex6u?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1YHP2ipcZ5Vj35OVgZBYwExUjfU-yB2q1/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/kqfcpu28su?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1YHP2ipcZ5Vj35OVgZBYwExUjfU-yB2q1/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_section8.5_quiz.pdf",
                answersPdf: "pdfs/unit8/unit8_section8.5_answers.pdf",
                quizId: "8-5_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "8-6",
        name: "Topic 8.6",
        description: "Carrying Out a Chi-Square Test for Homogeneity or Independence",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/gp64nrb7vq?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1DS_LxyMAABbjaN3VrMjBcDXy0PwbDaP3/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/88cjo73k9v?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1hm-K8vBzjXcx7hTdU2E8-0bIDhdUgiq_/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/1ea6gxau2t?sui=33,8",
                altUrl: "https://drive.google.com/file/d/1v9ENpspNX7MSsuE50ZXoQyizuGOJ35sp/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_section8.6_quiz.pdf",
                answersPdf: "pdfs/unit8/unit8_section8.6_answers.pdf",
                quizId: "8-6_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "8-7",
        name: "Topic 8.7",
        description: "Skills Focus: Selecting an Appropriate Inference Procedure for Categorical Data",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/v3kuvm87ss?sui=33,8",
                altUrl: "https://drive.google.com/file/d/175SWda7WXUWkt1EbLLDOwKWD-4Gn8llx/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "8-capstone",
        name: "Unit 8 Progress Check",
        description: "Capstone Assessment",
        videos: [],
        quizzes: [
            {
                questionPdf: "pdfs/unit8/unit8_pc_frq.pdf",
                answersPdf: "pdfs/unit8/unit8_pc_frq_answers.pdf",
                quizId: "8-capstone_q1",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit8/unit8_pc_mcq_partA_answers.pdf",
                answersPdf: null,
                quizId: "8-capstone_q2",
                completed: false,
                completionDate: null
            },
            {
                questionPdf: "pdfs/unit8/unit8_pc_mcq_partB_answers.pdf",
                answersPdf: null,
                quizId: "8-capstone_q3",
                completed: false,
                completionDate: null
            }
        ],
        isCapstone: true,
        current: false
      }
    ]
  },
  {
    unitId: 'unit9',
    displayName: "Unit 9: Inference for Quantitative Data: Slopes",
        examWeight: "2-5%",
    topics: [
      {
        id: "9-1",
        name: "Topic 9.1",
        description: "Introducing Statistics: Do Those Points Align?",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/pdddxf5g7m?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1aMPs1uK5H7dvYoVaGh2TQLkdJGBAjoPd/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "9-2",
        name: "Topic 9.2",
        description: "Confidence Intervals for the Slope of a Regression Model",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/juuru4ud2g?sui=33,9",
                altUrl: "https://drive.google.com/file/d/18e3wAS58P1SW1ok8tv3mtFPhmM3pCRwN/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/s7fp3ef6i1?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1LLyG6B71f0kAoo6QHxQPb1JGQ4hVwkKq/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/ote8293qie?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1UkOJyY-qEovCHQANK5jtZhzNNpa4iHbK/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit9/unit9_section9.2_quiz.pdf",
                answersPdf: "pdfs/unit9/unit9_section9.2_answers.pdf",
                quizId: "9-2_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "9-3",
        name: "Topic 9.3",
        description: "Justifying a Claim About the Slope of a Regression Model Based on a Confidence Interval",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/umv9qc22kb?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1yWqjcF-IyHImRwTBV3cEIt13u0infZzI/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/ynbq7du52l?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1GqvcUy_AJRnTgDORWQkAVHSWjKpRxTaT/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit9/unit9_section9.3_quiz.pdf",
                answersPdf: "pdfs/unit9/unit9_section9.3_answers.pdf",
                quizId: "9-3_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "9-4",
        name: "Topic 9.4",
        description: "Setting Up a Test for the Slope of a Regression Model",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/quc0brlorr?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1LKHmLObjf3Nnszvk833XeLgH5JJ9F0_g/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/mqvjasjnfa?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1EBPBsC-oJXGaxn7jp1Q92IWetvaPNl1M/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit9/unit9_section9.4_quiz.pdf",
                answersPdf: "pdfs/unit9/unit9_section9.4_answers.pdf",
                quizId: "9-4_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "9-5",
        name: "Topic 9.5",
        description: "Carrying Out a Test for the Slope of a Regression Model",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/qepiqzyga4?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1aggJHSL5dJcEBYuo4Z7M_lvsoLvx4RYY/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/7rptngcenm?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1vct7foAM_sxXzRy4rviUox0DkQMm7Yf-/view?usp=drive_link",
                completed: false,
                completionDate: null
            },
            {
                url: "https://apclassroom.collegeboard.org/d/mwl7ag5ipr?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1h5OJH_mC6MUqmKbW_K-Xqx7IN3bjOscz/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [
            {
                questionPdf: "pdfs/unit9/unit9_section9.5_quiz.pdf",
                answersPdf: "pdfs/unit9/unit9_section9.5_answers.pdf",
                quizId: "9-5_q1",
                completed: false,
                completionDate: null
            }
        ],
        current: false
      },
      {
        id: "9-6",
        name: "Topic 9.6",
        description: "Skills Focus: Selecting an Appropriate Inference Procedure",
        videos: [
            {
                url: "https://apclassroom.collegeboard.org/d/mitydyeo84?sui=33,9",
                altUrl: "https://drive.google.com/file/d/1FcZcPYSLBXLkfBkpkyTfAWQ6tR_WxZ6o/view?usp=drive_link",
                completed: false,
                completionDate: null
            }
        ],
        quizzes: [],
        current: false
      },
      {
        id: "9-capstone",
        name: "Unit 9 Progress Check",
        description: "Capstone Assessment",
        videos: [],
        quizzes: [
            {
                questionPdf: "pdfs/unit9/unit9_pc_frq.pdf",
                answersPdf: "pdfs/unit9/unit9_pc_frq_answers.pdf",
                quizId: "9-capstone_q1",
                completed: false,
                completionDate: null
            },
            {
                answersPdf: "pdfs/unit9/unit9_pc_mcq_partA_answers.pdf",
                quizId: "9-capstone_q2",
                completed: false,
                completionDate: null
            },
            {
                answersPdf: "pdfs/unit9/unit9_pc_mcq_partB_answers.pdf",
                quizId: "9-capstone_q3",
                completed: false,
                completionDate: null
            }
        ],
        isCapstone: true,
        current: false
      }
    ]
  },
  
]; // End of ALL_UNITS_DATA array

// Optional helper function to calculate totals (can be included in the same file)
// This function is used by displayRemainingItemCounts and displayFlexibleQuota
function getTotalItemCounts(allUnitsDataArray = ALL_UNITS_DATA) {
    let totalVideos = 0;
    let totalQuizzes = 0;

    if (!allUnitsDataArray || !Array.isArray(allUnitsDataArray)) {
        console.error("Invalid data provided to getTotalItemCounts in allUnitsData.js");
        return { totalVideos: 0, totalQuizzes: 0 };
    }

    allUnitsDataArray.forEach(unit => {
        if (unit.topics && Array.isArray(unit.topics)) {
            unit.topics.forEach(topic => {
                // Count videos
                if (topic.videos && Array.isArray(topic.videos)) {
                    // Ensure we count each unique video URL only once if necessary,
                    // or simply count the number of video objects if each represents a task.
                    // Current implementation counts each video object:
                    totalVideos += topic.videos.length;
                }
                // Count quizzes
                if (topic.quizzes && Array.isArray(topic.quizzes)) {
                    // Counts each quiz object as one item. Adjust if structure is different (e.g., multiple PDFs per quiz object).
                    totalQuizzes += topic.quizzes.length;
                }
            });
        }
    });
    console.log(`getTotalItemCounts calculated: ${totalVideos} videos, ${totalQuizzes} quizzes`); // Added log
    return { totalVideos, totalQuizzes };
}

// Example of how other scripts might use this (don't include this line if using getTotalItemCounts):
// const globalCounts = getTotalItemCounts();