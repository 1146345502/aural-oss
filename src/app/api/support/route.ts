import { getAuthUser } from "@/lib/auth";
import { createLogger } from "@/lib/logger";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const log = createLogger("api/support");

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const type = formData.get("type") as string;
  const severity = formData.get("severity") as string;
  const topic = formData.get("topic") as string;
  const message = formData.get("message") as string;

  if (!message?.trim()) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }

  const files = formData.getAll("attachments") as File[];
  const supabase = createClient();
  const uploadResults = await Promise.all(
    files
      .filter((file) => file.size > 0)
      .map(async (file) => {
        const ext = file.name.split(".").pop();
        const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from("support-attachments")
          .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          log.error("Failed to upload attachment:", uploadError);
          return null;
        }
        return { name: file.name, path: storagePath, size: file.size };
      })
  );
  const storedAttachments = uploadResults.filter(
    (r): r is NonNullable<typeof r> => r !== null,
  );

  const { error } = await supabaseAdmin.from("support_tickets").insert({
    user_id: user.id,
    email: user.email,
    type,
    severity,
    topic,
    message,
    attachments: storedAttachments,
  });

  if (error) {
    log.error("Failed to create support ticket:", error);
    return NextResponse.json(
      { error: "Failed to submit support request" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
