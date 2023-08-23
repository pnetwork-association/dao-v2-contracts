// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Roles {
    bytes32 public constant INCREASE_EPOCH_ROLE = keccak256("INCREASE_EPOCH_ROLE");
    bytes32 public constant SET_EPOCH_DURATION_ROLE = keccak256("SET_EPOCH_DURATION_ROLE");
    bytes32 public constant BORROW_ROLE = keccak256("BORROW_ROLE");
    bytes32 public constant RELEASE_ROLE = keccak256("RELEASE_ROLE");
    bytes32 public constant RELEASE_SENTINEL_ROLE = keccak256("RELEASE_SENTINEL_ROLE");
    bytes32 public constant STAKE_ROLE = keccak256("STAKE_ROLE");
    bytes32 public constant INCREASE_DURATION_ROLE = keccak256("INCREASE_DURATION_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");
    bytes32 public constant CHANGE_MAX_TOTAL_SUPPLY_ROLE = keccak256("CHANGE_MAX_TOTAL_SUPPLY_ROLE");
    bytes32 public constant UPDATE_GUARDIAN_REGISTRATION_ROLE = keccak256("UPDATE_GUARDIAN_REGISTRATION_ROLE");
}
