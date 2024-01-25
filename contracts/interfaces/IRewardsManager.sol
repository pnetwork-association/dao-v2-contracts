// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/**
 * @title IRewardsManager
 * @author pNetwork
 *
 * @notice
 */
interface IRewardsManager {
    function registerRewards(uint16 epoch, address[] calldata stakers) external;

    function claimReward(uint16 epoch) external;
}
