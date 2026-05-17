// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract SmartEscrow is ReentrancyGuard {
    using Address for address payable;
    using SafeERC20 for IERC20;

    enum Status {
        AWAITING_DEPOSIT,
        FUNDED,
        DISPUTED,
        RELEASED,
        REFUNDED,
        RESOLVED
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidFeeBps();
    error InvalidDeadline();
    error InvalidState();
    error EscrowExpired();
    error EscrowNotExpired();
    error DepositAlreadyMade();
    error NativeValueMismatch();
    error ZeroWithdrawableBalance();
    error ResolutionExceedsDeposit();
    error ArbiterRequired();
    error UnsupportedDirectPayment();
    error UnexpectedTokenAmount();

    event Deposited(address indexed buyer, uint256 amount);
    event ReceiptConfirmed(address indexed buyer, uint256 sellerAmount, uint256 feeAmount);
    event DisputeOpened(address indexed caller);
    event DisputeResolved(
        address indexed arbiter,
        uint256 buyerAmount,
        uint256 sellerAmount,
        uint256 feeAmount
    );
    event Refunded(address indexed buyer, uint256 amount);
    event Withdrawal(address indexed payee, uint256 amount);

    uint256 private constant BPS_DENOMINATOR = 10_000;

    address public immutable buyer;
    address public immutable seller;
    address public immutable arbiter;
    address public immutable feeRecipient;
    address public immutable asset;

    uint96 public immutable amount;
    uint64 public immutable inspectionEnd;
    uint16 public immutable feeBps;

    Status public status;

    mapping(address => uint256) public pendingWithdrawals;

    modifier onlyBuyer() {
        if (msg.sender != buyer) revert Unauthorized();
        _;
    }

    modifier onlySeller() {
        if (msg.sender != seller) revert Unauthorized();
        _;
    }

    modifier onlyParticipant() {
        if (msg.sender != buyer && msg.sender != seller) revert Unauthorized();
        _;
    }

    modifier onlyArbiter() {
        if (arbiter == address(0)) revert ArbiterRequired();
        if (msg.sender != arbiter) revert Unauthorized();
        _;
    }

    constructor(
        address buyer_,
        address seller_,
        address arbiter_,
        address feeRecipient_,
        address asset_,
        uint96 amount_,
        uint64 inspectionEnd_,
        uint16 feeBps_
    ) {
        if (buyer_ == address(0) || seller_ == address(0) || feeRecipient_ == address(0)) {
            revert InvalidAddress();
        }
        if (buyer_ == seller_) revert InvalidAddress();
        if (arbiter_ != address(0) && (arbiter_ == buyer_ || arbiter_ == seller_)) {
            revert InvalidAddress();
        }
        if (amount_ == 0) revert InvalidAmount();
        if (feeBps_ > BPS_DENOMINATOR) revert InvalidFeeBps();
        if (inspectionEnd_ <= block.timestamp) revert InvalidDeadline();

        buyer = buyer_;
        seller = seller_;
        arbiter = arbiter_;
        feeRecipient = feeRecipient_;
        asset = asset_;
        amount = amount_;
        inspectionEnd = inspectionEnd_;
        feeBps = feeBps_;
        status = Status.AWAITING_DEPOSIT;
    }

    receive() external payable {
        revert UnsupportedDirectPayment();
    }

    function deposit() external payable onlyBuyer nonReentrant {
        if (status != Status.AWAITING_DEPOSIT) revert DepositAlreadyMade();

        if (asset == address(0)) {
            if (msg.value != amount) revert NativeValueMismatch();
        } else {
            if (msg.value != 0) revert NativeValueMismatch();

            IERC20 token = IERC20(asset);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), amount);
            uint256 received = token.balanceOf(address(this)) - balanceBefore;

            if (received != amount) revert UnexpectedTokenAmount();
        }

        status = Status.FUNDED;
        emit Deposited(msg.sender, amount);
    }

    function confirmReceipt() external onlyBuyer {
        if (status != Status.FUNDED) revert InvalidState();
        _creditSellerForFullRelease();
    }

    function openDispute() external onlyParticipant {
        if (status != Status.FUNDED) revert InvalidState();
        if (arbiter == address(0)) revert ArbiterRequired();
        if (block.timestamp > inspectionEnd) revert EscrowExpired();

        status = Status.DISPUTED;
        emit DisputeOpened(msg.sender);
    }

    function sellerClaimAfterExpiry() external onlySeller {
        if (status != Status.FUNDED) revert InvalidState();
        if (block.timestamp <= inspectionEnd) revert EscrowNotExpired();

        _creditSellerForFullRelease();
    }

    function refundBuyerBeforeDeposit() external onlyBuyer {
        if (status != Status.AWAITING_DEPOSIT) revert InvalidState();
        if (block.timestamp <= inspectionEnd) revert EscrowNotExpired();

        status = Status.REFUNDED;
        emit Refunded(buyer, 0);
    }

    function resolveDispute(uint256 buyerAward) external onlyArbiter {
        if (status != Status.DISPUTED) revert InvalidState();
        if (buyerAward > amount) revert ResolutionExceedsDeposit();

        status = Status.RESOLVED;

        uint256 sellerGross = uint256(amount) - buyerAward;
        uint256 feeAmount = (sellerGross * feeBps) / BPS_DENOMINATOR;
        uint256 sellerNet = sellerGross - feeAmount;

        if (buyerAward != 0) {
            pendingWithdrawals[buyer] += buyerAward;
        }
        if (sellerNet != 0) {
            pendingWithdrawals[seller] += sellerNet;
        }
        if (feeAmount != 0) {
            pendingWithdrawals[feeRecipient] += feeAmount;
        }

        emit DisputeResolved(msg.sender, buyerAward, sellerNet, feeAmount);
    }

    function withdraw() external nonReentrant {
        uint256 amountOwed = pendingWithdrawals[msg.sender];
        if (amountOwed == 0) revert ZeroWithdrawableBalance();

        pendingWithdrawals[msg.sender] = 0;

        if (asset == address(0)) {
            payable(msg.sender).sendValue(amountOwed);
        } else {
            IERC20(asset).safeTransfer(msg.sender, amountOwed);
        }

        emit Withdrawal(msg.sender, amountOwed);
    }

    function feeOnFullAmount() external view returns (uint256) {
        return (uint256(amount) * feeBps) / BPS_DENOMINATOR;
    }

    function getSummary()
        external
        view
        returns (
            Status currentStatus,
            address escrowAsset,
            uint256 escrowAmount,
            uint256 deadline,
            uint256 sellerReceivesOnFullRelease,
            uint256 feeOnFullRelease
        )
    {
        uint256 feeAmount = (uint256(amount) * feeBps) / BPS_DENOMINATOR;

        return (
            status,
            asset,
            amount,
            inspectionEnd,
            uint256(amount) - feeAmount,
            feeAmount
        );
    }

    function _creditSellerForFullRelease() internal {
        status = Status.RELEASED;

        uint256 feeAmount = (uint256(amount) * feeBps) / BPS_DENOMINATOR;
        uint256 sellerNet = uint256(amount) - feeAmount;

        pendingWithdrawals[seller] += sellerNet;
        if (feeAmount != 0) {
            pendingWithdrawals[feeRecipient] += feeAmount;
        }

        emit ReceiptConfirmed(buyer, sellerNet, feeAmount);
    }
}

