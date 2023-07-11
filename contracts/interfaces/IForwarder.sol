// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/**
 * @title IForwarder
 * @author pNetwork
 *
 * @notice
 */
interface IForwarder {
    /*
     * @notice Send a crosschain message
     *
     * @param amount
     * @param to
     * @param data
     * @param chainId
     *
     */
    function call(uint256 amount, address to, bytes calldata data, bytes4 chainId) external;
}
