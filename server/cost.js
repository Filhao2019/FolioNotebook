/** Estimate only when a provider supplies explicit USD-per-token pricing. */
export function estimateCost(usage, pricing) {
  if (
    !pricing ||
    pricing.prompt === undefined ||
    pricing.completion === undefined
  )
    return null;
  const input = Number(pricing.prompt),
    output = Number(pricing.completion);
  if (
    !Number.isFinite(input) ||
    !Number.isFinite(output) ||
    input < 0 ||
    output < 0
  )
    return null;
  return usage.input * input + usage.output * output;
}
