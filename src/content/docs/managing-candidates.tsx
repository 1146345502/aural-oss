import type { DocArticle } from "./types";
import { DocCallout } from "@/components/docs/doc-callout";
import { DocFeatureGrid, DocFeature } from "@/components/docs/doc-feature-grid";
import { DocImage } from "@/components/docs/doc-image";
import { DocSteps, DocStep } from "@/components/docs/doc-steps";

export const managingCandidatesArticles: DocArticle[] = [
  {
    slug: "candidates-links-and-tracking",
    categorySlug: "managing-candidates",
    title: "Candidates, Links, and Tracking",
    description: "Add candidates, share links, track session status, and handle retakes",
    audience: "creators",
    order: 1,
    content: () => (
      <>
        <h2>Adding Candidates</h2>
        <p>
          Open your interview, go to the <strong>Sessions</strong> tab, and click the <strong>+ Add</strong> button. A dropdown menu offers three ways to add candidates:
        </p>

        <DocImage src="/images/docs/sessions-add-dropdown.webp" alt="Sessions tab with the Add dropdown showing Create individually, Import by Excel, and Import by resumes" />

        <DocSteps>
          <DocStep step={1} title="Create Individually">
            <p>Enter a candidate&apos;s name, email, and optional details like phone, school, or work experience. You can also upload a resume to auto-fill the fields.</p>
            <DocImage src="/images/docs/create-individually.webp" alt="Create individually dialog with name, email, phone, school, and resume upload fields" />
          </DocStep>
          <DocStep step={2} title="Import by Excel">
            <p>Download the template, fill in session details, and upload the file. Name is required for each row.</p>
            <DocImage src="/images/docs/import-excel.webp" alt="Import Sessions dialog with template download link and file upload area" />
          </DocStep>
          <DocStep step={3} title="Import by Resumes">
            <p>Upload PDF resumes and let AI extract candidate information automatically. Each resume costs 5 AI tokens.</p>
            <DocImage src="/images/docs/import-resumes.webp" alt="Import by Resumes dialog with uploaded PDF files and Parse resumes button" />
          </DocStep>
        </DocSteps>

        <hr />

        <h2>Link Types</h2>
        <DocFeatureGrid>
          <DocFeature title="Public Link">
            Anyone with the URL can start a session. Use for job postings or broad distribution. Enable this on the <strong>Settings</strong> tab under <strong>Shareable Link</strong>.
          </DocFeature>
          <DocFeature title="Invite-Only Link">
            Each candidate gets a unique link tied to their email. Best when you need to control exactly who participates. Copy each link from the Sessions tab.
          </DocFeature>
        </DocFeatureGrid>

        <hr />

        <h2>Session States</h2>
        <ul>
          <li><strong>Not Started</strong> — the candidate has not opened the link yet</li>
          <li><strong>In Progress</strong> — the candidate is actively taking the interview</li>
          <li><strong>Completed</strong> — the session is finished and AI analysis is available</li>
        </ul>
        <p>
          Filter the Sessions tab by status to focus on active or completed sessions.
        </p>

        <h2>Resuming and Retaking</h2>
        <p>
          If a candidate leaves before finishing, they can return to the same link and continue where they left off. To start a completely new session (e.g., after technical issues), use the <strong>Retake</strong> option — the previous session is kept for comparison.
        </p>

        <DocCallout variant="info">
          Each retake creates an independent session with its own transcript and scores.
        </DocCallout>
      </>
    ),
  },
];
