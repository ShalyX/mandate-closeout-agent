// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Repeatable Sepolia test asset for the Mandate Closeout Agent demo.
/// @dev This is not a product token and has no monetary value.
contract DemoToken is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("Mandate Demo USD", "mUSD")
        Ownable(initialOwner)
    {}

    function mint(address recipient, uint256 amount) external onlyOwner {
        _mint(recipient, amount);
    }
}
