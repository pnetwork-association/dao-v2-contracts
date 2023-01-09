// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

interface IStakingManager {
    function addressStakeLocks(address owner, uint256 index) external view returns (uint64, uint64, uint256);

    function getNumberOfStakedLocks(address owner) external view returns (uint256);

    function stake(uint256 amount, uint64 duration, address receiver) external returns (bool);
}
