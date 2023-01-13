// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Constants {
    uint256 public constant MINIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 200000 * 10 ** 18;
    uint256 public constant MAXMIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 400000 * 10 ** 18;
    uint256 public constant MINIMUM_AMOUNT_FOR_SENTINEL_REGISTRATION = 200000 * 10 ** 18;
    uint32 public constant REGISTRATION_NULL = 0;
    uint32 public constant REGISTRATION_SENTINEL_STAKING = 1;
    uint32 public constant REGISTRATION_SENTINEL_BORROWING = 2;
    uint16 public constant PRECISION = 2;
}
