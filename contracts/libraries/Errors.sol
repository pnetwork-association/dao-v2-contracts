// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Errors {
    error InvalidAmount();
    error InvalidNumberOfEpochs();
    error AmountNotAvailableInEpoch(uint256 epoch);
    error NothingToRelease(address borrower, uint256 epoch);
    error EpochNotTerminated();
    error InvalidEpoch();
    error InsufficentAmount();
    error InvalidRegistration();
    error SentinelNotReleasable(address sentinel);
    error SentinelNotRegistered();
    error AlreadyClaimed();
    error NothingToClaim();
}
