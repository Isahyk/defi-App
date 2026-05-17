import { BrowserProvider } from "ethers";
import { useEffect, useState } from "react";

import { EXPECTED_CHAIN_ID } from "../contract/address";

type WalletState = {
  account: string | null;
  chainId: number | null;
  isConnected: boolean;
  isCorrectNetwork: boolean;
  provider: BrowserProvider | null;
};

const initialState: WalletState = {
  account: null,
  chainId: null,
  isConnected: false,
  isCorrectNetwork: false,
  provider: null,
};

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(initialState);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!window.ethereum) {
      return;
    }

    const provider = new BrowserProvider(window.ethereum);

    const refreshWallet = async () => {
      const network = await provider.getNetwork();
      const accounts = await provider.send("eth_accounts", []);
      const account = accounts[0] ?? null;

      setWallet({
        account,
        chainId: Number(network.chainId),
        isConnected: Boolean(account),
        isCorrectNetwork: Number(network.chainId) === EXPECTED_CHAIN_ID,
        provider,
      });
    };

    void refreshWallet();

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccounts = Array.isArray(accounts) ? accounts : [];
      setWallet((current) => ({
        ...current,
        account: typeof nextAccounts[0] === "string" ? nextAccounts[0] : null,
        isConnected: Boolean(nextAccounts[0]),
      }));
    };

    const handleChainChanged = () => {
      void refreshWallet();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const connectWallet = async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask or a compatible wallet is required.");
    }

    setIsConnecting(true);

    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const network = await provider.getNetwork();

      setWallet({
        account: accounts[0] ?? null,
        chainId: Number(network.chainId),
        isConnected: Boolean(accounts[0]),
        isCorrectNetwork: Number(network.chainId) === EXPECTED_CHAIN_ID,
        provider,
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return {
    ...wallet,
    isConnecting,
    connectWallet,
    hasInjectedWallet: Boolean(window.ethereum),
  };
}
