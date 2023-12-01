// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IBaseStakingManager} from "./IBaseStakingManager.sol";

/**
 * @title IStakingManager
 * @author pNetwork
 *
 * @notice
 */
interface IStakingManager is IBaseStakingManager {
    /*
     * @notice Increase the amount at stake.
     *
     * @param amount
     */
    function increaseAmount(uint256 amount) external;

    /*
     * @notice Increase the duration of a stake.
     *
     * @param duration
     */
    function increaseDuration(uint64 duration) external;

    /*
     * @notice Stake an certain amount of tokens locked for a period of time in behalf of receiver.
     * in exchange of the governance token.
     *
     * @param receiver
     * @param amount
     * @param duration
     */
    function stake(address receiver, uint256 amount, uint64 duration) external;
}
