export const ACCOUNT_DELETION_CLEANUP_STEPS = [
  { table: "interviews", column: "userId" },
  { table: "webhooks", column: "userId" },
  { table: "projects", column: "createdBy" },
  { table: "organizations", column: "ownerId" },
  { table: "organization_members", column: "userId" },
  { table: "project_members", column: "userId" },
  { table: "audit_logs", column: "userId" },
] as const;

type DeleteResult = {
  error: { message: string; code?: string } | null;
};

type DeleteBuilder = {
  delete: () => {
    eq: (column: string, value: string) => PromiseLike<DeleteResult>;
  };
};

type AccountDeletionClient = {
  from: (table: string) => DeleteBuilder;
};

export async function deleteUserOwnedData(
  userId: string,
  client?: AccountDeletionClient,
) {
  const deletionClient =
    client ?? (await import("@/lib/supabase/admin")).supabaseAdmin;

  for (const step of ACCOUNT_DELETION_CLEANUP_STEPS) {
    const { error } = await deletionClient
      .from(step.table)
      .delete()
      .eq(step.column, userId);

    if (error) {
      throw new Error(
        `Failed to delete account data from ${step.table}: ${error.message}`,
      );
    }
  }
}
