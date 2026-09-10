import { bulkInterviewAction } from "@/app/api/v1/_lib/bulk-action";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return bulkInterviewAction(request, (await params).id);
}
