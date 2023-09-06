// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IEpochsManager} from "../interfaces/IEpochsManager.sol";
import {MerkleTree} from "../libraries/MerkleTree.sol";

error InvalidAmount(uint256 amount, uint256 expectedAmount);
error InvalidGovernanceMessageVerifier(address governanceMessagerVerifier, address expectedGovernanceMessageVerifier);
error InvalidSentinelRegistration(bytes1 kind);
error NotRegistrationManager();

contract MockGovernanceMessageEmitter {
    bytes32 public constant GOVERNANCE_MESSAGE_SENTINELS_MERKLE_ROOT =
        keccak256("GOVERNANCE_MESSAGE_SENTINELS_MERKLE_ROOT");
    bytes32 public constant GOVERNANCE_MESSAGE_LIGHT_RESUME_SENTINEL =
        keccak256("GOVERNANCE_MESSAGE_LIGHT_RESUME_SENTINEL");
         bytes32 public constant GOVERNANCE_MESSAGE_HARD_RESUME_SENTINEL =
        keccak256("GOVERNANCE_MESSAGE_HARD_RESUME_SENTINEL");

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

    function hardResumeSentinel(address sentinel, address[] calldata sentinels) external onlyRegistrationManager {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();
        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_HARD_RESUME_SENTINEL,
                abi.encode(currentEpoch, sentinel, MerkleTree.getRoot(_hashAddresses(sentinels)))
            )
        );
    }

    function lightResumeSentinel(address actor) external onlyRegistrationManager {
        emit GovernanceMessage(abi.encode(GOVERNANCE_MESSAGE_LIGHT_RESUME_SENTINEL, abi.encode(actor)));
    }

    function propagateSentinelsByRemovingTheLeafByProof(bytes32[] calldata proof) external onlyRegistrationManager {
        uint16 currentEpoch = IEpochsManager(epochsManager).currentEpoch();

        emit GovernanceMessage(
            abi.encode(
                GOVERNANCE_MESSAGE_SENTINELS_MERKLE_ROOT,
                abi.encode(
                    currentEpoch,
                    MerkleTree.getRootByProofAndLeaf(keccak256(abi.encodePacked(address(0))), proof)
                )
            )
        );
    }

    function _hashAddresses(address[] memory addresses) internal pure returns (bytes32[] memory) {
        bytes32[] memory data = new bytes32[](addresses.length);
        for (uint256 i = 0; i < addresses.length; i++) {
            data[i] = keccak256(abi.encodePacked(addresses[i]));
        }
        return data;
    }
}
