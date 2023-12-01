// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {MerkleTree} from "../libraries/MerkleTree.sol";

error InvalidAmount(uint256 amount, uint256 expectedAmount);
error InvalidGovernanceMessageVerifier(address governanceMessagerVerifier, address expectedGovernanceMessageVerifier);
error InvalidSentinelRegistration(bytes1 kind);
error NotRegistrationManager();

contract MockGovernanceMessageEmitter {
    bytes32 public constant GOVERNANCE_MESSAGE_SLASH_ACTOR = keccak256("GOVERNANCE_MESSAGE_SLASH_ACTOR");
    bytes32 public constant GOVERNANCE_MESSAGE_RESUME_ACTOR = keccak256("GOVERNANCE_MESSAGE_RESUME_ACTOR");

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

    function resumeActor(address actor, bytes1 registrationKind) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_RESUME_ACTOR,
                abi.encode(
                    IEpochsManager(epochsManager).currentEpoch(),
                    actor,
                    _getActorTypeByRegistrationKind(registrationKind)
                )
            )
        );
    }

    function slashActor(address actor, bytes1 registrationKind) external onlyRegistrationManager {
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_SLASH_ACTOR,
                abi.encode(
                    IEpochsManager(epochsManager).currentEpoch(),
                    actor,
                    _getActorTypeByRegistrationKind(registrationKind)
                )
            )
        );
    }

    function _getActorTypeByRegistrationKind(bytes1 registrationKind) internal pure returns (uint8) {
        if (registrationKind == 0x01) return 1;
        if (registrationKind == 0x02) return 1;
        if (registrationKind == 0x03) return 2;
        return 0;
    }
}
