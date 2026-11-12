# Pakistan, November 2026: where the numbers come from

Every figure in `scenario.json` is one of three kinds:

- **Sourced**: taken from a published figure, linked below.
- **Derived**: worked out from sourced figures; the sum is shown.
- **Authored**: a judgement by the scenario's author, because no single published number exists. These are the first things to challenge and retune.

Figures were looked up on 11 November 2026.

## Economy

| Field | Value | Kind | Basis |
| --- | --- | --- | --- |
| `gdpUsdBn` | 452 | Sourced | GDP of $452 billion (Rs126.9 trillion) in FY2025-26, Pakistan Economic Survey, as reported by [The News](https://www.thenews.pk/print/1420171-economic-survey-fy26-pakistan-misses-key-economic-targets) and [Arab News](https://www.arabnews.pk/node/2646763). |
| `growth` | 3.7 | Sourced | Real GDP growth in FY26, [Dawn](https://www.dawn.com/news/2006877/govt-unveils-pakistan-economic-survey-report-for-outgoing-fiscal-year); confirmed in the [State Bank statement of 26 October 2026](https://www.sbp.org.pk/assets/documents/press-release/PR-26-Oct-2026.pdf). |
| `trendGrowth` | 3.5 | Authored | Close to the long-run average; the State Bank projects 3.5 to 4.5 for FY27. |
| `inflation` | 10.3 | Sourced | Headline CPI, year on year, September 2026, State Bank statement of 26 October 2026. |
| `inflationAnchor` | 6 | Sourced | Middle of the State Bank's 5 to 7 target range, same statement. |
| `unemployment` | 7.1 | Sourced | Labour Force Survey 2024-25, as reported by [The News](https://www.thenews.pk/print/1382960-unemployment-rate-up-from-6-3pc-in-2020-21-to-7-1pc-in-2024-25). |
| `naturalUnemployment` | 7.1 | Authored | Set equal to the current rate, so the start is treated as normal. |
| `baseRate` | 12 | Sourced | Policy rate raised to 12 from 27 October 2026, State Bank statement; [ARY News](https://arynews.tv/state-bank-of-pakistan-raises-policy-rate-to-12). |
| `debt` | 68.5 | Sourced | Public debt as a share of GDP, Economic Survey FY26, Dawn (above). The opposition disputes the figure. |
| `reservesMonths` | 3.0 | Sourced | Reserves of about $21.5 billion, "equal to 3 months of import cover", State Bank statement. |
| `externalBalance` | 0.2 | Authored | Slow reserve building under the IMF programme, against a projected current account deficit of 0 to 1% of GDP. |
| `externalDebtShare` | 0.31 | Derived | External public debt Rs25.7 trillion out of Rs83.3 trillion at end-March 2026 (Dawn). |
| `externalRate` | 3.4 | Derived | External interest of Rs660 billion over nine months, annualised, on Rs25.7 trillion (The News). |
| `debtRate` | 7.9 | Derived | Interest of 5.4% of GDP (Rs6.9 trillion on Rs126.9 trillion) divided by debt of 68.5% of GDP. |
| `revenue` | 15.4 | Derived | Federal gross revenue Rs18.18 trillion (14.3% of GDP), [The News, 14 August 2026](https://www.thenews.pk/print/1431955-fiscal-deficit-drops-to-2-6pc-in-fy26-lowest-in-22-years), plus about 1.1% for provincial own revenue (authored). |
| `spending` (total 12.5) | | Derived | Revenue 15.4 less the primary surplus of 2.9% of GDP (same article). With interest of 5.4 this gives a deficit of 2.5; the reported figure is 2.6. |
| `spending.defence` | 2.0 | Derived | Rs2.587 trillion. |
| `spending.subsidies` | 0.8 | Derived | Rs1.013 trillion. |
| `spending.development` | 2.6 | Derived | Rs3.25 trillion for development and net lending, federal and provincial. |
| `spending.social` | 0.6 | Authored | Roughly the size of the main cash transfer programme. |
| `spending.administration` | 6.5 | Derived | What is left: civil government, pensions and provincial running costs. |

## People and places

| Field | Kind | Basis |
| --- | --- | --- |
| Head of government | Sourced | Shehbaz Sharif is Prime Minister, [Express Tribune](https://tribune.com.pk/story/2639290/pm-shehbaz-briefs-nawaz-sharif-on-k-p-security-economic-challenges). |
| Region populations (millions) | Sourced | 2023 census for Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan and Islamabad; 2017 census for Azad Jammu and Kashmir and Gilgit-Baltistan, which the 2023 count left out. Not re-checked against the census tables for this pack. |
| Approval groups, their approval, floors, ceilings and sensitivities | Authored | No poll divides Pakistan this way. The groups are the blocs that shape its politics; the numbers are starting judgements. |
| Group mix by region | Authored | Guided by the census urban share and where the Pashtun and Baloch populations live. |
| Unrest levels | Authored | Khyber Pakhtunkhwa and Balochistan start as insurgencies; Balochistan starts contested. Sindh, Azad Kashmir and Gilgit-Baltistan start at protest level. |
| Mobilisation and state capacity | Authored | The state is strongest in Islamabad and Punjab and weakest in Balochistan. |

## Known simplifications

- Provinces are the smallest unit. Unrest inside a province (for example the merged districts of Khyber Pakhtunkhwa) is averaged over the whole province.
- The debt ratio falls faster in the model than it has in reality, because exchange-rate losses on foreign debt are not modelled yet.
- The central bank does not react on its own until actors arrive in M1; a rate change is a policy.
