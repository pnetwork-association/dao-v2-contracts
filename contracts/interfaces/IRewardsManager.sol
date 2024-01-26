// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/**
 * @title IRewardsManager
 * @author pNetwork
 *
 * @notice
 */
interface IRewardsManager {
    function claimRewardByEpoch(uint16 epoch) external;

    function depositForEpoch(uint16 epoch, uint256 amount) external;

    function registerRewardsForEpoch(uint16 epoch, address[] calldata stakers) external;
}
