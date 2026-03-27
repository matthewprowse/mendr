# BCIS Honours Research Paper — Scandio AI Diagnosis Engine

## Working Title

**"Improving Multi-Modal AI Fault Diagnosis Accuracy Through Systematic Prompt Engineering: A Design Science Approach to Residential Home Maintenance Systems"**

---

## What This Paper Does

Uses the Scandio production system as the research context to empirically evaluate whether structured prompt engineering strategies (few-shot, chain-of-thought) produce measurably more accurate home fault diagnoses than the current zero-shot approach. The research builds an original evaluation dataset, measures multiple prompting strategies against it, and deploys the best-performing prompt into the live application.

---

## Why This Works Academically

- **Novel domain** — no published research exists on AI-assisted residential fault diagnosis in a South African context
- **Original dataset** — labelled image collection is a primary data contribution, not secondary analysis
- **Live production system** — the artefact is deployed and demonstrably functional, not a prototype
- **DSR methodology** — Design Science Research is the canonical IS methodology for building and evaluating artefacts; examiners expect it for this type of project
- **Quantitative + qualitative** — statistical evaluation metrics plus brief expert interviews gives triangulation

---

## Research Questions

**Primary RQ:**
To what extent does prompt engineering strategy affect the trade classification accuracy of a multi-modal AI home fault diagnosis system?

**Secondary RQs:**
1. How accurately does the model's self-reported confidence score predict diagnostic correctness?
2. Does chain-of-thought reasoning reduce missed hazard detections compared to zero-shot prompting?
3. What prompt architecture produces the most reliable diagnosis output for deployment in a residential maintenance platform serving the South African market?

---

## Methodology: Design Science Research (DSR)

Following Hevner et al. (2004) and Peffers et al. (2007).

| Phase | Activity | Output |
|-------|----------|--------|
| 1. Problem identification | Analyse current diagnosis failures, gap in literature | Problem statement, research gap |
| 2. Objectives | Define accuracy targets, calibration benchmarks | Measurable success criteria |
| 3. Design | Dataset design, prompt variant design | Dataset schema, 5 prompt variants |
| 4. Development | Dataset collection + labelling, prompt implementation | Benchmark dataset, evaluation harness |
| 5. Evaluation | Run all variants, compute metrics | Results tables, statistical tests |
| 6. Communication | Paper + production deployment | Thesis, improved live prompt |

---

## The Artefact

Two outputs, both required for DSR:

### Artefact 1 — The Evaluation Dataset

The first labelled home fault image dataset for the South African residential context.

**Target size:** 150–200 images

**Sources:**
- Anonymised images from existing Scandio conversations (Supabase storage — ethics clearance required)
- Openly licensed images from iFixit, property maintenance forums, South African building inspection resources
- Supplemented with researcher-captured images of common South African faults (damp, geyser failures, DB board issues, boundary wall cracks)

**Labels per image (applied by domain experts):**
- Ground-truth trade (e.g. Plumbing, Electrical, Waterproofing)
- Ground-truth trade detail (e.g. Geyser Replacement, Rising Damp, DB Board Fault)
- Hazard flag: yes/no
- Cost range band: low (< R2,000) / medium (R2,000–R10,000) / high (> R10,000)
- Fault ambiguity rating: clear / ambiguous / unclear

