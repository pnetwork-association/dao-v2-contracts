// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Roles {
    bytes32 public constant INCREASE_EPOCH_ROLE = keccak256("INCREASE_EPOCH_ROLE");
    bytes32 public constant SET_EPOCH_DURATION_ROLE = keccak256("SET_EPOCH_DURATION_ROLE");
    // prettier-ignore
    bytes32 public constant INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE = keccak256("INCREASE_BORROWABLE_AMOUNT_FOR_EPOCH_ROLE");
    // prettier-ignore
    bytes32 public constant INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE = keccak256("INCREASE_BORROWABLE_AMOUNT_BY_DURATION_ROLE");
    bytes32 public constant BORROW_ROLE = keccak256("BORROW_ROLE");
    bytes32 public constant RELEASE_ROLE = keccak256("RELEASE_ROLE");
    bytes32 public constant RELEASE_SENTINEL = keccak256("RELEASE_SENTINEL");

    bytes32 public constant DEPOSIT_INTEREST = keccak256("DEPOSIT_INTEREST");
}
