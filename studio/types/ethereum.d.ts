// The EIP-1193 provider a browser wallet injects (MetaMask and friends).
// Only the surface the wallet login uses.
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
}

interface Window {
  ethereum?: Eip1193Provider;
}
