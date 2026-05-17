type TransactionModalProps = {
  isOpen: boolean;
  title: string;
  body: string;
  tone?: "neutral" | "success" | "error";
  onClose: () => void;
};

export default function TransactionModal({
  isOpen,
  title,
  body,
  tone = "neutral",
  onClose,
}: TransactionModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className={`modal-card ${tone}`} onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="icon-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p>{body}</p>
      </div>
    </div>
  );
}
