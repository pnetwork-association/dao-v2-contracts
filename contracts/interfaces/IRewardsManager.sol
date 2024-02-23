// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/**
 * @title IRewardsManager
 * @author pNetwork
 *
 * @notice
 */
interface IRewardsManager {
    /**
     * @dev Emitted when the token changes
     *
     * @param previousToken the previous token
     * @param newToken the new token
     */
    event TokenChanged(address previousToken, address newToken);

    /* @notice Change token
     *
     * @param token
     *
     */
    function changeToken(address token) external;

    /*
     * Allows a staker to claim their rewards for a specific epoch.
     * @param {uint16} epoch - The epoch number for which rewards are being claimed.
     */
    function claimRewardByEpoch(uint16 epoch) external;

    /*
     * Allows to deposit rewards that will be distributed for a specific epoch.
     * @param {uint16} epoch - The epoch number for which the staker is depositing tokens.
     * @param {uint256} amount - The amount of tokens the staker is depositing.
     */
    function depositForEpoch(uint16 epoch, uint256 amount) external;

    /*
     * Allows to register rewards for a specific epoch for a set of stakers.
     * @param {uint16} epoch - The epoch number for which rewards are being registered.
     * @param {address[]} stakers - An array of addresses representing the stakers to register rewards for.
     */
    function registerRewardsForEpoch(uint16 epoch, address[] calldata stakers) external;

    /*
     * Allows to withdraw unclaimable rewards for a specific epoch.
     * @param {uint16} epoch - The epoch number for which unclaimable rewards are being withdrawn.
     */
    function withdrawUnclaimableRewardsForEpoch(uint16 epoch) external;
}
