// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MandateVault is Ownable {
    using SafeERC20 for IERC20;

    enum ObligationStatus {
        Pending,
        Paid,
        Cancelled
    }

    struct Obligation {
        address recipient;
        address token;
        uint128 amount;
        uint64 dueAt;
        ObligationStatus status;
    }

    struct AllowanceTarget {
        address token;
        address spender;
        bool revoked;
    }

    struct EmergencyRecovery {
        address token;
        address recipient;
        address requester;
        uint64 executeAfter;
        bool executed;
    }

    address public executor;
    address public immutable treasury;
    uint64 public immutable endAt;
    uint64 public immutable gracePeriod;
    bool public active;
    bool public paused;
    bool public finalized;

    Obligation[] public obligations;
    AllowanceTarget[] public allowanceTargets;
    address[] public trackedTokenList;
    EmergencyRecovery[] public emergencyRecoveries;
    mapping(address token => bool tracked) public trackedTokens;

    event MandateActivated(uint64 endAt, address treasury, address executor);
    event MandatePaused(address indexed by);
    event MandateResumed(address indexed by);
    event ObligationAdded(
        uint256 indexed id,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        uint64 dueAt
    );
    event ObligationSettled(
        uint256 indexed id,
        address indexed recipient,
        address indexed token,
        uint256 amount
    );
    event ObligationCancelled(uint256 indexed id, bytes32 indexed reasonHash);
    event AllowanceTargetAdded(
        uint256 indexed id,
        address indexed token,
        address indexed spender
    );
    event AllowanceRevoked(
        uint256 indexed id,
        address indexed token,
        address indexed spender
    );
    event ResidualSwept(address indexed token, address indexed treasury, uint256 amount);
    event MandateFinalized(address indexed previousExecutor, uint64 finalizedAt);
    event EmergencyRecoveryRequested(
        uint256 indexed requestId,
        address indexed token,
        address indexed recipient,
        uint64 executeAfter
    );
    event EmergencyRecoveryExecuted(
        uint256 indexed requestId,
        address indexed token,
        address indexed recipient,
        uint256 amount,
        address requester,
        address executor
    );
    event ExecutorReplaced(
        address indexed previousExecutor,
        address indexed newExecutor
    );

    modifier onlyExecutor() {
        require(msg.sender == executor, "ONLY_EXECUTOR");
        _;
    }

    modifier whileConfigurable() {
        require(!active, "CONFIG_LOCKED");
        _;
    }

    constructor(
        address initialOwner,
        address initialExecutor,
        address treasury_,
        uint64 endAt_,
        uint64 gracePeriod_
    ) Ownable(initialOwner) {
        require(initialExecutor != address(0), "BAD_EXECUTOR");
        require(treasury_ != address(0), "BAD_TREASURY");
        require(endAt_ > block.timestamp, "BAD_END");
        require(gracePeriod_ > 0, "BAD_RECOVERY_DELAY");
        executor = initialExecutor;
        treasury = treasury_;
        endAt = endAt_;
        gracePeriod = gracePeriod_;
    }

    function addTrackedToken(address token) external onlyOwner whileConfigurable {
        require(token != address(0), "BAD_TOKEN");
        require(!trackedTokens[token], "TOKEN_TRACKED");
        trackedTokens[token] = true;
        trackedTokenList.push(token);
    }

    function addObligation(
        address recipient,
        address token,
        uint128 amount,
        uint64 dueAt
    ) external onlyOwner whileConfigurable {
        require(recipient != address(0), "BAD_RECIPIENT");
        require(trackedTokens[token], "TOKEN_NOT_TRACKED");
        require(amount > 0, "BAD_AMOUNT");
        require(dueAt <= endAt, "DUE_AFTER_END");

        uint256 id = obligations.length;
        obligations.push(
            Obligation({
                recipient: recipient,
                token: token,
                amount: amount,
                dueAt: dueAt,
                status: ObligationStatus.Pending
            })
        );
        emit ObligationAdded(id, recipient, token, amount, dueAt);
    }

    function addAllowanceTarget(
        address token,
        address spender
    ) external onlyOwner whileConfigurable {
        require(trackedTokens[token], "TOKEN_NOT_TRACKED");
        require(spender != address(0), "BAD_SPENDER");
        uint256 id = allowanceTargets.length;
        allowanceTargets.push(
            AllowanceTarget({token: token, spender: spender, revoked: false})
        );
        emit AllowanceTargetAdded(id, token, spender);
    }

    function configureAllowance(
        uint256 id,
        uint256 amount
    ) external onlyOwner whileConfigurable {
        AllowanceTarget storage target = allowanceTargets[id];
        IERC20(target.token).forceApprove(target.spender, amount);
    }

    function activate() external onlyOwner whileConfigurable {
        active = true;
        emit MandateActivated(endAt, treasury, executor);
    }

    function pause() external onlyOwner {
        require(active && !finalized, "NOT_ACTIVE");
        require(!paused, "ALREADY_PAUSED");
        paused = true;
        emit MandatePaused(msg.sender);
    }

    function resume() external onlyOwner {
        require(active && !finalized, "NOT_ACTIVE");
        require(paused, "NOT_PAUSED");
        paused = false;
        emit MandateResumed(msg.sender);
    }

    function replaceExecutor(address newExecutor) external onlyOwner {
        require(!finalized, "FINALIZED");
        require(newExecutor != address(0), "BAD_EXECUTOR");
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorReplaced(previousExecutor, newExecutor);
    }

    function cancelObligation(uint256 id, bytes32 reasonHash) external onlyOwner {
        require(active && paused && !finalized, "CANCEL_REQUIRES_PAUSE");
        require(reasonHash != bytes32(0), "BAD_REASON");
        Obligation storage obligation = obligations[id];
        require(obligation.status == ObligationStatus.Pending, "NOT_PENDING");
        obligation.status = ObligationStatus.Cancelled;
        emit ObligationCancelled(id, reasonHash);
    }

    function requestEmergencyRecovery(
        address token,
        address recipient
    ) external onlyOwner {
        require(active && paused && !finalized, "RECOVERY_REQUIRES_PAUSE");
        require(trackedTokens[token], "TOKEN_NOT_TRACKED");
        require(recipient != address(0), "BAD_RECIPIENT");
        uint64 executeAfter = uint64(block.timestamp) + gracePeriod;
        uint256 requestId = emergencyRecoveries.length;
        emergencyRecoveries.push(
            EmergencyRecovery({
                token: token,
                recipient: recipient,
                requester: msg.sender,
                executeAfter: executeAfter,
                executed: false
            })
        );
        emit EmergencyRecoveryRequested(requestId, token, recipient, executeAfter);
    }

    function executeEmergencyRecovery(uint256 requestId) external onlyOwner {
        require(active && paused && !finalized, "RECOVERY_REQUIRES_PAUSE");
        EmergencyRecovery storage recovery = emergencyRecoveries[requestId];
        require(!recovery.executed, "RECOVERY_EXECUTED");
        require(block.timestamp >= recovery.executeAfter, "RECOVERY_DELAY");

        recovery.executed = true;
        uint256 amount = IERC20(recovery.token).balanceOf(address(this));
        IERC20(recovery.token).safeTransfer(recovery.recipient, amount);
        emit EmergencyRecoveryExecuted(
            requestId,
            recovery.token,
            recovery.recipient,
            amount,
            recovery.requester,
            msg.sender
        );
    }

    function obligationCount() external view returns (uint256) {
        return obligations.length;
    }

    function allowanceTargetCount() external view returns (uint256) {
        return allowanceTargets.length;
    }

    function trackedTokenCount() external view returns (uint256) {
        return trackedTokenList.length;
    }

    function settleObligation(uint256 id) external onlyExecutor {
        require(active && !paused && !finalized, "NOT_EXECUTABLE");
        require(block.timestamp >= endAt, "NOT_ENDED");

        Obligation storage obligation = obligations[id];
        require(obligation.status == ObligationStatus.Pending, "NOT_PENDING");
        require(block.timestamp >= obligation.dueAt, "NOT_DUE");

        obligation.status = ObligationStatus.Paid;
        IERC20(obligation.token).safeTransfer(obligation.recipient, obligation.amount);
        emit ObligationSettled(id, obligation.recipient, obligation.token, obligation.amount);
    }

    function revokeAllowance(uint256 id) external onlyExecutor {
        _requireCloseout();
        AllowanceTarget storage target = allowanceTargets[id];
        require(!target.revoked, "ALREADY_REVOKED");

        IERC20 token = IERC20(target.token);
        token.forceApprove(target.spender, 0);
        require(token.allowance(address(this), target.spender) == 0, "REVOCATION_FAILED");
        target.revoked = true;
        emit AllowanceRevoked(id, target.token, target.spender);
    }

    function sweepToken(address token) external onlyExecutor {
        _requireCloseout();
        require(trackedTokens[token], "TOKEN_NOT_TRACKED");
        require(_tokenObligationsResolved(token), "TOKEN_OBLIGATIONS_PENDING");
        require(_tokenAllowancesRevoked(token), "TOKEN_ALLOWANCES_ACTIVE");

        uint256 amount = IERC20(token).balanceOf(address(this));
        if (amount > 0) {
            IERC20(token).safeTransfer(treasury, amount);
        }
        emit ResidualSwept(token, treasury, amount);
    }

    function finalize() external onlyExecutor {
        _requireCloseout();
        require(_allObligationsResolved(), "OBLIGATIONS_PENDING");
        require(_allAllowancesRevoked(), "ALLOWANCES_ACTIVE");
        for (uint256 i; i < trackedTokenList.length; ++i) {
            require(
                IERC20(trackedTokenList[i]).balanceOf(address(this)) == 0,
                "BALANCE_REMAINS"
            );
        }

        address previousExecutor = executor;
        finalized = true;
        active = false;
        executor = address(0);
        emit MandateFinalized(previousExecutor, uint64(block.timestamp));
    }

    function _requireCloseout() private view {
        require(active && !paused && !finalized, "NOT_EXECUTABLE");
        require(block.timestamp >= endAt, "NOT_ENDED");
    }

    function _tokenObligationsResolved(address token) private view returns (bool) {
        for (uint256 i; i < obligations.length; ++i) {
            if (
                obligations[i].token == token &&
                obligations[i].status == ObligationStatus.Pending
            ) return false;
        }
        return true;
    }

    function _tokenAllowancesRevoked(address token) private view returns (bool) {
        for (uint256 i; i < allowanceTargets.length; ++i) {
            if (allowanceTargets[i].token == token && !allowanceTargets[i].revoked) {
                return false;
            }
        }
        return true;
    }

    function _allObligationsResolved() private view returns (bool) {
        for (uint256 i; i < obligations.length; ++i) {
            if (obligations[i].status == ObligationStatus.Pending) return false;
        }
        return true;
    }

    function _allAllowancesRevoked() private view returns (bool) {
        for (uint256 i; i < allowanceTargets.length; ++i) {
            if (!allowanceTargets[i].revoked) return false;
        }
        return true;
    }
}
