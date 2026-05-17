import { useEffect, useState } from "react";

import EscrowCard from "../components/EscrowCard";
import Navbar from "../components/Navbar";
import TransactionModal from "../components/TransactionModal";
import {
  getEscrowSnapshot,
  type EscrowSnapshot,
  writeConfirmReceipt,
  writeDeposit,
  writeOpenDispute,
  writeSellerClaim,
  writeWithdraw,
} from "../contract/escrow";
import { useWallet } from "../hooks/useWallet";
import { shortenAddress } from "../utils/format";

type ModalState = {
  isOpen: boolean;
  title: string;
  body: string;
  tone: "neutral" | "success" | "error";
};

const initialModal: ModalState = {
  isOpen: false,
  title: "",
  body: "",
  tone: "neutral",
};

export default function Home() {
  const wallet = useWallet();
  const [snapshot, setSnapshot] = useState<EscrowSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [modal, setModal] = useState<ModalState>(initialModal);

  const refresh = async () => {
    setIsLoading(true);
    try {
      setSnapshot(await getEscrowSnapshot());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const requireConnectedProvider = () => {
    if (!wallet.provider) {
      throw new Error("Connect a wallet before submitting transactions.");
    }

    return wallet.provider;
  };

  const runAction = async (
    title: string,
    action: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setIsBusy(true);
    setModal({
      isOpen: true,
      title,
      body: "Waiting for wallet confirmation and transaction finality...",
      tone: "neutral",
    });

    try {
      await action();
      await refresh();
      setModal({
        isOpen: true,
        title: `${title} Complete`,
        body: successMessage,
        tone: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed.";
      setModal({
        isOpen: true,
        title: `${title} Failed`,
        body: message,
        tone: "error",
      });
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="page-background" />
      <div className="page-content">
        <Navbar
          onConnect={wallet.connectWallet}
          account={wallet.account}
          isConnecting={wallet.isConnecting}
          hasInjectedWallet={wallet.hasInjectedWallet}
        />

        <section className="hero-panel">
          <div className="hero-copy">
            <span className="eyebrow">Onchain settlement workspace</span>
            <h2>Operate one escrow contract with a wallet-aware dashboard.</h2>
            <p>
              Monitor contract state, verify participant roles, and execute the exact lifecycle
              actions your deployment supports without dropping into scripts.
            </p>
          </div>
          <div className="hero-side">
            <div className="signal-card">
              <span>Connected account</span>
              <strong>{shortenAddress(wallet.account)}</strong>
            </div>
            <div className="signal-card">
              <span>Expected chain</span>
              <strong>{wallet.isCorrectNetwork ? "Ready" : "Switch wallet network"}</strong>
            </div>
          </div>
        </section>

        {isLoading || !snapshot ? (
          <section className="escrow-card loading-card">
            <h3>Loading escrow state...</h3>
            <p>Make sure your local Hardhat node is running if you are targeting localhost.</p>
          </section>
        ) : (
          <EscrowCard
            snapshot={snapshot}
            connectedAccount={wallet.account}
            isCorrectNetwork={wallet.isCorrectNetwork}
            isBusy={isBusy}
            onDeposit={() =>
              runAction(
                "Deposit",
                () => writeDeposit(requireConnectedProvider()),
                "The escrow has been funded.",
              )
            }
            onConfirm={() =>
              runAction(
                "Confirm Receipt",
                () => writeConfirmReceipt(requireConnectedProvider()),
                "Seller and fee recipient balances were credited.",
              )
            }
            onWithdraw={() =>
              runAction(
                "Withdraw",
                () => writeWithdraw(requireConnectedProvider()),
                "Pending funds were withdrawn.",
              )
            }
            onDispute={() =>
              runAction(
                "Open Dispute",
                () => writeOpenDispute(requireConnectedProvider()),
                "The escrow is now disputed.",
              )
            }
            onSellerClaim={() =>
              runAction(
                "Seller Claim",
                () => writeSellerClaim(requireConnectedProvider()),
                "The seller claim after expiry has completed.",
              )
            }
          />
        )}

        <section className="notes-grid">
          <article className="note-card">
            <span className="eyebrow">Action policy</span>
            <h3>Buttons react to your role</h3>
            <p>
              Deposit and confirm are intended for the buyer, seller claim is intended for the
              seller, and withdraw becomes available when the connected account has pending funds.
            </p>
          </article>
          <article className="note-card">
            <span className="eyebrow">Local testing</span>
            <h3>Keep the node running</h3>
            <p>
              For localhost testing, run `npm run node` in the smart-contract project before
              starting this frontend so reads and writes have a live RPC target.
            </p>
          </article>
        </section>
      </div>

      <TransactionModal
        isOpen={modal.isOpen}
        title={modal.title}
        body={modal.body}
        tone={modal.tone}
        onClose={() => setModal(initialModal)}
      />
    </main>
  );
}
