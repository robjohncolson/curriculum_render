window.FRQ_CHART_INVENTORY = {
  "totalFrqs": 34,
  "wordsOnly": 9,
  "chartFrqs": 25,
  "byType": {
    "histogram": {
      "count": 3,
      "ids": [
        "U1-L10-Q04",
        "U1-PC-FRQ-Q01",
        "U5-L2-Q01"
      ]
    },
    "dotplot": {
      "count": 0,
      "ids": []
    },
    "boxplot": {
      "count": 0,
      "ids": []
    },
    "scatter": {
      "count": 3,
      "ids": [
        "U2-L9-Q01",
        "U2-PC-FRQ-Q01",
        "U9-PC-FRQ-Q01"
      ]
    },
    "bar": {
      "count": 3,
      "ids": [
        "U3-L5-Q02",
        "U3-PC-FRQ-Q02",
        "U8-L3-Q03"
      ]
    },
    "pie": {
      "count": 0,
      "ids": []
    },
    "line": {
      "count": 0,
      "ids": []
    },
    "numberline": {
      "count": 0,
      "ids": []
    },
    "normal": {
      "count": 8,
      "ids": [
        "U1-L10-Q06",
        "U1-PC-FRQ-Q02",
        "U5-L6-FRQ-Q01",
        "U5-PC-FRQ-Q01",
        "U6-L3-Q01",
        "U6-L7-Q08",
        "U6-PC-FRQ-Q01",
        "U6-PC-FRQ-Q02"
      ]
    },
    "chisquare": {
      "count": 3,
      "ids": [
        "U8-L6-Q02",
        "U8-PC-FRQ-Q01",
        "U8-PC-FRQ-Q02"
      ]
    },
    "multi": {
      "count": 5,
      "items": [
        {
          "id": "U2-PC-FRQ-Q02",
          "types": [
            "normal",
            "scatter"
          ]
        },
        {
          "id": "U5-PC-FRQ-Q02",
          "types": [
            "histogram",
            "dotplot"
          ]
        },
        {
          "id": "U7-L8-Q01",
          "types": [
            "boxplot",
            "dotplot"
          ]
        },
        {
          "id": "U8-L3-Q05",
          "types": [
            "bar",
            "scatter"
          ]
        },
        {
          "id": "U9-L3-FRQ-Q01",
          "types": [
            "scatter",
            "boxplot"
          ]
        }
      ]
    },
    "other": []
  },
  "unknowns": [
    {
      "id": "U3-L3-Q01",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U3-PC-FRQ-Q01",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U4-L9-Q04",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U4-PC-FRQ-Q01",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U4-PC-FRQ-Q02",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U6-L11-Q07",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U7-L5-Q04",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U7-PC-FRQ-Q01",
      "reason": "noKeywordsNoFlags"
    },
    {
      "id": "U7-PC-FRQ-Q02",
      "reason": "noKeywordsNoFlags"
    }
  ],
  "items": [
    {
      "id": "U1-L10-Q04",
      "unit": "1",
      "lesson": "10",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "histogram",
      "types": [],
      "detectionSources": [
        "flag:chartType:histogram",
        "keyword:histogram"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following frequency table summarizes the total amounts, in dollars, for 91 orders from a food truck during a certain day.\n\n(a-i) Use the data in the table to create a histogram showing the distribution of the amounts of the orders.\n(a-ii) Describe the shape of the distribution of amounts.\n(b) Identify a possible amount for the median of the distribution. Justify your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "histogram": {}
      },
      "unknownReason": null
    },
    {
      "id": "U1-L10-Q06",
      "unit": "1",
      "lesson": "10",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nKathy and her brother Clay recently ran in a local marathon. The distribution of finishing time for women was approximately normal with mean 259 minutes and standard deviation 32 minutes. The distribution of finishing time for men was approximately normal with mean 242 minutes and standard deviation 29 minutes.\n\n(a) The finishing time for Clay was 289 minutes. Calculate and interpret the standardized score for Clay's marathon time. Show your work.\n(b) The finishing time for Kathy was 272 minutes. What proportion of women who ran the marathon had a finishing time less than Kathy's? Show your work.\n(c) The standard deviation of finishing time is greater for women than for men. What does this indicate about the finishing times of the women who ran the marathon compared to the finishing times of the men who ran the marathon?",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U1-PC-FRQ-Q01",
      "unit": "1",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "histogram",
      "types": [],
      "detectionSources": [
        "flag:requiresGraph:histogram",
        "flag:chartType:histogram",
        "keyword:histogram",
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe manager of a vacation resort believes that the ages of adult visitors to the resort can be modeled by a normal distribution. The manager surveyed a random sample of visitors and recorded their age. A summary of the responses is shown in the frequency table, where x represents the age of the visitor.\n\n(a) Construct a histogram of the distribution of ages.\n(b) Write a few sentences to describe the distribution of ages of the adult visitors to the resort.\n(c) Does the histogram provide convincing evidence that the surveyed ages come from a normal distribution? Explain your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": true
      },
      "subFlagsByType": {
        "histogram": {
          "histogramFromTable": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U1-PC-FRQ-Q02",
      "unit": "1",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA certain type of bird lives in two regions of a state. The distribution of weight for birds of this type in the northern region is approximately normal with mean 10 ounces and standard deviation 3 ounces. The distribution of weight for birds of this type in the southern region is approximately normal with mean 16 ounces and standard deviation 2.5 ounces.\n\n(a) Calculate the z-scores for a weight of 13 ounces for a bird living in the northern region and for a weight of 13 ounces for a bird living in the southern region.\n(b) Is it more likely that a bird of this type with a weight greater than 13 ounces lives in the northern region or the southern region? Justify your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U2-L9-Q01",
      "unit": "2",
      "lesson": "9",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "scatter",
      "types": [],
      "detectionSources": [
        "flag:chartType:scatter",
        "keyword:scatterplot"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following scatterplot shows the number of wins and the attendance per game for 30 baseball teams in 2017. Also shown are the least-squares regression line and computer output.\n\n(a) Interpret the slope of the least-squares regression line in context.\n\n(b) Explain why it is not reasonable to use the least-squares regression model to predict attendance per game for 0 wins.\n\n(c) What is the value of the correlation coefficient for the sample?\n\n(d) If the point representing 64 wins and attendance of 40,786 people per game is removed from the set of data and a new regression analysis is conducted, how would the following be impacted? Explain your reasoning.\n(i) The slope of the least-squares line:\n(ii) The correlation coefficient:",
      "subFlags": {
        "scatterNeedsRegression": true,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "scatter": {
          "scatterNeedsRegression": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U2-PC-FRQ-Q01",
      "unit": "2",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "scatter",
      "types": [],
      "detectionSources": [
        "flag:chartType:scatter",
        "keyword:scatterplot"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following table shows the annual income, in dollars, and amount spent on vacation, in dollars, for a sample of 8 families.\n\n(a) Create a scatterplot of the data in the table.\n(b) Describe the association shown in the scatterplot created in part (a).\n(c) Calculate the coefficient of determination for the data, and interpret the value in context.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "scatter": {}
      },
      "unknownReason": null
    },
    {
      "id": "U2-PC-FRQ-Q02",
      "unit": "2",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "multi",
      "types": [
        "normal",
        "scatter"
      ],
      "detectionSources": [
        "flag:chartType:normal",
        "flag:chartType:scatter",
        "keyword:scatterplot",
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA random sample of 65 high school seniors was selected from all high school seniors at a certain high school. The following scatterplot shows the height, in centimeters (cm), and the foot length, in cm, for each high school senior from the sample. The least-squares regression line is shown. The computer output from the least-squares regression analysis is also shown.\n\n(a) Calculate and interpret the residual for the high school senior with a foot length of 20 cm and a height of 160 cm.\n(b) The standard deviation of the residuals is \\(s = 5.9\\). Interpret the value in context.\n(c) Assume that the distribution of residuals is approximately normal with mean 0 cm and standard deviation 5.9 cm. What percent of the residuals are greater than 8 cm? Justify your answer.\n(d) Based on your answer to part (c), would it be surprising to randomly select a high school senior from the high school with a foot length of 20 cm and a height greater than 165 cm? Justify your answer.",
      "subFlags": {
        "scatterNeedsRegression": true,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        },
        "scatter": {
          "scatterNeedsRegression": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U3-L3-Q01",
      "unit": "3",
      "lesson": "3",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nBiologists want to estimate the number of deer living in a certain region. They will use a method known as a hair snare. A hair snare is a length of barbed wire set up near a salt lick, where deer can lick minerals and nutrients from salt deposits. The wire snares hair from the neck of the deer. The hair is collected and sent for analysis.\n\nThe biologists will randomly place 90 salt licks throughout the region. The region consists of 3 areas: the town, the forest, and the lake, as shown in the following diagram.\n\n(a) Two methods have been proposed for choosing where to place the salt licks: a simple random sample or a stratified random sample, with area as strata. Give one reason why the stratified random sample might be the better method for choosing where to place the salt licks.\n\n(b) By using the hair snare method, deer are sampled with replacement. Why is sampling with replacement a problem in this context, and how would the problem impact the estimate of the number of deer living in the region?",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U3-L5-Q02",
      "unit": "3",
      "lesson": "5",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "bar",
      "types": [],
      "detectionSources": [
        "flag:chartType:bar",
        "keyword:bar chart"
      ],
      "promptSnippet": "To prevent deer from running across highways, researchers are investigating sound-emitting devices that would frighten …",
      "fullPrompt": "To prevent deer from running across highways, researchers are investigating sound-emitting devices that would frighten deer before they reach the highway. As part of the investigation, the researchers set up devices along a two-mile stretch of road. When a deer approached a device, the device would activate and emit a sound. The researchers recorded whether the deer moved toward the highway (positive response), away from the highway (negative response), or did not move (neutral response). The researchers kept the loudness of the sound constant at 60 decibels. However, they varied the pitch of the sound. There were 6 treatment levels, all measured in kilohertz (\\(\\text{kHz}\\)): 0, 0.28, 1, 8, 15, and 28. The order of the treatments was randomly assigned.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "bar": {}
      },
      "unknownReason": null
    },
    {
      "id": "U3-PC-FRQ-Q01",
      "unit": "3",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Researchers are investigating whether people who exercise with a training partner have a greater increase, on average, …",
      "fullPrompt": "Researchers are investigating whether people who exercise with a training partner have a greater increase, on average, in targeted exercise intensity compared with people who exercise alone. Two methods of collecting data have been proposed.\n\nMethod I: Recruit volunteers who are willing to participate. Randomly assign each participant to exercise with a training partner or to exercise alone.\n\nMethod II: Select a random sample of people from all the people who exercise at a community fitness center. Ask each person in the sample whether they use a training partner, and use the response to create the two groups.\n\n(a) For each method, the researchers will record the change in targeted exercise intensity for each person in the investigation. They will compare the mean change in intensity between those who exercise with a training partner and those who do not.\n\n(i) Describe the population of generalization if method I is used. Explain your answer.\n\n(ii) Describe the population of generalization if method II is used. Explain your answer.\n\n(b) Suppose the investigation produces a result that is statistically significant using both methods. What can be concluded if method I is used that cannot be concluded if method II is used? Explain your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U3-PC-FRQ-Q02",
      "unit": "3",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "bar",
      "types": [],
      "detectionSources": [
        "flag:chartType:bar",
        "keyword:bar chart"
      ],
      "promptSnippet": "A survey was given to a random sample of 400 people living in a certain community. The people were asked whether they s…",
      "fullPrompt": "A survey was given to a random sample of 400 people living in a certain community. The people were asked whether they supported the construction of walking trails in the community park. The results are shown in the following table.\n\n| Response | Frequency |\n|----------|----------|\n| Yes, support | 210 |\n| No, do not support | 90 |\n| No opinion | 100 |\n| Total | 400 |\n\n(a) Complete the following segmented bar chart to show the relative frequencies of the results.\n\nA follow-up study will be conducted with a sample of 20 people from the 300 people who responded yes (support) and no (do not support). Two sampling methods have been proposed: a simple random sample and a stratified random sample with the survey response as strata.\n\n(b) If the stratified random sample is used, what is the number of people that will be selected from those who responded yes? Support your answer by showing your work.\n\n(c) Describe a statistical advantage of using the stratified random sample instead of the simple random sample for the follow-up study.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "bar": {}
      },
      "unknownReason": null
    },
    {
      "id": "U4-L9-Q04",
      "unit": "4",
      "lesson": "9",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nCompany F sells fabrics known as fat quarters, which are rectangles of fabric created by cutting a yard of fabric into four pieces. Occasionally the manufacturing process results in a fabric defect. Let the random variable \\(X\\) represent the number of defects on a fat quarter created by Company F. The following table shows the probability distribution of \\(X\\).\n\nIf a fat quarter has more than 2 defects, it cannot be sold and is discarded. Let the random variable \\(Y\\) represent the number of defects on a fat quarter that can be sold by Company F.\n\n(a) Construct the probability distribution of the random variable \\(Y\\).\n\n(b) Determine the mean and standard deviation of \\(Y\\). Show your work.\n\nCompany G also sells fat quarters. The mean and standard deviation of the number of defects on a fat quarter that can be sold by Company G are 0.40 and 0.66, respectively. The fat quarters sell for $5.00 each, but are discounted by $1.50 for each defect found.\n\n(c) What are the mean and standard deviation of the selling price for the fat quarters sold by Company G?",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U4-PC-FRQ-Q01",
      "unit": "4",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nAt a financial institution, a fraud detection system identifies suspicious transactions and sends them to a specialist for review. The specialist reviews the transaction, the customer profile, and past history. If there is sufficient evidence of fraud, the transaction is blocked. Based on past history, the specialist blocks 40 percent of the suspicious transactions. Assume a suspicious transaction is independent of other suspicious transactions.\n\n(a) Suppose the specialist will review 136 suspicious transactions in one day. What is the expected number of blocked transactions by the specialist? Show your work.\n\n(b) Suppose the specialist wants to know the number of suspicious transactions that will need to be reviewed until reaching the first transaction that will be blocked.\n(i) Define the random variable of interest and state how the variable is distributed.\n(ii) Determine the expected value of the random variable and interpret the expected value in context.\n\n(c) Consider a batch of 10 randomly selected suspicious transactions. Suppose the specialist wants to know the probability that 2 of the transactions will be blocked.\n(i) Define the random variable of interest and state how the variable is distributed.\n(ii) Find the probability that 2 transactions in the batch will be blocked. Show your work.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U4-PC-FRQ-Q02",
      "unit": "4",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nMiguel is a golfer, and he plays on the same course each week. The following table shows the probability distribution for his score on one particular hole, known as the Water Hole.\n\nLet the random variable \\(X\\) represent Miguel's score on the Water Hole. In golf, lower scores are better.\n\n(a) Suppose one of Miguel's scores from the Water Hole is selected at random. What is the probability that Miguel's score on the Water Hole is at most 5? Show your work.\n\n(b) Calculate and interpret the expected value of \\(X\\). Show your work.\n\nThe name of the Water Hole comes from the small lake that lies between the tee, where the ball is first hit, and the hole. Miguel has two approaches to hitting the ball from the tee, the short hit and the long hit. The short hit results in the ball landing before the lake. The values of \\(X\\) in the table are based on the short hit. The long hit, if successful, results in the ball traveling over the lake and landing on the other side.\n\nA potential issue with the long hit is that the ball might land in the water, which is not a good outcome. Miguel thinks that if the long hit is successful, his expected value improves to 4.2. However, if the long hit fails and the ball lands in the water, his expected value would be worse and increases to 5.4.\n\n(c) Suppose the probability of a successful long hit is 0.4. Which approach, the short hit or the long hit, is better in terms of improving the expected value of the score? Justify your answer.\n\n(d) Let \\(p\\) represent the probability of a successful long hit. What values of \\(p\\) will make the long hit better than the short hit in terms of improving the expected value of the score? Explain your reasoning.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U5-L2-Q01",
      "unit": "5",
      "lesson": "2",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "histogram",
      "types": [],
      "detectionSources": [
        "flag:chartType:histogram",
        "keyword:histogram",
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nOne woman from the population will be selected at random.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "histogram": {}
      },
      "unknownReason": null
    },
    {
      "id": "U5-L6-FRQ-Q01",
      "unit": "5",
      "lesson": "6",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA polling agency is investigating the voter support for a ballot measure in an upcoming city election. The agency will select a random sample of 500 voters from one region, Region A, of the city. Assume that the population proportion of voters who would support the ballot measure in Region A is 0.47.\n\n(a) What is the probability that the proportion of voters in the sample of Region A who support the ballot measure is greater than 0.50?\n\nThe polling agency will take another sample from a different region, Region B, of the city. The agency plans to select a random sample of 400 voters. Assume that the population proportion of voters who would support the ballot measure in Region B is 0.51.\n\n(b) Describe the sampling distribution of the difference in sample proportions (Region B minus Region A).\n\n(c) What is the probability that the two sample proportions will differ by more than 0.05?",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U5-PC-FRQ-Q01",
      "unit": "5",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nResearchers are studying two populations of sea turtles. In population D, 30 percent of the turtles have a shell length greater than 2 feet. In population E, 20 percent of the turtles have a shell length greater than 2 feet. From a random sample of 40 turtles selected from D, 15 had a shell length greater than 2 feet. From a random sample of 60 turtles selected from E, 11 had a shell length greater than 2 feet. Let \\(\\hat{p}_D\\) represent the sample proportion for D, and let \\(\\hat{p}_E\\) represent the sample proportion for E.\n\n(a) What is the value of the difference \\(\\hat{p}_D - \\hat{p}_E\\)? Show your work.\n\n(b) What are the mean and standard deviation of the sampling distribution of the difference in sample proportions \\(\\hat{p}_D - \\hat{p}_E\\)? Show your work and label each value.\n\n(c) Can it be assumed that the sampling distribution of the difference of the sample proportions \\(\\hat{p}_D - \\hat{p}_E\\) is approximately normal? Justify your answer.\n\n(d) Consider your answer in part (a). What is the probability that \\(\\hat{p}_D - \\hat{p}_E\\) is greater than the value found in part (a)? Show your work.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U5-PC-FRQ-Q02",
      "unit": "5",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "multi",
      "types": [
        "histogram",
        "dotplot"
      ],
      "detectionSources": [
        "flag:chartType:histogram",
        "flag:chartType:dotplot",
        "keyword:histogram",
        "keyword:dotplot",
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following histogram shows the distribution of house values in a certain city. The mean of the distribution is $403,000 and the standard deviation is $278,000.\n\n(a) Suppose one house from the city will be selected at random. Use the histogram to estimate the probability that the selected house is valued at less than $500,000. Show your work.\n\n(b) Suppose a random sample of 40 houses are selected from the city. Estimate the probability that the mean value of the 40 houses is less than $500,000. Show your work.\n\nTo estimate a population mean μ, the sample mean \\(\\bar{x}\\) is often used as an estimator. However, a different estimator is called the sample midrange, given by the formula \\(\\frac{\\text{sample minimum} + \\text{sample maximum}}{2}\\).\n\n(c) The following table shows the values, in thousands of dollars, of 40 randomly selected houses in the city.\n\n(i) Calculate the sample midrange for the data.\n\n(ii) Explain why the sample midrange might be preferred to the sample mean as an estimator of the population mean.\n\n(d) To investigate the sampling distribution of the sample midrange, a simulation is performed in which 100 random samples of size n = 40 were selected from the population of house values. For each sample, the sample midrange was calculated and recorded on the following dotplot. The mean of the distribution of sample midranges is $617,000 with standard deviation $136,000.\n\nBased on the results of the simulation, explain why the sample mean might be preferred to the sample midrange as an estimator of the population mean.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "histogram": {},
        "dotplot": {}
      },
      "unknownReason": null
    },
    {
      "id": "U6-L3-Q01",
      "unit": "6",
      "lesson": "3",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe manufacturer of a certain type of new cell phone battery claims that the average life span of the batteries is 500 charges; that is, the battery can be charged at least 500 times before failing. To investigate the claim, a consumer group will select a random sample of cell phones with the new battery and use the phones through 500 charges of the battery. The proportion of batteries that fail to last through 500 charges will be recorded. The results will be used to construct a 95 percent confidence interval to estimate the proportion of all such batteries that fail to last through 500 charges.\n\n(a) Explain in context what it means to be 95 percent confident.\n\n(b) Suppose the consumer group conducts its investigation with a random sample of 5 cell phones with the new battery, and 1 battery out of the 5 fails to last through 500 charges. Verify all conditions for inference for a 95 percent confidence interval for a population proportion. Indicate whether any condition has not been met. Do not construct the interval.\n\n(c) Based on the simulation, what proportion of the 95 percent confidence intervals capture the population proportion of 0.3? Explain how you determined your answer.\n\n(d) For the cell phone batteries, consider a sample of 5 in which 1 battery fails to last through 500 charges.\n    (i) Using the alternate method described, what is the value of \\(\\hat{p}_{new}\\)? Show your work.\n    (ii) Based on the results of the simulation, is the alternate method better than the traditional method described in part (b) to construct a 95 percent confidence interval with a small sample size? Explain your reasoning.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {}
      },
      "unknownReason": null
    },
    {
      "id": "U6-L7-Q08",
      "unit": "6",
      "lesson": "7",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe distribution of pH levels for all community swimming pools in a large county is approximately normal with mean 7.5 and standard deviation 0.2. According to swimming pool studies, the safest pH levels for water in swimming pools are between 7.2 and 7.8.\n\n(a) One community swimming pool in the county will be selected at random. What is the probability that the selected pool has a pH level that is not considered safe?\n\nThe county health inspector will select a random sample of 4 community swimming pools in the county to investigate the pH levels.\n\n(b) Describe the sampling distribution of the sample mean for samples of size 4.\n\n(c) Consider the situation in which the health inspector finds the sample mean of the 4 pools to be outside the safe pH levels. As a result, the inspector declares that the population mean is not 7.5. However, if the population mean really is 7.5, the inspector will have made an error. Such an error is called a Type I error. Find the probability that the inspector will make a Type I error with the sample of 4 pools. Show your work.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": true,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {
          "normalParams": true
        }
      },
      "unknownReason": null
    },
    {
      "id": "U6-L11-Q07",
      "unit": "6",
      "lesson": "11",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "A random sample of 100 people from region A and a random sample of 100 people from region B were surveyed about their g…",
      "fullPrompt": "A random sample of 100 people from region A and a random sample of 100 people from region B were surveyed about their grocery-shopping habits. From the region A sample, 16 percent of the people indicated that they shop for groceries online. From the region B sample, 24 percent of the people indicated that they shop for groceries online.\n\nAt the significance level of \\(\\alpha = 0.05\\), do the data provide convincing statistical evidence that there is a difference between the two regions for the population proportions of people who shop online for groceries? Complete the appropriate inference procedure to support your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U6-PC-FRQ-Q01",
      "unit": "6",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA recent survey collected information on television viewing habits from a random sample of 1,000 people in the United States. Of those sampled, 37 percent indicated that their favorite sport to watch on television was American football.\n\n(a) Construct and interpret a 95 percent confidence interval for the proportion of all people in the United States who would indicate that their favorite sport to watch on television is American football.\n\n(b) Based on your answer to part (a), is it reasonable to believe that 33 percent is the actual percent of people in the United States whose favorite sport to watch on television is American football? Justify your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {}
      },
      "unknownReason": null
    },
    {
      "id": "U6-PC-FRQ-Q02",
      "unit": "6",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "normal",
      "types": [],
      "detectionSources": [
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA fair die, with its faces numbered from 1 to 6, is one in which each number is equally likely to land face up when the die is rolled. On a fair die, the probability that the number 6 will land face up is \\(\\frac{1}{6}\\). A group of students wanted to investigate a claim about manipulating a fair die so that it favors one outcome. The claim states that if a fair die is put into an oven and baked at 200°F for 10 minutes, the inside of the die will begin to melt. When the die cools, the inside will be solid again, but with more weight toward the bottom. This shift in weight will cause the face that was up when the die cooled to land up more often that the other faces.\n\nThe students obtained a fair die and baked it according to the preceding directions. The die cooled with the number 6 face up. After the die cooled, they rolled the die 200 times, and the number 6 landed face up 43 times. Let \\(p\\) represent the population proportion of times the number 6 will land face up on the baked die if the die could be rolled an infinite number of times.\n\n(a) Clarke, one of the students, constructed a 95 percent confidence interval for \\(p\\) as \\(0.215 \\pm 0.057\\). Does the interval provide convincing statistical evidence that the number 6 will land face up more often on the baked die than on a fair die? Explain your reasoning.\n\n(b) Aurelia, another student, suggested they conduct a significance test to investigate the claim. She tested the hypotheses \\(H_0: p = \\frac{1}{6}\\) versus \\(H_a: p > \\frac{1}{6}\\) at the significance level of \\(\\alpha = 0.05\\). She obtained a test statistic of \\(z = 1.83\\) with a p-value of 0.033. Do the results of the significance test agree with the results of Clarke's confidence interval in part (a)? Explain your reasoning.\n\n(c) Two standard normal curves are shown below, one for the confidence interval calculated in part (a) and one for the significance test conducted in part (b).\n\n(i) For the confidence interval curve, label the critical values for the 95% confidence level and shade the area that represents values in the outer 5%.\n\n(ii) For the significance test curve, label the critical value for the 5% significance level and shade the area representing the values of \\(z\\) that would lead to a rejection of the null hypothesis in part (b).\n\n(d) Joachim, a third student, noted that the confidence interval in part (a) gives plausible values of the parameter as an interval between two values. He suggested that they develop a one-sided confidence interval because they were only concerned with whether the number 6 was landing face up more often than expected, not less often. The one-sided-interval will determine a value \\(L\\) such that all plausible values of \\(p\\) are greater than \\(L\\). The formula for \\(L\\) is \\(L = \\hat{p} - z^* \\sqrt{\\frac{\\hat{p}(1-\\hat{p})}{n}}\\).\n\n(i) Determine the values of \\(z^*\\) needed to create the one-sided 95 percent confidence interval. Then calculate the value of \\(L\\).\n\n(ii) Do the results of Joachim's one-sided confidence interval agree with results of Aurelia's significance test in part (b)? Explain your reasoning.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "normal": {}
      },
      "unknownReason": null
    },
    {
      "id": "U7-L5-Q04",
      "unit": "7",
      "lesson": "5",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "A recent study reported that high school students spend an average of 94 minutes per day texting. Jenna claims that the…",
      "fullPrompt": "A recent study reported that high school students spend an average of 94 minutes per day texting. Jenna claims that the average for the students at her large high school is greater than 94 minutes. She will conduct a study to investigate this claim.\n\n(a) To collect data, Jenna will select a sample of size 32 from the population.\n    (i) State Jenna's population of interest.\n    (ii) Name and describe a sampling method Jenna could use that will satisfy the conditions needed for inference to the population.\n\n(b) Based on a sample of 32 students, Jenna calculated a sample mean of 96.5 minutes and a sample standard deviation of 6.3 minutes. Assume all conditions for inference are met. At the significance level of \\(\\alpha = 0.05\\), do the data provide convincing statistical evidence to support Jenna's claim? Complete an appropriate inference procedure to support your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U7-L8-Q01",
      "unit": "7",
      "lesson": "8",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "multi",
      "types": [
        "boxplot",
        "dotplot"
      ],
      "detectionSources": [
        "flag:chartType:boxplot",
        "flag:chartType:dotplot",
        "keyword:dotplot",
        "keyword:boxplot",
        "keyword:normal curve"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA team of psychologists studied the concept of visualization in basketball, where players visualize making a basket before shooting the ball. They conducted an experiment in which 20 basketball players with similar abilities were randomly assigned to two groups. The 10 players in group 1 received visualization training, and the 10 players in group 2 did not.\n\nEach player stood 22 feet from the basket at the same location on the basketball court. Each player was then instructed to attempt to make the basket until two consecutive baskets were made. The players who received visualization training were instructed to use visualization techniques before attempting to make the basket. The total number of attempts, including the last two attempts, were recorded for each player.\n\nThe total number of attempts for each of the 20 players are summarized in the following boxplots.\n\n(a) Based on the boxplots, did basketball players who received visualization training tend to need fewer attempts to make two consecutive baskets from a distance of 22 feet than players who did not receive the training? Explain your reasoning.\n\n(b) State and check conditions for conducting a two-sample \\(t\\)-test for a difference in means.\n\nBecause both distributions, visualization and no visualization, are skewed, the psychologists conducted a simulation to test for a difference in medians rather than means. For each trial of the simulation, the 20 values of the total number of attempts observed in the experiment were combined into one group and then randomly split into two groups of 10. The difference in the medians \\((V - NV)\\) of the groups was calculated for each trial. The following dotplot shows the difference in the medians for 100 trials of the simulation.\n\n(c) Using the observed difference in medians \\((V - NV)\\) and the results of the simulation, estimate a \\(p\\)-value for a test for the difference in medians. Show the work needed to calculate this \\(p\\)-value.\n\n(d) Based on the \\(p\\)-value in part (c), is there convincing statistical evidence that basketball players similar to the ones in this study who receive visualization training need fewer attempts to make two consecutive baskets from a distance of 22 feet than those who do not receive such training? Justify your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "boxplot": {},
        "dotplot": {}
      },
      "unknownReason": null
    },
    {
      "id": "U7-PC-FRQ-Q01",
      "unit": "7",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA bank categorizes its customers into one of three groups based on their banking habits. A random sample of customers from each group was selected, and the number of times each customer visited the bank during the past year was recorded. The following table shows the summary statistics.\n\nThe bank manager will investigate whether there is a significant difference in mean numbers of bank visits for the groups. Multiple two-sample \\(t\\)-tests will be conducted, each at the significance level of \\(\\alpha = 0.05\\).\n\n(a) How many \\(t\\)-tests will need to be conducted for the manager's investigation? List the pairs of groups for each test.\n\nThe significance level (\\(\\alpha\\)) of a single hypothesis test is the probability of making a Type I error. The manager wants to know the probability of making a Type I error for multiple \\(t\\)-tests, not just for a single \\(t\\)-test. This probability is called the family error rate for Type I error, which is also known as the family error rate.\n\n(b) A \\(t\\)-test has two possible outcomes: reject or do not reject the null hypothesis. Suppose the null hypothesis is true. If the null hypothesis is rejected, the result is statistically significant, which would be a Type I error; if the null hypothesis is not rejected, the result is not statistically significant, which would not be a Type I error. Let S represent a statistically significant result, and let N represent a result that is not statistically significant.\n\n(i) If \\(P(S) = 0.05\\), what is the value of \\(P(N)\\)?\n\nThe bank manager knows that the investigation will involve conducting multiple two-sample \\(t\\)-tests. The manager begins the investigation by considering two different \\(t\\)-tests as independent, successive trials. The possible outcomes of the trials, N or S, are shown in the following tree diagram.\n\n(ii) The family error rate is the probability of obtaining a significant result for at least one of the \\(t\\)-tests conducted, under the assumption that the null hypothesis is true. Use the tree diagram to determine the family error rate for two \\(t\\)-tests, each conducted at a level of \\(\\alpha = 0.05\\). Show your work.\n\n(c) Determine the family error rate for the number of \\(t\\)-tests identified in part (a), each conducted at a level of \\(\\alpha = 0.05\\). Show your work.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U7-PC-FRQ-Q02",
      "unit": "7",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": false,
      "chartType": "words-only",
      "types": [],
      "detectionSources": [],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe following stemplot shows the swimming speeds, in kilometers per hour (km/h), for a random sample of 31 emperor penguins.\n\n(a) The mean of the sample is 9.771 km/h, and the standard deviation is 0.944 km/h. Construct and interpret a 95 percent confidence interval for the mean swimming speed of all emperor penguins in the population.\n\n(b) Can the estimate of the mean swimming speed be generalized to all types of penguins? Explain your reasoning.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {},
      "unknownReason": "noKeywordsNoFlags"
    },
    {
      "id": "U8-L3-Q03",
      "unit": "8",
      "lesson": "3",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "bar",
      "types": [],
      "detectionSources": [
        "flag:chartType:bar",
        "keyword:bar chart",
        "keyword:chi-square"
      ],
      "promptSnippet": "A small coffee shop sells freshly squeezed juices in a refrigerated unit with slots where juice is displayed. These slo…",
      "fullPrompt": "A small coffee shop sells freshly squeezed juices in a refrigerated unit with slots where juice is displayed. These slots are called facings. The manager of the coffee shop suspects that the distribution of juice sales is different than the distribution of facings for each type of juice, so the manager records the sales of each juice over a two-week period. The proportion of facings and the sales for each type of juice are shown in the tables.\n\n(a) Construct a single bar chart that contains both the expected proportion of sales based on the proportion of facings and the observed proportion of sales for each type of juice.\n\n(b) Assuming the conditions for inference have been met, does the coffee shop owner have sufficient evidence to conclude that the distribution of sales is proportional to the number of facings at a 5 percent level of significance? Conduct the appropriate statistical test to support your conclusion.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "bar": {}
      },
      "unknownReason": null
    },
    {
      "id": "U8-L3-Q05",
      "unit": "8",
      "lesson": "3",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "multi",
      "types": [
        "bar",
        "scatter"
      ],
      "detectionSources": [
        "flag:chartType:bar",
        "flag:chartType:scatter",
        "keyword:scatterplot",
        "keyword:bar chart",
        "keyword:chi-square"
      ],
      "promptSnippet": "The following scatterplot shows the size, in square feet, and the selling price, in thousands of dollars, for a sample …",
      "fullPrompt": "The following scatterplot shows the size, in square feet, and the selling price, in thousands of dollars, for a sample of 30 houses for sale in a certain area.\n\n(a) Describe the association shown in the scatterplot.\n\n(b) In the region, houses are considered large if they are greater than 2,500 square feet and expensive if the selling price is greater than $300,000. The following two-way table summarizes the houses in the sample.\n\n(i) Use the information in the table to construct a graphical display of the data.\n\n(ii) Assume there is no association between size (large, not large) and price (expensive, not expensive). Use the given totals to complete the following table with the expected number of houses for each classification if there was no association.\n\nFor associations displayed in the scatterplot, the strength of linear association is measured by the correlation coefficient. For the scatterplot of houses, \\(r = 0.82\\).\n\nFor associations that are summarized in two-way tables, the strength of association is measured by the chi-square statistic. The formula for the chi-square statistic is \\(\\chi^2 = \\sum \\frac{(\\text{observed} - \\text{expected})^2}{\\text{expected}}\\), where expected is the count assuming no association and observed is the count shown by the data. Greater values of \\(\\chi^2\\) indicate stronger association. For the table of counts in part (b), \\(\\chi^2 = 10\\).\n\n(c) Suppose the selling price for the most expensive house in the sample is decreased from $489,000 to $325,000.\n\n(i) What effect would the decrease have on the value of \\(r\\)? Explain your reasoning.\n\n(ii) What effect would the decrease have on the value of \\(\\chi^2\\)? Explain your reasoning.\n\n(d) Based on your answer to part (c), explain one benefit and one drawback of using \\(\\chi^2\\) rather than \\(r\\) to measure the strength of an association.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "bar": {},
        "scatter": {}
      },
      "unknownReason": null
    },
    {
      "id": "U8-L6-Q02",
      "unit": "8",
      "lesson": "6",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "chisquare",
      "types": [],
      "detectionSources": [
        "keyword:chi-square"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA large national bank determines if each of its branches is profitable or not profitable. Additionally, the location of each branch is classified as urban, suburban, or rural. A summary of the profitability and location type of a random sample of 175 of the bank's branches is shown in the table.\n\n(a) From the sample of 175 branches summarized above:\n(i) What proportion of branches are profitable?\n(ii) What proportion of branches from an urban location are profitable?\n(iii) What proportion of branches from a rural location are profitable?\n\n(b) Assuming the conditions for inference are met, does the data provide convincing statistical evidence that profitability and location type are independent for the bank at a 5 percent level of significance? Complete the appropriate inference procedure to support your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "chisquare": {}
      },
      "unknownReason": null
    },
    {
      "id": "U8-PC-FRQ-Q01",
      "unit": "8",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "chisquare",
      "types": [],
      "detectionSources": [
        "keyword:chi-square"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nA marketing director for a beverage company conducted a study to investigate people's soda preferences in two regions of the country. The director selected a random sample of 100 people from the east coast and a random sample of 100 people from the west coast to survey. The responses are summarized in the following table.\n\nDo the data provide convincing statistical evidence, at the level of \\(\\alpha = 0.05\\), that the preferences are different between the two regions of the country? Complete the appropriate inference procedure to support your answer.",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "chisquare": {}
      },
      "unknownReason": null
    },
    {
      "id": "U8-PC-FRQ-Q02",
      "unit": "8",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "chisquare",
      "types": [],
      "detectionSources": [
        "keyword:chi-square"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nFingerprint analysis and blood grouping are features that do not change through the lifetime of an individual. Fingerprint features appear early in the development of a fetus, and blood types are determined by genetics. Therefore, each is considered an effective tool for identification of individuals. These characteristics are also of interest in the discipline of biological anthropology—a scientific discipline concerned with the biological and behavioral aspects of human beings.\n\nThe relationship between these characteristics was the subject of a study conducted by biological anthropologists with a simple random sample of male students from a certain region with a large student population. Fingerprint patterns are generally classified as loops, whorls, and arches. The four principal blood types are designated as A, B, AB, and O. The table shows the distribution of fingerprint patterns and blood types for the sample. Expected counts are listed in parentheses. The anthropologists were interested in the possible association between the variables.\n\n(a) Is the test for an association in this case a chi-square test of independence, or a chi-square test of homogeneity? Justify your choice.\n\n(b) Identify the conditions for the chi-square inference procedure selected in part (a), and indicate whether the conditions are met.\n\n(c) The resulting chi-square test statistic from the appropriate test is approximately 18.930. What are the degrees of freedom and p-value of the test?\n\n(d) Biological anthropology is concerned with the comparative study of human origin, evolution and diversity. Considering the sampling design in this study, to what population is it reasonable for the researchers to generalize their results?",
      "subFlags": {
        "scatterNeedsRegression": false,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "chisquare": {}
      },
      "unknownReason": null
    },
    {
      "id": "U9-L3-FRQ-Q01",
      "unit": "9",
      "lesson": "3",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "multi",
      "types": [
        "scatter",
        "boxplot"
      ],
      "detectionSources": [
        "flag:chartType:scatter",
        "flag:chartType:boxplot",
        "keyword:boxplot"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nThe movement patterns of animals are believed to be affected by their physiological states (such as hunger), predation risk, and other factors such as whether they are searching for food for their young. Optimal foraging theory predicts that foragers (animals searching for food) with a central home location should move faster the farther they are from home.\n\nAmerican beavers are foragers with a central home location that make foraging trips from their lodge and then return. To test the optimal foraging theory, researchers trapped and radio-tagged a random sample of 67 American beavers from the population in a certain region and recorded their movements over the course of about a year. The researchers fit a least-squares regression line to the data, where the explanatory variable was distance to lodge, in meters, and the response variable was speed, in meters per hour.\n\n(a) Is a linear model appropriate to use for these data? Justify your response by referencing the residual plot.\n\n(b) Identify the intercept of the least-squares regression line and interpret it in the context of the data.\n\n(c) The researchers plan to calculate a 95 percent confidence interval for the population slope. Identify and check the conditions for the appropriate confidence interval for the population slope.\n\n(d) The 95% confidence interval for the population slope was calculated as \\((0.751, 0.947)\\). Based on the confidence interval, do the data provide convincing statistical evidence that foragers with a central home location move faster the farther they are from home? Justify your response.",
      "subFlags": {
        "scatterNeedsRegression": true,
        "residualPlot": true,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "scatter": {
          "scatterNeedsRegression": true,
          "residualPlot": true
        },
        "boxplot": {}
      },
      "unknownReason": null
    },
    {
      "id": "U9-PC-FRQ-Q01",
      "unit": "9",
      "lesson": "PC",
      "originalType": "free-response",
      "requiresChart": true,
      "chartType": "scatter",
      "types": [],
      "detectionSources": [
        "flag:chartType:scatter",
        "keyword:scatterplot"
      ],
      "promptSnippet": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods…",
      "fullPrompt": "Show all your work. Indicate clearly the methods you use, because you will be scored on the correctness of your methods as well as on the accuracy and completeness of your results and explanations.\n\nAt a plant that manufactures bars of steel, a machine is used to cut the bars to specific lengths. The machine has a dial that sets the length of the bars to be cut. However, the dial is currently out of alignment and the plant manager is collecting data to assess the situation. All measurements are in millimeters.\n\n(a) Use the following grid to construct a scatterplot in which dial setting is the explanatory variable and output length is the response variable. Based on your graph, does a linear model seem appropriate? Justify your answer.\n\n(b) Use the data to construct a least-squares regression line to predict output length from dial setting.\n\n(c) Assume that all conditions for inference are met. Indicate the hypotheses appropriate to test whether there is a linear relationship between output length and dial setting.\n\n(d) The test statistic for the appropriate test is \\(t = 9.018\\). Do the data provide convincing statistical evidence that there is a linear relationship between output length and dial setting?",
      "subFlags": {
        "scatterNeedsRegression": true,
        "residualPlot": false,
        "normalParams": false,
        "boxplotFiveNumber": false,
        "histogramFromTable": false
      },
      "subFlagsByType": {
        "scatter": {
          "scatterNeedsRegression": true
        }
      },
      "unknownReason": null
    }
  ]
}
;
