/**
 * Deposit address policy. GAIN must use an address provisioned by its custody/wallet provider.
 * The client never fabricates blockchain addresses.
 */
export function generateDedicatedBEP20Address(_memberId: string, _email: string = ''): string {
  return '';
}
