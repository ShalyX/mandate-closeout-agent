// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SpikeCounter {
    uint256 public number;
    address public immutable executor;

    event NumberSet(uint256 previousNumber, uint256 newNumber, address indexed caller);

    error Unauthorized();

    constructor(address executor_) {
        executor = executor_;
    }

    function setNumber(uint256 newNumber) external {
        if (msg.sender != executor) revert Unauthorized();

        uint256 previousNumber = number;
        number = newNumber;

        emit NumberSet(previousNumber, newNumber, msg.sender);
    }
}

