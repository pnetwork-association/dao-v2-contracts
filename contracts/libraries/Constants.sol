// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Constants {
    uint256 public constant BORROW_AMOUNT_FOR_SENTINEL_REGISTRATION = 200000 * 10 ** 18;
    uint256 public constant STAKING_MIN_AMOUT_FOR_SENTINEL_REGISTRATION = 200000 * 10 ** 18;
    uint64 public constant MIN_STAKE_DURATION = 604800;
    uint24 public constant DECIMALS_PRECISION = 10 ** 6;
    uint24 public constant MAX_BORROWER_BORROWED_AMOUNT = 200000;
    bytes1 public constant REGISTRATION_NULL = 0x00;
    bytes1 public constant REGISTRATION_SENTINEL_STAKING = 0x01;
    bytes1 public constant REGISTRATION_SENTINEL_BORROWING = 0x02;
}
