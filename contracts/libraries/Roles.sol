// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Roles {
    bytes32 public constant INCREASE_EPOCH_ROLE = keccak256("INCREASE_EPOCH_ROLE");
    bytes32 public constant SET_EPOCH_DURATION_ROLE = keccak256("SET_EPOCH_DURATION_ROLE");
    bytes32 public constant BORROW_ROLE = keccak256("BORROW_ROLE");
    bytes32 public constant RELEASE_ROLE = keccak256("RELEASE_ROLE");
    bytes32 public constant RELEASE_SENTINEL_ROLE = keccak256("RELEASE_SENTINEL_ROLE");
    bytes32 public constant DEPOSIT_INTEREST_ROLE = keccak256("DEPOSIT_INTEREST_ROLE");
    bytes32 public constant SET_FORWARDER_HOST_ROLE = keccak256("SET_FORWARDER_HOST_ROLE");
}
