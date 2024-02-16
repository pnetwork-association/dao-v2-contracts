// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Roles {
    bytes32 public constant INCREASE_EPOCH_ROLE = keccak256("INCREASE_EPOCH_ROLE");
    bytes32 public constant SET_EPOCH_DURATION_ROLE = keccak256("SET_EPOCH_DURATION_ROLE");
    bytes32 public constant BORROW_ROLE = keccak256("BORROW_ROLE");
    bytes32 public constant RELEASE_ROLE = keccak256("RELEASE_ROLE");
    bytes32 public constant SLASH_ROLE = keccak256("SLASH_ROLE");
    bytes32 public constant STAKE_ROLE = keccak256("STAKE_ROLE");
    bytes32 public constant INCREASE_DURATION_ROLE = keccak256("INCREASE_DURATION_ROLE");
    bytes32 public constant UPGRADE_ROLE = keccak256("UPGRADE_ROLE");
    bytes32 public constant CHANGE_MAX_TOTAL_SUPPLY_ROLE = keccak256("CHANGE_MAX_TOTAL_SUPPLY_ROLE");
    bytes32 public constant CHANGE_TOKEN_ROLE = keccak256("CHANGE_TOKEN_ROLE");
    bytes32 public constant UPDATE_GUARDIAN_REGISTRATION_ROLE = keccak256("UPDATE_GUARDIAN_REGISTRATION_ROLE");
    bytes32 public constant UPDATE_SENTINEL_REGISTRATION_ROLE = keccak256("UPDATE_SENTINEL_REGISTRATION_ROLE");
    bytes32 public constant REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE =
        keccak256("REDIRECT_CLAIM_TO_CHALLENGER_BY_EPOCH_ROLE");
    bytes32 public constant SET_FEES_MANAGER_ROLE = keccak256("SET_FEES_MANAGER_ROLE");
    bytes32 public constant SET_GOVERNANCE_MESSAGE_EMITTER_ROLE = keccak256("SET_GOVERNANCE_MESSAGE_EMITTER_ROLE");
    bytes32 public constant INCREASE_AMOUNT_ROLE = keccak256("INCREASE_AMOUNT_ROLE");
    bytes32 public constant DEPOSIT_REWARD_ROLE = keccak256("DEPOSIT_REWARD_ROLE");
    bytes32 public constant WITHDRAW_ROLE = keccak256("WITHDRAW_ROLE");
}
