/**
 * Start an inbound turn in the only safe order for deterministic escalation.
 * A handoff must be durable before usage checks, API-key checks, or AI work can
 * stop the reply path.
 */
export async function beginInboundTurn<TAllowance>(args: {
  persistDeterministicHandoff: () => Promise<void>;
  checkAllowance: () => Promise<TAllowance>;
}): Promise<TAllowance> {
  await args.persistDeterministicHandoff();
  return await args.checkAllowance();
}
