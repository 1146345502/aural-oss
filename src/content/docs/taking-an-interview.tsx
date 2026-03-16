import { DocCallout } from "@/components/docs/doc-callout";
import { DocFeature, DocFeatureGrid } from "@/components/docs/doc-feature-grid";
import { DocImage } from "@/components/docs/doc-image";
import { DocStep, DocSteps } from "@/components/docs/doc-steps";
import type { DocArticle } from "./types";

export const takingAnInterviewArticles: DocArticle[] = [
  {
    slug: "accessing-your-interview",
    categorySlug: "taking-an-interview",
    title: "Accessing Your Interview",
    description: "Open the link, verify your identity, set up your microphone, and start",
    audience: "interviewees",
    order: 1,
    content: () => (
      <>
        <h2>Before You Begin</h2>
        <p>
          You will receive an interview link from the person who invited you. Use <strong>Google Chrome</strong> on a desktop computer for the best experience.
        </p>

        <DocCallout variant="warning" title="Browser recommendation">
          Safari and Firefox may have limited voice and video support. Chrome is strongly recommended.
        </DocCallout>

        <h2>Getting Into Your Interview</h2>
        <DocSteps>
          <DocStep step={1} title="Open the Link and Enter Your Details">
            <p>Click the interview link to open the Aural interview page. On the welcome screen, enter your full name and email address, then click <strong>Begin Interview</strong>.</p>
            <DocImage src="/images/docs/interviewee-landing.webp" alt="Interviewee welcome screen with name and email fields" />
          </DocStep>
          <DocStep step={2} title="Complete the Checklist">
            <p>Depending on the interview setup, you may need to grant camera, microphone, and screen capture permissions. Confirm each item on the checklist, then click <strong>Start</strong>.</p>
            <DocImage src="/images/docs/interviewee-checklist.webp" alt="Pre-interview checklist with photo, microphone test, and screen capture authorization" />
          </DocStep>
          <DocStep step={3} title="Start the Interview">
            <p>Click <strong>Start Voice Interview</strong> (or the equivalent button for your interview type). The AI interviewer will introduce itself and begin asking questions.</p>
            <DocImage src="/images/docs/interview-start.webp" alt="Interview start screen with Start Voice Interview button and empty transcript panel" />
          </DocStep>
        </DocSteps>

        <DocCallout variant="tip" title="Tip">
          Close other apps that might be using your microphone (e.g., Zoom, Teams) before starting.
        </DocCallout>
      </>
    ),
  },
  {
    slug: "during-your-interview",
    categorySlug: "taking-an-interview",
    title: "During Your Interview",
    description: "Voice, chat, video modes, code editor, whiteboard, and navigation",
    audience: "interviewees",
    order: 2,
    content: () => (
      <>
        <h2>How the Interview Works</h2>
        <p>
          The AI interviewer asks questions one at a time and responds to your answers. Depending on the interview setup, you may use voice, text chat, video, or a combination.
        </p>

        <DocImage src="/images/docs/interview-session.webp" alt="Interview session with voice, chat, and video modes active — transcript on the right, camera preview at bottom left" />

        <h3>Voice Mode</h3>
        <p>
          Speak your answers naturally. The AI listens and responds with speech in real time — like a phone conversation. Wait for the AI to finish speaking before you answer.
        </p>
        <ul>
          <li><strong>Speak clearly</strong> at a moderate pace for the best transcription</li>
          <li><strong>Pause briefly</strong> before answering to avoid cutting off the AI</li>
          <li><strong>Use a quiet environment</strong> to reduce background noise</li>
        </ul>

        <h3>Chat Mode</h3>
        <p>
          Type your answers in the text box and press <strong>Enter</strong> to send. Chat is useful in noisy environments, for carefully phrased technical answers, or if you simply prefer typing.
        </p>

        <DocCallout variant="info">
          You can switch between voice and chat at any time. Both your spoken and typed responses are captured in the transcript.
        </DocCallout>

        <h3>Video Mode</h3>
        <p>
          Some interviews record your camera and/or screen. Position your camera so your face is clearly visible with good lighting.
        </p>

        <hr />

        <h2>Interactive Tools</h2>

        <h3>Code Editor</h3>
        <p>
          For coding questions, a Monaco-based editor (the same engine behind VS Code) appears on screen. Select your language from the dropdown, write your solution, and click <strong>Run</strong> to test it. The AI can see your code and may ask you to explain your approach.
        </p>

        <DocImage src="/images/docs/interview-coding.webp" alt="Coding question screen — Monaco editor with Java code, language selector, and transcript panel" />

        <DocCallout variant="tip" title="Tip">
          Think out loud (or type your reasoning in chat) while coding. The AI evaluates both your code and your problem-solving approach.
        </DocCallout>

        <h3>Whiteboard</h3>
        <p>
          For design questions, an Excalidraw-based whiteboard lets you draw flowcharts, architecture diagrams, and sketches. The AI uses vision to observe your whiteboard in real time and can ask follow-up questions about your design. Label components clearly.
        </p>

        <DocImage src="/images/docs/interview-whiteboard.webp" alt="Whiteboard question screen — Excalidraw canvas with architecture diagram and transcript panel" />

        <hr />

        <h2>Navigating Questions</h2>
        <p>
          The AI typically advances automatically after your response. You can also control the flow:
        </p>
        <DocFeatureGrid>
          <DocFeature title="Next Question">
            Say &quot;next question&quot; or click the Next button to move forward.
          </DocFeature>
          <DocFeature title="Skip">
            Say &quot;skip&quot; or click Skip if you prefer not to answer.
          </DocFeature>
          <DocFeature title="Previous Question">
            Say &quot;previous question&quot; or click Previous to go back and revise.
          </DocFeature>
        </DocFeatureGrid>

        <hr />

        <h2>Ending the Interview</h2>
        <p>
          After all questions are answered, the AI wraps up the session. You can also end early by clicking <strong>End Interview</strong> or saying &quot;end interview.&quot; Once you confirm, your session is submitted and cannot be edited.
        </p>
        <p>
          After submission, you&apos;ll see a confirmation screen. The interviewing team will review your AI-generated analysis and follow up with next steps.
        </p>

        <h3>If You Get Disconnected</h3>
        <p>
          Aural saves your progress automatically. Return to the same interview link, verify your identity if prompted, and continue where you left off — previous answers are preserved.
        </p>

        <DocCallout variant="tip" title="To avoid interruptions">
          Use a stable network, keep the browser tab active, and close unnecessary apps before starting.
        </DocCallout>
      </>
    ),
  },
];
