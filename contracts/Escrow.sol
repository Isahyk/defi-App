// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.34;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SmartEscrow is ReentrancyGuard {
    // Error declaration
    error NotBuyer();
    error NotSeller();
    error NotParticipant();
    error InvalidState();
    error ZeroAmount();
    error TransferFailed();
    error NotArbiter();
    error TooEarly();

    enum State {
        AWAITING_FUNDS,
        AWAITING_DELIVERY,
        DISPUTED,
        COMPLETED
        }

        address public immutable buyer;
        address public immutable seller;
        IERC20 public immutable token;

        

        uint128 public amount;
        uint64 public deadline;
        State public state;

        // Mediator
        address[] public arbiters;
        uint8 public voteForSeller;
        uint8 public voteForBuyer;

        mapping(address => bool) public hasVoted;
        mapping(address => uint256) public pendingWithdrawals;

        //event declaration

    event Deposit(uint256 amount);
    event DisputeRaised();
    event Voted(address indexed arbiter, bool seller);
    event Resolved(bool seller);
    event Withdrawal(address indexed user, uint256 amount);

// Modifiers

     modifier onlyBuyer() {
        if (msg.sender != buyer) revert NotBuyer();
        _;
    }

    modifier onlyArbiter() {
        if (!_isArbiter(msg.sender)) revert NotArbiter();
        _;
    }

    modifier inState(State s) {
        if (state != s) revert InvalidState();
        _;
    }

    constructor(
            address _seller,
            uint256 _duration,
            address[] memory _arbiters,
            address _token 
            )
       {
        seller = _seller;
        arbiters = _arbiters;
        token = IERC20(_token);
        buyer = msg.sender;
        deadline = uint64(block.timestamp + _duration);
        state = State.AWAITING_FUNDS;
    }

      // Depositting
      function deposit(uint256 _amount) external payable onlyBuyer inState(State.AWAITING_FUNDS) {
        if (_amount == 0) revert ZeroAmount();
        amount = _amount;
          if (address(token) == address(0)) {
            if (msg.value != _amount) revert TransferFailed();
        } else {
            bool ok = token.transferFrom(msg.sender, address(this), _amount);
            if (!ok) revert TransferFailed();
        }
        state = State.AWAITING_DELIVERY;
        emit Deposit(_amount);
    }
    function confirmDelivery() external onlyBuyer inState(State.AWAITING_DELIVERY) {
        state = State.COMPLETED;
        pendingWithdrawals[seller] += amount;
    }
    
    //Raise dispute
    function raiseDispute() external inState(State.AWAITING_DELIVERY) {
        if (msg.sender != buyer && msg.sender != seller) revert NotParticipant();
        state = State.DISPUTED;
        emit DisputeRaised();
    }
     // Voting
     function vote(bool _mySeller) external onlyArbiter() inState(State.DISPUTED) {
        if (hasVoted[msg.sender]) revert AlreadyVoted();
        hasVoted[msg.sender] = true;
        if (_mySeller) {
            voteForSeller++;
        } else {
            voteForBuyer++;
        }
        emit Voted(msg.sender, _mySeller);
        _checkResolution();
    }
    // check resolution
    function _checkResolution() internal {
        uint256 majority = (arbiters.length / 2) + 1;
        if (voteForSeller >= majority) {
            state = State.COMPLETED;
            pendingWithdrawals[seller] += amount;
            emit Resolved(true);
        } else if (voteForBuyer >= majority) {
            state = State.REFUNDED;
            pendingWithdrawals[buyer] += amount;
            emit Resolved(false);
        }
           }
        // resolution 
        function resolve(bool mySeller) internal {
            state = State.COMPLETED;
            address winner = mySeller ? seller : buyer;
            pendingWithdrawals[winner] += amount;
            emit Resolved(mySeller);
            }
             // Timeout
    function resolveTimeout() external {
        if (block.timestamp < deadline) revert TooEarly();
        if (state != State.AWAITING_DELIVERY) revert InvalidState();

        state = State.COMPLETED;

        // default → refund buyer
        pendingWithdrawals[buyer] += amount;
    }

    
    // Withdraw (Pull Payment)
    
    function withdraw() external nonReentrant {
        uint256 bal = pendingWithdrawals[msg.sender];
        if (bal == 0) revert ZeroAmount();

        pendingWithdrawals[msg.sender] = 0;

        if (address(token) == address(0)) {
            (bool ok, ) = msg.sender.call{value: bal}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok = token.transfer(msg.sender, bal);
            if (!ok) revert TransferFailed();
        }
        emit Withdrawal(msg.sender, bal);
    }
    function _isArbiter(address user) internal view returns(bool){
        for (uint256 i = 0; i < arbiters.length; i++) {
            if (arbiters[i] == user) return true;
        }
        return false;
    }
    }
    

