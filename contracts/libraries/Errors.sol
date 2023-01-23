// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

library Errors {
    error InvalidAmount();
    error InvalidNumberOfEpochs();
    error AmountNotAvailableInEpoch(uint16 epoch);
    error NothingToRelease(address borrower, uint16 epoch);
    error EpochNotTerminated();
    error InvalidEpoch();
    error InvalidLockTime();
    error InsufficentAmount();
    error InvalidRegistration();
    error SentinelNotReleasable(address sentinel);
    error SentinelNotRegistered();
    error AlreadyClaimed(address asset, uint16 epoch);
    error NothingToClaim();
    error LendPeriodTooBig();
    error InvalidDuration();
    error UnfinishedStakingPeriod();
}
