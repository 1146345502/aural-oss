import { DocCallout } from "@/components/docs/doc-callout";
import { DocFeature, DocFeatureGrid } from "@/components/docs/doc-feature-grid";
import { DocImage } from "@/components/docs/doc-image";
import { DocLink } from "@/components/docs/doc-link";
import { DocStep, DocSteps } from "@/components/docs/doc-steps";
import type { DocArticle } from "./types";

export const practicesArticles: DocArticle[] = [
  {
    slug: "practices-overview",
    categorySlug: "practices",
    title: "Practices Overview",
    titleZh: "练习概览",
    description:
      "Learn how Aural Practices turns an existing interview into a repeatable coaching workspace with voice practice, AI feedback, suggested answers, and score tracking.",
    descriptionZh:
      "了解 Aural 练习如何把已有面试变成可重复的 AI 教练空间",
    audience: "creators",
    order: 1,
    content: () => (
      <>
        <h2>What Practices Does</h2>
        <p>
          Practices lets you rehearse against the questions in an existing
          interview without creating real candidate sessions. Each run opens a
          focused coaching experience where the AI asks the interview questions,
          listens to your answer, scores the attempt, and gives specific
          feedback before you move on.
        </p>

        <DocImage
          src="/images/docs/practices-session.webp"
          alt="Practice session with AI coaching feedback, score, and suggested answer panel"
        />

        <DocFeatureGrid>
          <DocFeature title="Interview-native practice">
            Practice uses the same interview questions your team already wrote,
            so rehearsals stay aligned with the actual role, rubric, and
            question order.
          </DocFeature>
          <DocFeature title="Voice-first coaching">
            Focused practice starts in voice mode, records the answer, builds a
            transcript, and evaluates both answer quality and delivery signals.
          </DocFeature>
          <DocFeature title="Feedback after every answer">
            Each submitted answer produces a score, verdict, strengths,
            improvements, missing signals, and next-step coaching.
          </DocFeature>
          <DocFeature title="Suggested answer support">
            The side panel can generate a role-aware sample answer when practice
            context is available.
          </DocFeature>
        </DocFeatureGrid>

        <h2>Where to Find Practices</h2>
        <ul>
          <li>
            <strong>Global Practices page</strong> - open{" "}
            <DocLink href="/practices">/practices</DocLink> to review practice
            runs across the interviews in your current project.
          </li>
          <li>
            <strong>Interview prep tab</strong> - open an interview, then go to
            the <strong>Practices</strong> tab to manage context and review runs
            for that specific interview.
          </li>
          <li>
            <strong>Focused practice mode</strong> - click{" "}
            <strong>Practice interview</strong> to open a dedicated practice
            session in a new tab.
          </li>
        </ul>

        <DocCallout variant="info" title="Practice is not a candidate session">
          Practice sessions are saved separately from real interview sessions.
          They do not consume session time, appear in candidate results, or
          replace completed candidate interviews.
        </DocCallout>

        <h2>What Gets Saved</h2>
        <p>
          Aural saves practice sessions and answer attempts so you can measure
          progress over time. Saved data includes the interview, practice mode,
          status, start and completion timestamps, total duration, submitted
          answers, per-answer feedback, attempt count, average score, and best
          score.
        </p>
      </>
    ),
  },
  {
    slug: "setting-up-practice-context",
    categorySlug: "practices",
    title: "Setting Up Practice Context",
    titleZh: "设置练习上下文",
    description:
      "Add role, company, job description, and resume context so Aural can tailor practice feedback and suggested answers to the interview goal.",
    descriptionZh: "添加职位、公司、JD 和简历信息，让 AI 教练反馈更贴合目标",
    audience: "creators",
    order: 2,
    content: () => (
      <>
        <h2>Why Context Matters</h2>
        <p>
          Practice context gives the AI coach the background it needs to judge
          whether an answer proves the right signals. Without context, Aural can
          still score clarity and structure. With context, it can also tell you
          where to use resume evidence, which role expectations are missing, and
          how to make an answer sound more specific to the opportunity.
        </p>

        <DocImage
          src="/images/docs/practices-context.webp"
          alt="Practice context setup with company, role title, job description, and resume notes"
        />

        <DocSteps>
          <DocStep step={1} title="Open the interview Practices tab">
            <p>
              From an interview editor, choose <strong>Practices</strong>. This
              tab shows previous runs and includes the context control.
            </p>
          </DocStep>
          <DocStep step={2} title="Click Context">
            <p>
              Open the context drawer and add the company name, role title, job
              description, resume notes, or any role-specific background the AI
              coach should consider.
            </p>
          </DocStep>
          <DocStep step={3} title="Save before generating examples">
            <p>
              Suggested answers are most useful after context is saved because
              the answer can reference the target role and the candidate&apos;s
              strongest evidence.
            </p>
          </DocStep>
        </DocSteps>

        <h2>Best Inputs</h2>
        <ul>
          <li>
            <strong>Job description</strong> - responsibilities, required
            skills, seniority, and success criteria.
          </li>
          <li>
            <strong>Resume notes</strong> - achievements, projects, metrics,
            tools, and leadership examples that should be reused in answers.
          </li>
          <li>
            <strong>Company and role title</strong> - enough context for the AI
            to calibrate tone, specificity, and business impact.
          </li>
        </ul>

        <DocCallout variant="tip" title="Keep context concise">
          Paste the strongest role and resume details instead of a long archive.
          Better context usually means fewer but clearer signals: scope, metrics,
          constraints, tools, and impact.
        </DocCallout>
      </>
    ),
  },
  {
    slug: "running-a-practice-session",
    categorySlug: "practices",
    title: "Running a Practice Session",
    titleZh: "进行练习会话",
    description:
      "Start a focused voice practice session, answer questions, receive AI coaching, retry weak answers, and use suggested answers responsibly.",
    descriptionZh: "开始语音练习、作答、获取反馈、重试薄弱回答并使用建议答案",
    audience: "creators",
    order: 3,
    content: () => (
      <>
        <h2>Start Practice</h2>
        <p>
          Open an interview&apos;s <strong>Practices</strong> tab and click{" "}
          <strong>Practice interview</strong>. Aural opens focused practice mode
          at <code>/practice/[interviewId]</code> and starts a new practice
          session for the signed-in user.
        </p>

        <DocImage
          src="/images/docs/practices-session.webp"
          alt="Focused practice mode with voice answer composer, AI feedback, and suggested answer panel"
        />

        <DocSteps>
          <DocStep step={1} title="Listen to the question">
            <p>
              The AI coach reads the current question in voice mode and keeps
              the active question pinned at the top of the session.
            </p>
          </DocStep>
          <DocStep step={2} title="Answer by voice">
            <p>
              Record your response. The transcript appears in the composer, so
              you can review it before submitting.
            </p>
          </DocStep>
          <DocStep step={3} title="Submit for feedback">
            <p>
              Aural grades the answer, streams coaching feedback, saves the
              attempt, and updates your best score for the current question.
            </p>
          </DocStep>
          <DocStep step={4} title="Retry or continue">
            <p>
              Use the feedback to revise the answer, practice the same question
              again, or move to the next question with the composer navigation.
            </p>
          </DocStep>
        </DocSteps>

        <h2>Understanding Feedback</h2>
        <p>Practice feedback is designed to be actionable rather than generic.</p>
        <ul>
          <li>
            <strong>Score</strong> - a 0-10 quality signal for the attempt.
          </li>
          <li>
            <strong>Verdict and summary</strong> - the main coaching readout.
          </li>
          <li>
            <strong>Strengths</strong> - what already works and should be kept.
          </li>
          <li>
            <strong>Improvements and missing signals</strong> - what to add on
            the next try.
          </li>
          <li>
            <strong>Voice delivery</strong> - pace, clarity, confidence, and
            delivery tips when audio is available.
          </li>
        </ul>

        <h2>Using Suggested Answers</h2>
        <p>
          The suggested answer panel can generate a structured answer based on
          the question, question type, job description, and resume context. Use
          it as a study aid, not a script. The goal is to learn the structure and
          evidence pattern, then answer in your own words.
        </p>

        <DocCallout variant="info" title="Self-hosting note">
          Practice grading and suggested answers use your configured LLM
          provider. Voice practice also uses your configured relay and TTS
          provider. The OSS build stores practice sessions separately from real
          candidate sessions and does not include commercial usage controls.
        </DocCallout>
      </>
    ),
  },
  {
    slug: "reviewing-practice-progress",
    categorySlug: "practices",
    title: "Reviewing Practice Progress",
    titleZh: "查看练习进展",
    description:
      "Use the Practices dashboard to review scores, attempts, durations, statuses, filters, exports, repeated runs, and cleanup actions.",
    descriptionZh: "使用练习仪表板查看分数、次数、时长、状态、筛选、导出和清理操作",
    audience: "creators",
    order: 4,
    content: () => (
      <>
        <h2>Practices Dashboard</h2>
        <p>
          The Practices dashboard gives you a project-level view of saved
          practice runs. It is useful for checking whether a learner is improving
          over repeated attempts and for cleaning up old practice data.
        </p>

        <DocImage
          src="/images/docs/practices-dashboard.webp"
          alt="Practices dashboard with metrics, filters, scores, attempts, modes, and export action"
        />

        <h3>Metrics</h3>
        <ul>
          <li>
            <strong>Total practices</strong> - how many practice sessions match
            the current scope.
          </li>
          <li>
            <strong>Completed</strong> - sessions that were finished and saved.
          </li>
          <li>
            <strong>Average score</strong> - mean score across scored practice
            sessions.
          </li>
          <li>
            <strong>Average duration</strong> - typical time spent practicing.
          </li>
        </ul>

        <h3>Table Columns</h3>
        <p>
          Each row shows the interview title, session status, average score,
          submitted attempts, mode, duration, start time, completion time, and a
          quick action to practice the interview again.
        </p>

        <h2>Filtering and Exporting</h2>
        <DocFeatureGrid>
          <DocFeature title="Search">
            Find sessions by interview title or status.
          </DocFeature>
          <DocFeature title="Time range">
            Filter by recent activity such as the past day, week, month, or
            quarter.
          </DocFeature>
          <DocFeature title="Status">
            Narrow the list to completed, in-progress, or abandoned runs.
          </DocFeature>
          <DocFeature title="XLSX export">
            Download filtered practice rows with scores, attempts, duration, and
            timestamps.
          </DocFeature>
        </DocFeatureGrid>

        <h2>Deleting Practice Sessions</h2>
        <p>
          Select one or more rows, then click <strong>Delete</strong>. This
          permanently removes the selected practice sessions and their saved
          attempts. Real interview sessions and candidate results are not
          affected.
        </p>

        <DocCallout variant="tip" title="Review by interview first">
          For the cleanest coaching loop, start on an individual interview&apos;s
          Practices tab. Use the global Practices page when you want to compare
          activity across the whole project.
        </DocCallout>
      </>
    ),
  },
];
