import { router } from "../trpc";
import { interviewRouter } from "./interview";
import { questionRouter } from "./question";
import { sessionRouter } from "./session";
import { analysisRouter } from "./analysis";
import { organizationRouter } from "./organization";
import { orgMemberRouter } from "./orgMember";
import { projectRouter } from "./project";
import { authRouter } from "./auth";
import { apiKeyRouter } from "./apikey";
import { userRouter } from "./user";
import { webhookRouter } from "./webhook";
import { candidateRouter } from "./candidate";
import { usageRouter } from "./usage";

export const appRouter = router({
  auth: authRouter,
  interview: interviewRouter,
  question: questionRouter,
  session: sessionRouter,
  analysis: analysisRouter,
  organization: organizationRouter,
  orgMember: orgMemberRouter,
  project: projectRouter,
  apiKey: apiKeyRouter,
  webhook: webhookRouter,
  user: userRouter,
  candidate: candidateRouter,
  usage: usageRouter,
});

export type AppRouter = typeof appRouter;
