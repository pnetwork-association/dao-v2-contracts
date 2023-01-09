// SPDX-License-Identifier: MIT

pragma solidity 0.8.17;

/**
 * @title IRegistrationManager
 * @author pNetwork
 *
 * @notice
 */
interface IRegistrationManager {
    struct Registration {
        address owner;
        uint256 startEpoch;
        uint256 endEpoch;
        uint32 kind;
    }

    /**
     * @dev Emitted when a sentinel registration is completed.
     *
     * @param owner The sentinel owner
     * @param startEpoch The start epoch at which the registration starts
     * @param endEpoch The start epoch at which the registration ends
     * @param sentinel The sentinel address
     * @param kind The type of registration
     */
    event SentinelRegistrationUpdated(
        address indexed owner,
        uint256 indexed startEpoch,
        uint256 indexed endEpoch,
        address sentinel,
        uint32 kind
    );

    /**
     * @dev Emitted when a sentinel is released.
     *
     * @param sentinel The sentinel address
     * @param epoch The epoch at which the release happens
     */
    event SentinelReleased(address indexed sentinel, uint256 indexed epoch);

    /*
     * @notice Returns the sentinel address given the owner and the signature
     *
     * @param sentinel
     *
     * @return address representing the address of the sentinel.
     */
    function getSentinelAddressFromSignature(address owner, bytes calldata signature) external pure returns (address);

    /*
     * @notice Returns the sentinel of a given owner
     *
     * @param owner
     *
     * @return address representing the address of the sentinel.
     */
    function sentinelOf(address owner) external view returns (address);

    /*
     * @notice Returns the sentinel registration
     *
     * @param sentinel
     *
     * @return address representing the sentinel registration data.
     */
    function sentinelRegistration(address sentinel) external view returns (Registration memory);

    /*
     * @notice Returns the reserved amount for a given sentinel in a specifi epoch. The reserved amount is the amount staked/borrowed
     * by an user in an epoch to register a sentinel.
     *
     * @param sentinel
     *
     * @return address representing the sentinel registration data.
     */
    function sentinelReservedAmountByEpochOf(uint256 epoch, address sentinel) external returns (uint256);

    /*
     * @notice Registers/Renew a sentinel by borrowing the specified amount of tokens for a given number of epochs.
     *
     * @param amount
     * @param numberOfEpochs
     * @param signature
     *
     */
    function updateSentinelRegistrationByBorrowing(
        uint256 amount,
        uint256 numberOfEpochs,
        bytes calldata signature
    ) external;

    /*
     * @notice Registers/Renew a sentine for a given number of epochs
     *
     * @param amount
     * @param numberOfEpochs
     * @param signature
     *
     */
    function updateSentinelRegistrationByStaking(uint256 amount, uint64 lockTime, bytes calldata signature) external;

    /*
     * @notice Release a specific sentinel. This function shold be called only by who owns the RELEASE_SENTINEL role.
     *
     * @param sentinel
     *
     */
    function releaseSentinel(address sentinel) external;
}
