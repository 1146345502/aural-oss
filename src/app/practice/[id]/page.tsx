import FocusedPrepPage from "@/app/(dashboard)/interviews/[id]/prep/page";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function PracticeAliasPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <FocusedPrepPage />;
}
