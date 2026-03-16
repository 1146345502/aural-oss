import type { DocArticle } from "./types";

export const faqArticles: DocArticle[] = [
  {
    slug: "general",
    categorySlug: "faq",
    title: "General FAQ",
    description: "Common questions about Aural",
    audience: "both",
    order: 1,
    content: () => (
      <>
        <h2>General Questions</h2>

        <h3>Can I use Aural for free?</h3>
        <p>
          Yes. Aural is open-source and all features are available without any usage limits. You only need to provide your own AI provider API keys (e.g. OpenAI, Kimi, MiniMax).
        </p>

        <h3>What languages are supported?</h3>
        <p>
          You can configure the interview language when creating a template. The AI conducts the session and evaluates responses in the selected language. Supported languages include English, Chinese, Spanish, French, German, and others.
        </p>

        <h3>What is the maximum interview duration?</h3>
        <p>
          You can set any duration when designing the interview. Typical sessions range from 15 minutes to over an hour. There are no time limits in the open-source edition.
        </p>

        <h3>What browsers and devices are supported?</h3>
        <p>
          Chrome on desktop is recommended for full voice, video, and interactive tool support. Safari and Firefox generally work but may have limitations. Mobile browsers can run Aural, though a desktop is recommended for critical interviews.
        </p>

        <h3>Is my data secure?</h3>
        <p>
          Yes. Data is stored in Supabase with Row Level Security, encrypted in transit and at rest. Passwords are hashed. Since this is a self-hosted solution, you have full control over your data.
        </p>

        <h3>What happens if I lose connection during an interview?</h3>
        <p>
          Aural saves your progress automatically. Return to the same interview link to resume where you left off. The interviewer can also view any data captured before the disconnection.
        </p>

        <h3>How long is my data retained?</h3>
        <p>
          Since you host your own instance, data is retained as long as your database is running. You have full control over data retention and cleanup.
        </p>
      </>
    ),
  },
];
