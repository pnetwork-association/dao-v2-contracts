// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IFeesManager
 * @author pNetwork
 *
 * @notice
 */
interface IFeesManager {
    /**
     * @dev Emitted when a fee is deposited.
     *
     * @param asset The asset address
     * @param epoch The epoch
     * @param amount The amount
     */
    event FeeDeposited(address indexed asset, uint256 indexed epoch, uint256 amount);

    /**
     * @dev Emitted when an user claims a fee for a given epoch.
     *
     * @param owner The owner addres
     * @param sentinel The sentinel addres
     * @param epoch The epoch
     * @param asset The asset addres
     * @param amount The amount
     */
    event FeeClaimed(
        address indexed owner,
        address indexed sentinel,
        uint256 indexed epoch,
        address asset,
        uint256 amount
    );
}
