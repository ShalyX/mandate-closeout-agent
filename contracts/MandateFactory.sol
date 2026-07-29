// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MandateVault} from "./MandateVault.sol";

contract MandateFactory {
    address public immutable platformExecutor;
    address[] public mandates;
    mapping(address owner => address[] vaults) private mandatesByOwner;
    mapping(address vault => bool created) public isMandate;

    event MandateCreated(
        address indexed vault,
        address indexed owner,
        address indexed executor,
        address treasury,
        uint64 endAt,
        uint64 gracePeriod
    );

    constructor(address platformExecutor_) {
        require(platformExecutor_ != address(0), "BAD_EXECUTOR");
        platformExecutor = platformExecutor_;
    }

    function createMandate(
        address treasury,
        uint64 endAt,
        uint64 gracePeriod
    ) external returns (address vault) {
        vault = address(
            new MandateVault(
                msg.sender,
                platformExecutor,
                treasury,
                endAt,
                gracePeriod
            )
        );
        mandates.push(vault);
        mandatesByOwner[msg.sender].push(vault);
        isMandate[vault] = true;
        emit MandateCreated(
            vault,
            msg.sender,
            platformExecutor,
            treasury,
            endAt,
            gracePeriod
        );
    }

    function mandateCount() external view returns (uint256) {
        return mandates.length;
    }

    function getMandatesByOwner(
        address owner
    ) external view returns (address[] memory) {
        return mandatesByOwner[owner];
    }
}
