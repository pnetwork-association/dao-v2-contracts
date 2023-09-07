// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {MerkleTree} from "../libraries/MerkleTree.sol";

error InvalidAmount(uint256 amount, uint256 expectedAmount);
error InvalidGovernanceMessageVerifier(address governanceMessagerVerifier, address expectedGovernanceMessageVerifier);
error InvalidSentinelRegistration(bytes1 kind);
error NotRegistrationManager();

contract MockGovernanceMessageEmitter {
    bytes32 public constant GOVERNANCE_MESSAGE_SLASH_SENTINEL = keccak256("GOVERNANCE_MESSAGE_SLASH_SENTINEL");
    bytes32 public constant GOVERNANCE_MESSAGE_SLASH_GUARDIAN = keccak256("GOVERNANCE_MESSAGE_SLASH_GUARDIAN");
    bytes32 public constant GOVERNANCE_MESSAGE_RESUME_SENTINEL = keccak256("GOVERNANCE_MESSAGE_RESUME_SENTINEL");
    bytes32 public constant GOVERNANCE_MESSAGE_RESUME_GUARDIAN = keccak256("GOVERNANCE_MESSAGE_RESUME_GUARDIAN");

    address public immutable epochsManager;
    address public immutable registrationManager;

    event GovernanceMessage(bytes data);

    modifier onlyRegistrationManager() {
        if (msg.sender != registrationManager) {
            revert NotRegistrationManager();
        }

        _;
    }

    constructor(address epochsManager_, address registrationManager_) {
        epochsManager = epochsManager_;
        registrationManager = registrationManager_;
    }

    function resumeGuardian(address guardian) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_RESUME_GUARDIAN,
                abi.encode(IEpochsManager(epochsManager).currentEpoch(), guardian)
            )
        );
    }

    function resumeSentinel(address sentinel) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_RESUME_SENTINEL,
                abi.encode(IEpochsManager(epochsManager).currentEpoch(), sentinel)
            )
        );
    }

    function slashGuardian(address guardian) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_SLASH_GUARDIAN,
                abi.encode(IEpochsManager(epochsManager).currentEpoch(), guardian)
            )
        );
    }

    function slashSentinel(address sentinel) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_SLASH_SENTINEL,
                abi.encode(IEpochsManager(epochsManager).currentEpoch(), sentinel)
            )
        );
    }
}
