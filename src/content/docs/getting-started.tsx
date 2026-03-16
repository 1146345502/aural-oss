import { DocCallout } from "@/components/docs/doc-callout";
import { DocFeature, DocFeatureGrid } from "@/components/docs/doc-feature-grid";
import { DocImage } from "@/components/docs/doc-image";
import { DocLink } from "@/components/docs/doc-link";
import { DocStep, DocSteps } from "@/components/docs/doc-steps";
import type { DocArticle } from "./types";

export const gettingStartedArticles: DocArticle[] = [
  {
    slug: "what-is-aural",
    categorySlug: "getting-started",
    title: "What is Aural?",
    description: "AI-powered interview platform for hiring, research, and practice",
    audience: "both",
    order: 1,
    content: () => (
      <>
        <h2>Product Overview</h2>
        <p>
          Aural is an AI-powered interview platform that conducts structured interviews autonomously. You design an interview, share a link, and Aural&apos;s AI handles the conversation — asking questions, probing with follow-ups, and generating detailed analysis when the session is complete.
        </p>

        <h3>Key Features</h3>
        <DocFeatureGrid>
          <DocFeature title="AI Interviewer">
            An AI agent conducts the interview in real time — asking questions, listening to responses, and following up intelligently based on what the candidate says.
          </DocFeature>
          <DocFeature title="Multiple Channels">
            Run interviews via voice (speech-to-speech), text chat, or video. Candidates can even switch between voice and chat mid-session.
          </DocFeature>
          <DocFeature title="Rich Question Types">
            Go beyond open-ended questions with single/multiple choice, live coding (Monaco editor), whiteboard drawing (Excalidraw), and research-depth probing.
          </DocFeature>
          <DocFeature title="Automated Analysis">
            Every completed session produces AI-generated summaries, per-question scores, key highlights, and areas for improvement — no manual review required.
          </DocFeature>
          <DocFeature title="AI Interview Generator">
            Describe your goals in plain language and the AI generates a full interview with questions, assessment criteria, and recommended settings.
          </DocFeature>
          <DocFeature title="Team Collaboration">
            Share interviews and results across your organization. Multiple team members can create interviews, review sessions, and export reports.
          </DocFeature>
        </DocFeatureGrid>

        <h3>Common Use Cases</h3>
        <ul>
          <li><strong>Technical hiring</strong> — coding and system design interviews with built-in editor and whiteboard</li>
          <li><strong>User research</strong> — in-depth research interviews with AI-powered follow-ups that surface deeper insights</li>
          <li><strong>Behavioral interviews</strong> — voice-based conversations that feel natural and scale to hundreds of candidates</li>
          <li><strong>Interview practice</strong> — candidates can practice with AI feedback before their real interview</li>
        </ul>

        <h3>How It Works</h3>
        <ol>
          <li><strong>Design</strong> — Create an interview using the AI generator or build one manually</li>
          <li><strong>Share</strong> — Send a link to candidates or post it publicly</li>
          <li><strong>Interview</strong> — The AI conducts the session autonomously</li>
          <li><strong>Review</strong> — Read AI-generated analysis, scores, and transcripts</li>
        </ol>
      </>
    ),
  },
  {
    slug: "account-and-dashboard",
    categorySlug: "getting-started",
    title: "Account and Dashboard",
    description: "Sign up, set up your organization, and navigate the dashboard",
    audience: "both",
    order: 2,
    content: () => (
      <>
        <h2>Sign Up</h2>
        <p>
          Go to <DocLink href="/register">/register</DocLink> and enter your name, email, and password.
        </p>

        <DocImage src="/images/docs/register.webp" alt="Registration page with name, email, and password fields" />

        <DocSteps>
          <DocStep step={1} title="Create or Join an Organization">
            <p>Organizations group your projects and team members. Create one or join an existing one via invite link.</p>
          </DocStep>
          <DocStep step={2} title="Create Your First Project">
            <p>Projects contain your interviews, sessions, and question library.</p>
          </DocStep>
        </DocSteps>

        <hr />

        <h2>Dashboard</h2>
        <p>
          The dashboard is your home screen — it shows activity metrics, recent sessions, and quick actions.
        </p>

        <DocImage src="/images/docs/dashboard.webp" alt="Dashboard with sidebar navigation, stats cards, and activity charts" />

        <h3>Sidebar Navigation</h3>
        <ul>
          <li><strong>Dashboard</strong> — Activity overview, recent sessions, and quick actions</li>
          <li><strong>Interviews</strong> — Create and manage interview templates</li>
          <li><strong>Sessions</strong> — View and track individual interview sessions</li>
          <li><strong>Questions</strong> — Browse and reuse your question library</li>
        </ul>

        <h3>Organization Pages</h3>
        <p>
          Organization-level pages are accessible from the sidebar:
        </p>
        <ul>
          <li><strong>Usage</strong> — Monitor AI tokens, session hours, and template usage</li>
          <li><strong>Usage</strong> — Monitor your resource consumption</li>
        </ul>

        <h3>Switching Projects</h3>
        <p>
          Use the project selector at the top of the sidebar to switch between projects. Each project has its own interviews, sessions, and settings.
        </p>
      </>
    ),
  },
  {
    slug: "quick-start-first-ai-interview",
    categorySlug: "getting-started",
    title: "Quick Start: Your First AI Interview",
    description: "End-to-end walkthrough from goals to sharing the interview link",
    audience: "creators",
    order: 3,
    content: () => (
      <>
        <h2>Create Your First Interview</h2>
        <p>
          This walkthrough takes you from zero to a shareable AI interview in a few minutes.
        </p>

        <DocSteps>
          <DocStep step={1} title='Click "New Interview"'>
            <p>From the <strong>Interviews</strong> page, click the <strong>+ New Interview</strong> button in the top right.</p>
            <DocImage src="/images/docs/interviews-list.webp" alt="Interviews page with the New Interview button highlighted" />
          </DocStep>

          <DocStep step={2} title="Describe Your Goals">
            <p>
              On the <strong>AI Generator</strong> tab, describe what you want to assess. For example: &quot;A 30-minute technical interview for a frontend developer, covering React, TypeScript, and system design.&quot;
            </p>
            <DocImage src="/images/docs/interview-new-ai.webp" alt="AI Generator tab with goal description and configuration options" />
          </DocStep>

          <DocStep step={3} title="Review and Edit Questions">
            <p>The AI generates questions tailored to your description. Review, edit, reorder, or add more on the <strong>Content</strong> tab.</p>
            <DocImage src="/images/docs/interview-edit-content.webp" alt="Question editor with generated questions and type labels" />
          </DocStep>

          <DocStep step={4} title="Configure Settings">
            <p>On the <strong>Settings</strong> tab, set the AI tone, follow-up depth, language, and communication channels.</p>
            <DocImage src="/images/docs/interview-edit-settings.webp" alt="Settings tab with AI configuration, language, and channel options" />
          </DocStep>

          <DocStep step={5} title="Add Candidates and Share">
            <p>Go to the <strong>Sessions</strong> tab to add candidates by name and email. Copy their invite link to share.</p>
            <DocImage src="/images/docs/interview-edit-sessions.webp" alt="Sessions tab with candidate list and invite link" />
          </DocStep>
        </DocSteps>

        <DocCallout variant="tip" title="Pro tip">
          Be specific in your description — mention the role, skills, duration, and number of questions for the best AI-generated results.
        </DocCallout>
      </>
    ),
  },
];
