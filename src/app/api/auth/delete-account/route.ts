import { NextResponse } from "next/server";
import { deleteUserOwnedData } from "@/lib/account-deletion";
import { createLogger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const log = createLogger("api/auth/delete-account");

export async function POST(request: Request) {
  try {
    const { nonce } = await request.json();

    if (!nonce) {
      return NextResponse.json(
        { error: "Verification code is required" },
        { status: 400 },
      );
    }

    // Server-side client with the user's session from cookies
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the nonce by calling updateUser with only the nonce.
    // This consumes the reauthentication nonce and fails if it's invalid.
    const { error: verifyError } = await supabase.auth.updateUser({
      nonce,
      data: { _delete_verified: true },
    });

    if (verifyError) {
      return NextResponse.json(
        { error: verifyError.message },
        { status: 400 },
      );
    }

    const userId = user.id;

    await deleteUserOwnedData(userId);

    // Delete the auth user. Remaining auth-owned tables should cascade from auth.users.
    const { error: deleteError } =
      await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      log.error("Failed to delete auth user", {
        userId,
        error: deleteError.message,
      });
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    log.error("Account deletion failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
