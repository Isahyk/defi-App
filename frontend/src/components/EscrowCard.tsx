import type { EscrowSnapshot } from "../contract/escrow";
import {
  formatBps,
  formatDate,
  formatEthAmount,
  shortenAddress,
  statusLabel,
} from "../utils/format";

type EscrowCardProps = {
  snapshot: EscrowSnapshot;
  connectedAccount: string | null;
  isCorrectNetwork: boolean;
  onDeposit: () => Promise<void>;
  onConfirm: () => Promise<void>;
  onWithdraw: () => Promise<void>;
  onDispute: () => Promise<void>;
  onSellerClaim: () => Promise<void>;
  isBusy: boolean;
};

export default function EscrowCard({
  snapshot,
  connectedAccount,
  isCorrectNetwork,
  onDeposit,
  onConfirm,
  onWithdraw,
  onDispute,
  onSellerClaim,
  isBusy,
}: EscrowCardProps) {
  const normalized = connectedAccount?.toLowerCase();
  const isBuyer = normalized === snapshot.buyer.toLowerCase();
  const isSeller = normalized === snapshot.seller.toLowerCase();
  const canDeposit = isBuyer && snapshot.status === 0 && isCorrectNetwork;
  const canConfirm = isBuyer && snapshot.status === 1 && isCorrectNetwork;
  const canDispute = (isBuyer || isSeller) && snapshot.status === 1 && snapshot.arbiter !== "0x0000000000000000000000000000000000000000" && isCorrectNetwork;
  const canSellerClaim = isSeller && snapshot.status === 1 && isCorrectNetwork;
  const pendingForConnected =
    normalized === snapshot.buyer.toLowerCase()
      ? snapshot.pendingBuyer
      : normalized === snapshot.seller.toLowerCase()
        ? snapshot.pendingSeller
        : normalized === snapshot.feeRecipient.toLowerCase()
          ? snapshot.pendingFeeRecipient
          : 0n;
  const canWithdraw = pendingForConnected > 0n && isCorrectNetwork;

  return (
    <section className="escrow-card">
      <div className="escrow-card-head">
        <div>
          <span className="eyebrow">Live Contract</span>
          <h2>{statusLabel(snapshot.status)}</h2>
        </div>
        <span className={`status-pill status-${snapshot.status}`}>{statusLabel(snapshot.status)}</span>
      </div>

      <div className="hero-metric">
        <span>Total Escrow</span>
        <strong>{formatEthAmount(snapshot.amount)}</strong>
      </div>

      <div className="details-grid">
        <Detail label="Buyer" value={shortenAddress(snapshot.buyer)} />
        <Detail label="Seller" value={shortenAddress(snapshot.seller)} />
        <Detail label="Arbiter" value={shortenAddress(snapshot.arbiter)} />
        <Detail label="Fee recipient" value={shortenAddress(snapshot.feeRecipient)} />
        <Detail label="Inspection deadline" value={formatDate(snapshot.inspectionEnd)} />
        <Detail label="Fee" value={formatBps(snapshot.feeBps)} />
        <Detail label="Seller on full release" value={formatEthAmount(snapshot.sellerReceivesOnFullRelease)} />
        <Detail label="Fee on full release" value={formatEthAmount(snapshot.feeOnFullRelease)} />
      </div>

      <div className="balances-strip">
        <BalanceChip label="Buyer pending" value={snapshot.pendingBuyer} />
        <BalanceChip label="Seller pending" value={snapshot.pendingSeller} />
        <BalanceChip label="Fee pending" value={snapshot.pendingFeeRecipient} />
      </div>

      <div className="actions-panel">
        <button className="primary-button" disabled={!canDeposit || isBusy} onClick={() => void onDeposit()}>
          Deposit
        </button>
        <button className="secondary-button" disabled={!canConfirm || isBusy} onClick={() => void onConfirm()}>
          Confirm Receipt
        </button>
        <button className="secondary-button" disabled={!canWithdraw || isBusy} onClick={() => void onWithdraw()}>
          Withdraw
        </button>
        <button className="ghost-button" disabled={!canDispute || isBusy} onClick={() => void onDispute()}>
          Open Dispute
        </button>
        <button className="ghost-button" disabled={!canSellerClaim || isBusy} onClick={() => void onSellerClaim()}>
          Seller Claim
        </button>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BalanceChip({ label, value }: { label: string; value: bigint }) {
  return (
    <div className="balance-chip">
      <span>{label}</span>
      <strong>{formatEthAmount(value)}</strong>
    </div>
  );
}
