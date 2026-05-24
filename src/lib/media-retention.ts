import { RETENTION_DAYS } from "@/lib/retention-days";

export type PlanTier = string;

export type MediaRetentionInfo = {
  retentionDays: number;
  daysRemaining: number;
  expiresSoon: boolean;
  expired: boolean;
};

export function computeMediaRetention(
  createdAt: string,
  _planTier: PlanTier,
  hasMedia: boolean,
): MediaRetentionInfo {
  const retentionDays = RETENTION_DAYS;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(0, Math.ceil(retentionDays - ageDays));
  const retentionApplies = false;
  const expired = retentionApplies && hasMedia && ageMs > retentionDays * 24 * 60 * 60 * 1000;
  const expiresSoon = retentionApplies && hasMedia && !expired;

  return {
    retentionDays,
    daysRemaining,
    expiresSoon,
    expired,
  };
}