**Labelling process:**
- Recruit 3 licensed contractors from the Scandio network as domain experts
- Each image labelled independently by 2 experts
- Inter-rater agreement calculated (Cohen's Kappa)
- Disagreements resolved by a third expert

### Artefact 2 — The Improved Production Prompt

The best-performing prompt strategy from the evaluation, deployed into `src/app/api/diagnose/route.ts` to replace the current zero-shot implementation.

---

## Prompt Variants to Test

All variants tested against the same evaluation dataset. Only the prompt changes — the model (Gemini 2.5-flash), image input, and output schema remain constant.

| ID | Strategy | Description |
|----|----------|-------------|
| P1 | **Baseline (current)** | Single zero-shot prompt with structured JSON output specification |
| P2 | **Few-shot (3 examples)** | 3 worked image+diagnosis examples prepended to the prompt |
| P3 | **Few-shot (5 examples)** | 5 worked image+diagnosis examples prepended to the prompt |
| P4 | **Chain-of-thought (CoT)** | Model instructed to reason step-by-step before emitting JSON |
| P5 | **Few-shot + CoT** | Combined: 5 examples + step-by-step reasoning before JSON output |

**P5 is the expected winner** based on the broader literature. If it is, the paper validates the strategy empirically in this domain and context.

**Few-shot example structure (for P2/P3/P5):**
Each example consists of an image + its correct diagnosis in the target JSON schema. Examples selected to cover the 5 most common South African residential fault categories: plumbing, electrical, waterproofing, structural, and gate/access. Examples are embedded directly in the prompt as base64-encoded inline image data.

**Chain-of-thought instruction (for P4/P5):**
Before emitting the JSON, the model is instructed to:
1. Describe what is visually observable in the image
2. Identify the primary symptom
3. Determine the most likely underlying cause
4. Classify the trade required
5. Assess whether the fault poses a safety hazard
6. Then emit the structured JSON

---

## Evaluation Metrics

| Metric | Formula / Method | Why It Matters |
|--------|-----------------|----------------|
| **Trade classification accuracy** | Correct trade in top-1 result ÷ total images | Primary accuracy measure |
| **Trade detail accuracy** | Correct subcategory ÷ total images | More specific accuracy |
| **Top-2 accuracy** | Correct trade in top 2 results ÷ total images | Partial credit measure |
| **Hazard recall** | True hazard flags ÷ total hazardous images | False negatives here are safety-critical |
| **Confidence calibration (ECE)** | Expected Calibration Error — binned confidence vs. actual accuracy | Is the stated confidence score meaningful? |
| **Cost range accuracy** | Predicted cost band matches expert band ÷ total images | Practical utility measure |
| **Inference latency** | Mean time per diagnosis across 50 runs | Operational constraint |

**Statistical tests:**
- McNemar's test for paired accuracy comparisons between prompt variants
- Reliability diagram (calibration curve) for confidence analysis
- Cohen's Kappa for inter-rater agreement on the dataset

---

## Confidence Calibration Analysis

The current system returns a `confidence` score (0–100) with every diagnosis. This has never been validated. A provider confidence calibration analysis asks: when the model says it is 80% confident, is it actually correct 80% of the time?

**Method:**
1. Run all 150–200 dataset images through the baseline prompt
2. Group predictions into confidence buckets (0–10%, 10–20%, ..., 90–100%)
3. Within each bucket, calculate the actual accuracy
4. Plot a reliability diagram
5. Calculate the Expected Calibration Error (ECE)

**Expected finding:** Modern LLMs are typically overconfident — stated confidence will likely exceed actual accuracy, especially for ambiguous images. This finding is publishable on its own and directly useful for the production system.

**Applied outcome:** A post-processing correction function that maps raw Gemini confidence scores to calibrated probabilities, applied in `route.ts` before the response is returned.

---

## Production Impact

When the paper is complete, the following changes are made to the live system:

1. **Swap the diagnosis prompt** in `src/app/api/diagnose/route.ts` to the empirically validated best-performing strategy (expected: P5 — few-shot + chain-of-thought)
2. **Add confidence calibration** — apply the correction function so the displayed confidence score reflects actual validated accuracy
3. **Update the few-shot examples** periodically as the dataset grows (the examples embedded in the prompt should represent the most diagnostic, diverse fault types)

This means the paper directly produces a better model for the live app. The evaluation is the R&D process.

---

## Qualitative Component (Triangulation)

To avoid a purely quantitative study and add the IS perspective required for a BCIS paper:

**5 semi-structured interviews with licensed contractors** (recruited from the Scandio provider network):
- Show them 10 AI-generated diagnoses (5 from current prompt, 5 from best-performing variant)
- Ask: Is this diagnosis accurate? Would you arrive at a job better informed having read this? What is missing?
- Thematic analysis of responses

This adds practitioner validation to the quantitative accuracy metrics and directly addresses the IS question of whether the system creates value for real users, not just scores well on a benchmark.

---

## Literature to Read and Cite

### Foundational IS/DSR
- **Hevner, A.R., March, S.T., Park, J. & Ram, S. (2004)** — Design science in information systems research. *MIS Quarterly*, 28(1), 75–105. *(The canonical DSR paper — cite in every methodology discussion)*
- **Peffers, K., Tuunanen, T., Rothenberger, M.A. & Chatterjee, S. (2007)** — A design science research methodology for information systems research. *Journal of Management Information Systems*, 24(3), 45–77.
- **Gregor, S. & Hevner, A.R. (2013)** — Positioning and presenting design science research for maximum impact. *MIS Quarterly*, 37(2), 337–355.

### Prompt Engineering
- **Brown, T.B. et al. (2020)** — Language models are few-shot learners. *NeurIPS 2020*. *(The GPT-3 paper — foundational for few-shot)*
- **Wei, J. et al. (2022)** — Chain-of-thought prompting elicits reasoning in large language models. *NeurIPS 2022*.
- **Kojima, T. et al. (2022)** — Large language models are zero-shot reasoners. *NeurIPS 2022*. *("Let's think step by step" paper)*
- **Liu, P. et al. (2023)** — Pre-train, prompt, and predict: A systematic survey of prompting methods in NLP. *ACM Computing Surveys*, 55(9).
- **Sahoo, P. et al. (2024)** — A systematic survey of prompt engineering in large language models. *arXiv:2402.07927*.

### Multi-Modal LLMs
- **Google (2023/2024)** — Gemini: A family of highly capable multimodal models. *(Technical report — cite the version you are evaluating)*
- **OpenAI (2023)** — GPT-4 technical report. *(Background on multi-modal capabilities)*
- **Antol, S. et al. (2015)** — VQA: Visual question answering. *ICCV 2015*. *(Background on visual QA benchmarks)*

### Calibration and Evaluation
- **Guo, C. et al. (2017)** — On calibration of modern neural networks. *ICML 2017*. *(The ECE paper)*
- **Naeini, M.P. et al. (2015)** — Obtaining well-calibrated probabilities using Bayesian binning. *AAAI 2015*.

### South African / Local Context
- Statistics South Africa — General Household Survey data on home ownership and maintenance expenditure
- South African Property Owners Association (SAPOA) reports
- Any IS research on digital platforms in the South African informal/formal services economy

---

## Timeline

| Month | Milestone |
|-------|-----------|
| **April** | Ethics clearance application, literature review draft, dataset schema finalised |
| **May** | Dataset collection: image sourcing, expert recruitment, labelling commences |
| **June** | Dataset complete (150+ images labelled), inter-rater Kappa calculated, baseline evaluation run (P1) |
| **July** | All 5 prompt variants evaluated, calibration analysis complete, contractor interviews conducted |
| **August** | Results chapter written, statistical tests run, reliability diagrams produced |
| **September** | Discussion and conclusions written, best prompt deployed to production |
| **October** | Full draft to supervisor, revisions |
| **November** | Final submission |

---

## What Makes This a Distinction

| Factor | How This Paper Delivers It |
|--------|---------------------------|
| Original data contribution | First labelled home fault dataset for the South African residential context |
| Rigorous methodology | DSR executed explicitly across all 6 phases; every design decision justified |
| Quantitative rigour | 5 metrics, McNemar's test, ECE calibration analysis |
| Qualitative triangulation | Contractor interviews provide practitioner validation |
| Live deployment | Improved prompt deployed in a real production system by submission — not a prototype |
| Practical impact | The paper's output directly makes the app better |
| Honest limitations | Dataset size, single model, single geography — stated clearly and defensibly |
| Novel context | No prior work on this exact problem exists; literature gap is real and demonstrable |

---

## Ethics Considerations

- **Existing conversation data:** Any Scandio conversation images used require ethics clearance. Images must be anonymised — no identifiable personal information (faces, addresses visible in photos). Informed consent or anonymisation protocol required.
- **Expert labellers:** Informed consent forms, acknowledgement that their time is voluntary.
- **Contractor interviews:** Informed consent, right to withdraw, anonymised in write-up.
- **Data storage:** Dataset stored securely, not publicly released without ethics board approval.

Apply for ethics clearance at the earliest opportunity — it is the longest lead-time item in the project.

---

## Key File in the Codebase

The prompt being evaluated and ultimately improved lives at:

```
src/app/api/diagnose/route.ts
```

The structured diagnosis output format (the schema the prompt must conform to) is defined inline in that file. The evaluation harness you build for the paper will call this route (or a test version of it) directly, so the evaluation infrastructure integrates naturally with the existing system.

The enrichment prompts (image classification, provider summaries) are secondary candidates for improvement but should be scoped out of this paper to keep it focused. A follow-on paper or chapter extension could address those.
