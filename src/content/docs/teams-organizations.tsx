import type { DocArticle } from "./types";
import { DocCallout } from "@/components/docs/doc-callout";
import { DocImage } from "@/components/docs/doc-image";

export const teamsOrganizationsArticles: DocArticle[] = [
  {
    slug: "organizations-members-and-roles",
    categorySlug: "teams-organizations",
    title: "Organizations, Members, and Roles",
    description: "Organizations, projects, team members, and role management",
    audience: "creators",
    order: 1,
    content: () => (
      <>
        <h2>Organizations</h2>
        <p>
          An organization is the top-level account that owns all interviews, questions, and sessions. When you sign up, Aural creates a <strong>Personal</strong> organization for you automatically.
        </p>
        <p>
          You can create additional organizations (e.g., one per company) and switch between them from the sidebar breadcrumb.
        </p>

        <h3>Projects</h3>
        <p>
          Each organization can have multiple <strong>projects</strong>. A project groups interviews and questions under a common scope — such as a department, role family, or hiring wave. Switch projects from the same breadcrumb.
        </p>

        <DocCallout variant="tip" title="Example">
          Organization &quot;Acme Corp&quot; might have projects &quot;Engineering Q1&quot; and &quot;Product Internships.&quot;
        </DocCallout>

        <hr />

        <h2>Members</h2>
        <p>
          Go to <strong>Organizations &gt; Settings &gt; Members</strong> to see who has access.
        </p>
        <DocImage src="/images/docs/org-members.webp" alt="Organization Members page with member table and Add Member button" />
        <p>
          Click <strong>+ Add member</strong>, enter the person&apos;s email address, and choose a role. If they don&apos;t have an Aural account yet, they&apos;ll receive an invitation.
        </p>

        <h3>Roles</h3>
        <ul>
          <li><strong>Owner</strong> — full access including member management and deletion</li>
          <li><strong>Admin</strong> — can manage interviews, questions, members, and settings</li>
          <li><strong>Member</strong> — can create and edit interviews, view results, and manage questions</li>
        </ul>
        <p>
          You can change a member&apos;s role or remove them from the members table at any time.
        </p>

        <DocCallout variant="info">
          You can invite unlimited team members to your organization.
        </DocCallout>
      </>
    ),
  },
];
