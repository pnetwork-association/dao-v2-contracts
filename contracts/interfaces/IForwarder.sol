// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IForwarder
 * @author pNetwork
 *
 * @notice
 */
interface IForwarder {
    /*
     * @notice Set originating address
     *
     * @param originatingAddress
     *
     */
    function setOriginatingAddress(address originatingAddress) external;
}
