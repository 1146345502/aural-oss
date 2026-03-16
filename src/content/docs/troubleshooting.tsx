import type { DocArticle } from "./types";
import { DocCallout } from "@/components/docs/doc-callout";

export const troubleshootingArticles: DocArticle[] = [
  {
    slug: "audio-and-connection",
    categorySlug: "troubleshooting",
    title: "Audio and Connection",
    description: "Microphone setup, network requirements, and reconnection",
    audience: "both",
    order: 1,
    content: () => (
      <>
        <h2>Microphone Not Working</h2>
        <ol>
          <li>Check that the browser has permission to use your microphone (look for the mic icon in the address bar)</li>
          <li>Make sure the correct input device is selected in the interview interface</li>
          <li>Close other apps that might be using the microphone (Zoom, Teams, etc.)</li>
          <li>Verify your mic works in your OS sound settings</li>
          <li>Try a different microphone or restart the browser</li>
        </ol>

        <DocCallout variant="tip" title="Tip">
          Use the microphone test on the pre-interview setup screen before you start.
        </DocCallout>

        <hr />

        <h2>Network and Connection</h2>
        <h3>Requirements</h3>
        <ul>
          <li>Stable internet (2 Mbps or higher recommended)</li>
          <li>WebSocket support (wss://) — most networks allow this by default</li>
          <li>Low latency for real-time voice</li>
        </ul>

        <h3>Firewall and VPN</h3>
        <p>
          Corporate firewalls or VPNs may block WebSocket connections. Try switching to a different network (e.g., mobile hotspot) or ask your IT team to allow WebSocket traffic.
        </p>

        <h3>If You Get Disconnected</h3>
        <p>
          Aural saves your progress automatically. Return to the same interview link to resume where you left off. If a reconnect button appears, click it. Otherwise, refresh the page.
        </p>
        <ul>
          <li>Use a stable network — avoid switching Wi-Fi mid-session</li>
          <li>Keep the browser tab active (some browsers throttle background tabs)</li>
          <li>Close unnecessary apps to free bandwidth</li>
        </ul>
      </>
    ),
  },
  {
    slug: "browser-and-video",
    categorySlug: "troubleshooting",
    title: "Browser and Video",
    description: "Browser compatibility, camera, and screen sharing issues",
    audience: "both",
    order: 2,
    content: () => (
      <>
        <h2>Browser Compatibility</h2>
        <p>
          <strong>Google Chrome (desktop)</strong> is recommended for full voice, video, code editor, and whiteboard support.
        </p>
        <ul>
          <li><strong>Firefox</strong> — generally works, but some audio device selection features may behave differently</li>
          <li><strong>Safari</strong> — limited support for some voice and video features</li>
          <li><strong>Mobile browsers</strong> — Aural can run on mobile, but screen size and background tab behavior may affect the experience. Use desktop for important interviews.</li>
        </ul>

        <DocCallout variant="info">
          Keep your browser up to date. Older versions may lack WebRTC and audio API fixes that Aural depends on.
        </DocCallout>

        <hr />

        <h2>Camera and Screen Sharing</h2>
        <h3>Camera Not Working</h3>
        <ol>
          <li>Check that the browser has camera permission (address bar icon or site settings)</li>
          <li>Make sure no other app is using the camera exclusively</li>
          <li>Try selecting a different camera device if you have multiple</li>
        </ol>

        <h3>Screen Sharing</h3>
        <p>
          When prompted, choose the window, tab, or entire screen you want to share. If the picker doesn&apos;t appear, click anywhere on the page first and retry.
        </p>

        <h3>Common Errors</h3>
        <ul>
          <li><strong>Permission denied</strong> — reset camera/screen permissions in browser settings</li>
          <li><strong>Black screen</strong> — ensure the camera is uncovered and the correct device is selected</li>
          <li><strong>Screen share not starting</strong> — close and retry; a page refresh may be needed</li>
        </ul>
      </>
    ),
  },
];
