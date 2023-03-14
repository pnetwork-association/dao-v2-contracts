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
     * @notice Send a crosschain message using pNetwork and Layer 0. The usage of 2 protocols is needed in order to ensure that pNetwork DAO works even if
     *         the bridge are down
     *
     * @param amount
     * @param to
     * @param data
     * @param pNetworkChainId
     * @param lzChainId
     * @param gasForDestinationLzReceive
     *
     */
    function call(
        uint256 amount,
        address to,
        bytes calldata data,
        bytes4 pNetworkChainId,
        uint16 lzChainId,
        uint gasForDestinationLzReceive
    ) external payable;
}
