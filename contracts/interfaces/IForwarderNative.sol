// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IForwarderNative
 * @author pNetwork
 *
 * @notice
 */
interface IForwarderNative {
    /*
     * @notice Lend in behalf of lender a certain amount of tokens locked for a given period of time.
     *         This function triggers a pegin containing in the userData field the parameters necessary
     *         to trigger a lend on the chain where the pegin takes place
     *
     * @param amount
     * @param duration
     * @param lender
     *
     */
    function lend(uint256 amount, uint64 duration, address lender) external;

    /*
     * @notice Set ForwarderHost address
     *
     * @param forwarderHost
     *
     */
    function setForwarderHost(address forwarderHost) external;

    /*
     * @notice Stake an certain amount of tokens locked for a period of time in behalf of receiver.
     *         This function triggers a pegin containing in the userData field the parameters necessary
     *         to trigger a stake on the chain where the pegin takes place
     *
     * @param amount
     * @param duration
     * @param receiver
     */
    function stake(uint256 amount, uint64 duration, address receiver) external;

    /*
     * @notice Registers/Renew a sentinel for a given duration in behalf of owner.
     *         This function triggers a pegin containing in the userData field the parameters necessary
     *         to trigger an updateSentinelRegistrationByStaking on the chain where the pegin takes place
     *
     * @param amount
     * @param duration
     * @param signature
     * @param owner
     *
     */
    function updateSentinelRegistrationByStaking(
        uint256 amount,
        uint64 duration,
        bytes calldata signature,
        address owner
    ) external;
}
