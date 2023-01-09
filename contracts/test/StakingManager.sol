// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

// Be sure to use this contract in a forked environment where the real implementation is already deployed
contract StakingManager {
    struct Lock {
        uint64 lockDate;
        uint64 duration;
        uint256 amount;
    }

    function stake(uint256 amount, uint64 duration, address receiver) external returns (bool) {}

    function unstake(uint256 amount) external returns (uint256) {}

    function increaseLockDuration(uint64 _index, uint64 duration) external {}

    function getStakedLocks(address _address) external view returns (Lock[] memory) {}

    function getNumberOfStakedLocks(address _address) external view returns (uint256) {}
}
