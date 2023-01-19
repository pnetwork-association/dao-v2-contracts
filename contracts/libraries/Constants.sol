// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Constants {
    uint24 public constant MINIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 200000;
    uint24 public constant MAXMIMUM_AMOUNT_BORROWABLE_FOR_SENTINEL_REGISTRATION = 400000;
    uint24 public constant MINIMUM_AMOUNT_FOR_SENTINEL_REGISTRATION = 200000;
    bytes1 public constant REGISTRATION_NULL = 0x00;
    bytes1 public constant REGISTRATION_SENTINEL_STAKING = 0x01;
    bytes1 public constant REGISTRATION_SENTINEL_BORROWING = 0x02;
    uint24 public constant DECIMALS_PRECISION = 10 ** 6;
}
