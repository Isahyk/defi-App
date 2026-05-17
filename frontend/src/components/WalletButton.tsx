import { shortenAddress } from "../utils/format";

type WalletButtonProps = {
  onConnect: () => Promise<void>;
  account: string | null;
  isConnecting: boolean;
  hasInjectedWallet: boolean;
};

export default function WalletButton({
  onConnect,
  account,
  isConnecting,
  hasInjectedWallet,
}: WalletButtonProps) {
  if (!hasInjectedWallet) {
    return (
      <button className="ghost-button" disabled>
        Wallet not detected
      </button>
    );
  }

  return (
    <button className="primary-button" onClick={() => void onConnect()} disabled={isConnecting}>
      {account ? shortenAddress(account) : isConnecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
