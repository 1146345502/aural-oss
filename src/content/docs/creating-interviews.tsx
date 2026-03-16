import { DocCallout } from "@/components/docs/doc-callout";
import { DocFeature, DocFeatureGrid } from "@/components/docs/doc-feature-grid";
import { DocImage } from "@/components/docs/doc-image";
import { DocStep, DocSteps } from "@/components/docs/doc-steps";
import type { DocArticle } from "./types";
export const creatingInterviewsArticles: DocArticle[] = [
  {
    slug: "creating-an-interview",
    categorySlug: "creating-interviews",
    title: "Creating an Interview",
    description: "Use the AI generator or build manually with title, channels, and questions",
    audience: "creators",
    order: 1,
    content: () => (
      <>
        <h2>AI Generator</h2>
        <p>
          Describe what you want to assess in natural language — the role, skills, duration, and any constraints. The AI generates a complete interview with questions, types, and assessment criteria.
        </p>

        <DocImage src="/images/docs/interview-new-ai.webp" alt="AI Generator tab with goal description, template chips, and configuration" />

        <h3>Writing a Good Prompt</h3>
        <p>Include:</p>
        <ul>
          <li><strong>Role and context</strong> — who is this interview for?</li>
          <li><strong>Skills to assess</strong> — what topics should the questions cover?</li>
          <li><strong>Duration and scope</strong> — how long should it take? How many questions?</li>
          <li><strong>Format preference</strong> — should it include coding tasks, whiteboard, etc.?</li>
        </ul>
        <blockquote>
          Example: &quot;A 20-minute technical interview for a backend engineer, covering API design, database optimization, and error handling. Include one coding question.&quot;
        </blockquote>
        <p>
          After generation, you can refine in natural language — ask for more depth, different question types, or a shift in focus. Each round builds on the previous version.
        </p>

        <hr />

        <h2>Manual Creation</h2>
        <p>
          For full control, switch to the <strong>Manual</strong> tab. Set a title, description, objective, and expected duration, then select channels.
        </p>

        <DocImage src="/images/docs/interview-new-manual.webp" alt="Manual creation tab with title, description, objective, and channel options" />

        <DocFeatureGrid>
          <DocFeature title="Voice">
            Real-time speech-to-speech conversation with the AI interviewer.
          </DocFeature>
          <DocFeature title="Chat">
            Text-based Q&amp;A where the candidate types responses.
          </DocFeature>
          <DocFeature title="Video">
            Camera and screen recording alongside voice interaction.
          </DocFeature>
        </DocFeatureGrid>

        <p>
          After creating the interview, add questions in the editor. You can also import from your question library.
        </p>

        <DocImage src="/images/docs/interview-edit-content.webp" alt="Question editor showing questions with types like Open Ended, Coding, and Multiple Choice" />
      </>
    ),
  },
  {
    slug: "interview-settings",
    categorySlug: "creating-interviews",
    title: "Interview Settings",
    description: "Shareable link, general options, AI tone, follow-up depth, and language",
    audience: "creators",
    order: 2,
    content: () => (
      <>
        <p>
          The Settings tab lets you configure how the interview is accessed, how the AI behaves, and which channels are enabled.
        </p>

        <DocImage src="/images/docs/interview-edit-settings.webp" alt="Settings tab showing Shareable Link, General, and AI Configuration sections" />

        <h2>Shareable Link</h2>
        <p>
          By default, interviews are <strong>invite-only</strong> — only candidates you add on the Sessions tab can access the interview via their unique invite links.
        </p>
        <p>
          To allow open access, click <strong>Create shareable link</strong>. This generates a public URL that anyone can use to start a session. You can copy the link to share it, or revoke it at any time to switch back to invite-only mode.
        </p>

        <hr />

        <h2>General</h2>
        <ul>
          <li><strong>Title</strong> — the interview name shown to candidates and in your dashboard</li>
          <li><strong>Description</strong> — internal notes for your team about the interview&apos;s purpose</li>
          <li><strong>Objective</strong> — what you want to learn from candidates (used by the AI to guide the conversation)</li>
          <li><strong>Duration</strong> — time limit in minutes. Leave empty for no limit.</li>
        </ul>

        <h3>Communication Channels</h3>
        <p>
          Choose how candidates interact with the AI. At least one of Chat or Voice must be enabled.
        </p>
        <DocFeatureGrid>
          <DocFeature title="Chat">
            Text messaging. Candidates type their responses.
          </DocFeature>
          <DocFeature title="Voice">
            Real-time speech conversation. Required if Video is enabled.
          </DocFeature>
          <DocFeature title="Video">
            Camera and screen recording alongside voice. Depends on Voice being enabled.
          </DocFeature>
        </DocFeatureGrid>

        <hr />

        <h2>AI Configuration</h2>
        <ul>
          <li><strong>AI Name</strong> — the name the AI interviewer uses to introduce itself</li>
        </ul>

        <h3>Tone</h3>
        <DocFeatureGrid>
          <DocFeature title="Casual">
            Relaxed and conversational. Good for user research and informal sessions.
          </DocFeature>
          <DocFeature title="Professional">
            Balanced and businesslike. The recommended default for most interviews.
          </DocFeature>
          <DocFeature title="Formal">
            Structured and reserved. For executive-level or compliance interviews.
          </DocFeature>
          <DocFeature title="Friendly">
            Warm and encouraging. Great for practice sessions and onboarding.
          </DocFeature>
        </DocFeatureGrid>

        <h3>Follow-Up Depth</h3>
        <ul>
          <li><strong>Light</strong> — no follow-ups, keeps sessions short and focused</li>
          <li><strong>Moderate</strong> — 1–2 follow-ups per question, a good default</li>
          <li><strong>Deep</strong> — 3–5 follow-ups, for thorough exploration of each topic</li>
        </ul>

        <h3>Language</h3>
        <p>
          The AI conducts the session and evaluates responses in the selected language. Currently supported: <strong>English</strong> and <strong>Chinese (中文)</strong>.
        </p>
      </>
    ),
  },
  {
    slug: "anti-cheating",
    categorySlug: "creating-interviews",
    title: "Anti-Cheating Mode",
    description:
      "Prevent dishonest behavior with tab tracking, paste blocking, and multi-monitor detection",
    audience: "both",
    order: 3,
    content: () => (
      <>
        <p>
          Anti-Cheating Mode adds a layer of integrity monitoring to your
          interviews. When enabled, the system enforces mandatory device
          permissions, tracks tab switches, blocks external paste, and detects
          multi-monitor setups.
        </p>

        <hr />

        <h2>Enabling Anti-Cheating</h2>
        <p>
          Open the <strong>Settings</strong> tab of any interview and scroll to
          the <strong>Anti-Cheating Mode</strong> section. Toggle{" "}
          <strong>Enable Anti-Cheating</strong> on.
        </p>

        <DocImage
          src="/images/docs/anti-cheating-setting.webp"
          alt="Anti-Cheating Mode toggle in interview settings with a description of enforced restrictions"
        />

        <h3>What Gets Enforced</h3>
        <p>
          Once enabled, every session created under this interview will enforce
          the following restrictions:
        </p>
        <ul>
          <li>
            <strong>Mandatory camera, microphone, and screen sharing</strong> —
            candidates cannot skip the device permission step.
          </li>
          <li>
            <strong>Tab-switch and focus-loss tracking</strong> — every time a
            candidate leaves the interview tab, it is recorded and timestamped.
          </li>
          <li>
            <strong>External paste blocking</strong> — pasting content copied
            from outside the interview page is blocked.
          </li>
          <li>
            <strong>Multi-monitor detection</strong> — candidates using more
            than one screen are warned that the setup has been detected.
          </li>
        </ul>

        <DocCallout variant="info">
          Candidates are informed of these restrictions before the session
          begins, so there are no surprises.
        </DocCallout>

        <hr />

        <h2>What Candidates See</h2>
        <p>
          When anti-cheating is active and a candidate leaves the interview tab
          (for example, switching to another application or browser tab), they
          see a <strong>Page departure detected</strong> dialog upon returning.
        </p>

        <DocImage
          src="/images/docs/anti-cheating-violation.webp"
          alt="Page departure dialog showing the number of departures and a warning about reaching the maximum allowed count"
        />

        <DocSteps>
          <DocStep step={1} title="First Departure">
            <p>
              A gentle notice tells the candidate they have left the page. The
              departure count is recorded.
            </p>
          </DocStep>
          <DocStep step={2} title="Repeated Departures">
            <p>
              Each subsequent departure increments the counter. The dialog
              reminds the candidate that all departures are recorded and may be
              reviewed.
            </p>
          </DocStep>
          <DocStep step={3} title="Maximum Reached">
            <p>
              Once the limit is hit, a warning appears: further departures will
              be flagged for review. The candidate can still continue, but the
              session report will highlight these events.
            </p>
          </DocStep>
        </DocSteps>

        <hr />

        <h2>Reviewing Violations</h2>
        <p>
          After the session, all recorded departures and flagged events appear in
          the session report. Reviewers can see how many times the candidate left
          the page and whether the maximum threshold was exceeded, which can be
          factored into the overall evaluation.
        </p>

        <DocImage
          src="/images/docs/integrity-log.webp"
          alt="Integrity Log showing 25 events including page departures and external paste blocked counts"
          bordered={false}
        />

        <DocCallout variant="tip" title="Tip">
          Use anti-cheating mode for high-stakes assessments where integrity is
          critical. For casual practice sessions or user-research interviews, you
          can leave it off to reduce friction for candidates.
        </DocCallout>
      </>
    ),
  },
  {
    slug: "questions-and-library",
    categorySlug: "creating-interviews",
    title: "Questions and Library",
    description: "Question types, reusable library, and search",
    audience: "creators",
    order: 4,
    content: () => (
      <>
        <h2>Question Types</h2>
        <p>
          Each question type presents a different interface to the candidate. Mix types within a single interview to assess a range of skills.
        </p>

        <h3>Open-Ended</h3>
        <p>
          Free-form voice or text responses. Best for behavioral questions, communication assessment, and nuanced topics where there is no single correct answer.
        </p>

        <h3>Single Choice &amp; Multiple Choice</h3>
        <p>
          Present a set of options. Single choice requires the candidate to pick one; multiple choice allows selecting all that apply. In both cases, the AI asks the candidate to explain their reasoning.
        </p>

        <h3>Coding</h3>
        <p>
          A Monaco-based code editor (the same engine behind VS Code) appears in the interview. Candidates select a language from the dropdown, write their solution, and click <strong>Run</strong> to execute it. The AI observes the code in real time and can ask follow-up questions about the approach.
        </p>
        <DocImage src="/images/docs/interview-coding.webp" alt="Coding question — Monaco editor with language selector, Run button, and AI chat panel" />

        <h3>Whiteboard</h3>
        <p>
          An Excalidraw-based drawing canvas for flowcharts, architecture diagrams, and visual explanations. The AI uses vision to observe the whiteboard in real time and asks contextual follow-ups about the candidate&apos;s design.
        </p>
        <DocImage src="/images/docs/interview-whiteboard.webp" alt="Whiteboard question — Excalidraw canvas with drawing tools and AI chat panel" />

        <h3>Research</h3>
        <p>
          Similar to open-ended, but the AI probes much more deeply — asking &quot;why&quot;, &quot;how&quot;, and &quot;tell me more&quot; to surface detailed insights. Designed for user research interviews. Sessions with research questions generate structured <strong>Research Findings</strong> (topics and data points) in addition to the standard evaluation.
        </p>
        <DocImage src="/images/docs/research-findings.webp" alt="Research Findings section in the session report — extracted topics and data points" />

        <DocCallout variant="info">
          For coding and whiteboard questions, the AI observes the candidate&apos;s work in real time and asks contextual follow-ups about their approach.
        </DocCallout>

        <hr />

        <h2>Question Library</h2>
        <p>
          The Question Library is a central repository of reusable questions. Save a question once and add it to any interview — no need to recreate it each time.
        </p>

        <DocImage src="/images/docs/question-library.webp" alt="Questions page with search, type filter, and question list" />

        <h3>Saving and Reusing</h3>
        <p>
          When editing an interview, save any question to the library. While building a new interview, search the library by title, description, or type and add questions with one click. The same question can appear in multiple interviews.
        </p>

        <DocCallout variant="tip" title="Tip">
          Editing a library question lets you choose: update all interviews that use it, or create an independent copy for just this interview.
        </DocCallout>
      </>
    ),
  },
];
