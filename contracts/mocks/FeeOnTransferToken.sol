// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeOnTransferToken is ERC20 {
    uint256 public constant FEE_BPS = 500;
    uint256 private constant BPS_DENOMINATOR = 10_000;

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = (value * FEE_BPS) / BPS_DENOMINATOR;
        uint256 remainder = value - fee;

        super._update(from, address(this), fee);
        super._update(from, to, remainder);
    }
}
