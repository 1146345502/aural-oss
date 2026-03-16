import type { DocArticle } from "./types";
import { DocCallout } from "@/components/docs/doc-callout";
import { DocImage } from "@/components/docs/doc-image";

export const resultsAnalyticsArticles: DocArticle[] = [
  {
    slug: "results-analysis-and-export",
    categorySlug: "results-analytics",
    title: "Results, Analysis, and Export",
    description: "Session list, AI analysis, research findings, and downloading data",
    audience: "creators",
    order: 1,
    content: () => (
      <>
        <h2>Results Overview</h2>
        <p>
          The Results page shows all sessions for an interview with status badges, scores, message counts, and duration. Filter by status or date range and search by participant name.
        </p>

        <DocImage src="/images/docs/interview-results.webp" alt="Results page showing completed sessions with scores and status badges" />

        <h3>Session Report</h3>
        <p>
          Click any session row to open the full report. It includes the candidate&apos;s info, average score, a summary, and detailed per-question evaluation.
        </p>

        <DocImage src="/images/docs/session-report.webp" alt="Session report header with candidate info, completion status, average score, and AI summary" />

        <hr />

        <h2>AI Analysis</h2>
        <p>
          After a candidate completes a session, Aural automatically produces:
        </p>
        <ul>
          <li><strong>Session summary</strong> — a concise overview of performance, communication style, and key themes</li>
          <li><strong>Per-question evaluation</strong> — each answer assessed for quality, relevance, and depth with a score out of 10</li>
          <li><strong>Key highlights</strong> — the strongest parts of the candidate&apos;s responses</li>
          <li><strong>Areas for improvement</strong> — gaps or weaknesses that may need follow-up</li>
        </ul>

        <DocImage src="/images/docs/question-evaluation.webp" alt="Question-by-question evaluation with scores, strengths, and areas for improvement" />

        <h3>Assessment Scores</h3>
        <p>
          Beyond individual question scores, the AI generates assessment scores across multiple dimensions such as domain expertise, communication clarity, and strategic thinking. Each dimension includes a score and a detailed explanation.
        </p>

        <DocImage src="/images/docs/assessment-scores.webp" alt="Assessment scores showing domain expertise, trend awareness, strategic thinking, and communication ratings" />

        <DocCallout variant="tip" title="Tip">
          Use the session summary to quickly triage candidates before diving into the full transcript.
        </DocCallout>

        <h3>Research Findings</h3>
        <p>
          For interviews with research-type questions, Aural also extracts structured findings: <strong>topics</strong> (themes, pain points, preferences) and <strong>data points</strong> (specific facts, numbers, or statements). Topics help you spot patterns across sessions; data points give you quotable evidence for reports.
        </p>

        <DocImage src="/images/docs/research-findings.webp" alt="Research Findings showing extracted key topics and detailed data points from a research interview" />

        <DocCallout variant="info">
          Research findings are only generated for sessions that include research-type questions. Standard open-ended questions produce evaluations and scores instead.
        </DocCallout>

        <h3>Tone &amp; Communication</h3>
        <p>
          Aural analyzes the candidate&apos;s communication style across every response — detecting confidence level, tone consistency, and clarity. Each question is rated for tone (e.g., Confident, Neutral) and impact (High, Low), giving you a quick read on how the candidate communicates under interview conditions.
        </p>

        <DocImage src="/images/docs/tone-communication.webp" alt="Tone and Communication analysis with per-question confidence and impact ratings" />

        <hr />

        <h2>Exporting</h2>
        <p>
          Export session results in <strong>XLSX</strong> (for analysis in Excel or Google Sheets) or <strong>PDF</strong> (for formatted reports). The Export button is available on both the Results page and individual reports.
        </p>
        <p>Exports include:</p>
        <ul>
          <li>Session metadata (candidate, interview, date)</li>
          <li>Full transcript with timestamps</li>
          <li>Question-level evaluation and scores</li>
          <li>AI summary and key highlights</li>
          <li>Research findings (when available)</li>
        </ul>
      </>
    ),
  },
];
