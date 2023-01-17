// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Constants {
    uint24 public constant MINIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 200000;
    uint24 public constant MAXMIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 400000;
    uint24 public constant MINIMUM_AMOUNT_FOR_SENTINEL_REGISTRATION = 200000;
    uint8 public constant REGISTRATION_NULL = 0;
    uint8 public constant REGISTRATION_SENTINEL_STAKING = 1;
    uint8 public constant REGISTRATION_SENTINEL_BORROWING = 2;
}
