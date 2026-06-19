import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNT_DELETION_CLEANUP_STEPS,
  deleteUserOwnedData,
} from "../src/lib/account-deletion";

test("account deletion cleanup removes current organization/project tables", () => {
  assert.deepEqual(ACCOUNT_DELETION_CLEANUP_STEPS, [
    { table: "interviews", column: "userId" },
    { table: "webhooks", column: "userId" },
    { table: "projects", column: "createdBy" },
    { table: "organizations", column: "ownerId" },
    { table: "organization_members", column: "userId" },
    { table: "project_members", column: "userId" },
    { table: "audit_logs", column: "userId" },
  ]);
  assert.equal(
    ACCOUNT_DELETION_CLEANUP_STEPS.some(
      (step) => (step.table as string) === "workspaces",
    ),
    false,
  );
});

test("deleteUserOwnedData runs cleanup in dependency-safe order", async () => {
  const calls: Array<{ table: string; column: string; value: string }> = [];
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            async eq(column: string, value: string) {
              calls.push({ table, column, value });
              return { error: null };
            },
          };
        },
      };
    },
  };

  await deleteUserOwnedData("user-123", client);

  assert.deepEqual(
    calls,
    ACCOUNT_DELETION_CLEANUP_STEPS.map((step) => ({
      table: step.table,
      column: step.column,
      value: "user-123",
    })),
  );
  assert.ok(
    calls.findIndex((call) => call.table === "projects") <
      calls.findIndex((call) => call.table === "organizations"),
  );
});

test("deleteUserOwnedData surfaces cleanup failures", async () => {
  const client = {
    from(table: string) {
      return {
        delete() {
          return {
            async eq() {
              return {
                error:
                  table === "webhooks"
                    ? { message: "permission denied" }
                    : null,
              };
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    () => deleteUserOwnedData("user-123", client),
    /Failed to delete account data from webhooks: permission denied/,
  );
});
