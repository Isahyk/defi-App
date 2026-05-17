import { formatEther } from "ethers";

export function shortenAddress(address?: string | null) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEthAmount(value: bigint) {
  return `${Number(formatEther(value)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })} ETH`;
}

export function formatDate(timestampSeconds: bigint) {
  return new Date(Number(timestampSeconds) * 1000).toLocaleString();
}

export function formatBps(value: bigint) {
  return `${Number(value) / 100}%`;
}

export function statusLabel(status: number) {
  switch (status) {
    case 0:
      return "Awaiting Deposit";
    case 1:
      return "Funded";
    case 2:
      return "Disputed";
    case 3:
      return "Released";
    case 4:
      return "Refunded";
    case 5:
      return "Resolved";
    default:
      return "Unknown";
  }
}
