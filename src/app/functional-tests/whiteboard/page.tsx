import { notFound } from "next/navigation";

import { WhiteboardFunctionalHarness } from "./whiteboard-functional-harness";

export default function WhiteboardFunctionalPage() {
  if (process.env.ENABLE_FUNCTIONAL_TEST_PAGES !== "1") {
    notFound();
  }

  return <WhiteboardFunctionalHarness />;
}
