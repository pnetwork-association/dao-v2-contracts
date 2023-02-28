// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IForwarderHost
 * @author pNetwork
 *
 * @notice
 */
interface IForwarderHost {
    /*
     * @notice Unstake an certain amount of governance token in exchange of the same amount of staked tokens.
     *         This function triggers a pegout containing in the userData field the parameters necessary
     *         to trigger a release of the corresponding unstaked amount from the Vault in the native chain
     *
     * @param amount
     * @param receiver
     *
     */
    function unstake(uint256 amount, address receiver) external;
}
