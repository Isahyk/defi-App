import WalletButton from "./WalletButton";

type NavbarProps = {
  onConnect: () => Promise<void>;
  account: string | null;
  isConnecting: boolean;
  hasInjectedWallet: boolean;
};

export default function Navbar(props: NavbarProps) {
  return (
    <header className="navbar">
      <div className="brand-block">
        <span className="brand-kicker">Escrow Infrastructure</span>
        <div className="brand-row">
          <div className="brand-orb" />
          <h1>SmartEscrow Console</h1>
        </div>
      </div>
      <WalletButton {...props} />
    </header>
  );
}
