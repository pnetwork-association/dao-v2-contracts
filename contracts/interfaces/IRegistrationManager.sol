// SPDX-License-Identifier: MIT

pragma solidity ^0.8.17;

/**
 * @title IRegistrationManager
 * @author pNetwork
 *
 * @notice
 */
interface IRegistrationManager {
    struct Registration {
        address owner;
        uint16 startEpoch;
        uint16 endEpoch;
        bytes1 kind;
    }

    /**
     * @dev Emitted when an user increases his staking sentinel registration position by increasing his lock time within the Staking Manager.
     *
     * @param sentinel The sentinel
     * @param endEpoch The new end epoch
     */
    event DurationIncreased(address indexed sentinel, uint16 endEpoch);

    /**
     * @dev Emitted when a guardian is removed.
     *
     * @param guardian The guardian
     */
    event GuardianRemoved(address indexed guardian);

    /**
     * @dev Emitted when a guardian is registered.
     *
     * @param guardian The guardian
     */
    event GuardianRegistered(address indexed guardian);

    /**
     * @dev Emitted when a sentinel registration is completed.
     *
     * @param owner The sentinel owner
     * @param startEpoch The epoch in which the registration starts
     * @param endEpoch The epoch at which the registration ends
     * @param sentinel The sentinel address
     * @param kind The type of registration
     * @param amount The amount used to register a sentinel
     */
    event SentinelRegistrationUpdated(
        address indexed owner,
        uint16 indexed startEpoch,
        uint16 indexed endEpoch,
        address sentinel,
        bytes1 kind,
        uint256 amount
    );

    /**
     * @dev Emitted when a sentinel is released.
     *
     * @param sentinel The sentinel address
     * @param epoch The epoch at which the release happens
     */
    event SentinelReleased(address indexed sentinel, uint16 indexed epoch);

    /*
     * @notice Returns the sentinel address given the owner and the signature
     *
     * @param sentinel
     *
     * @return address representing the address of the sentinel.
     */
    function getSentinelAddressFromSignature(address owner, bytes calldata signature) external pure returns (address);

    /*
     * @notice Increase the duration of a staking sentinel registration.
     *
     * @param duration
     */
    function increaseSentinelRegistrationDuration(uint64 duration) external;

    /*
     * @notice Increase the duration  of a staking sentinel registration. This function is used togheter with
     *         onlyForwarder modifier in order to enable cross chain duration increasing
     *
     * @param owner
     * @param duration
     */
    function increaseSentinelRegistrationDuration(address owner, uint64 duration) external;

    /*
     * @notice Returns if an address is a guardian or not.
     *
     * @param guardian
     *
     * @return a bool indicating if an address is a guardian.
     */
    function isGuardian(address guardian) external view returns(bool);

    /*
     * @notice Remove a guardian
     *
     * @param guardian
     */
    function removeGuardian(address guardian) external;

    /*
     * @notice Register a guardian
     *
     * @param guardian
     */
    function registerGuardian(address guardian) external;

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
     * @notice Release a specific sentinel. This function shold be called only by who owns the RELEASE_SENTINEL_ROLE role.
     *
     * @param sentinel
     *
     */
    function releaseSentinel(address sentinel) external;

    /*
     * @notice Return the staked amount by a sentinel in a given epoch.
     *
     * @param epoch
     *
     * @return uint256 representing staked amount by a sentinel in a given epoch.
     */
    function sentinelStakedAmountByEpochOf(address sentinel, uint16 epoch) external view returns (uint256);

    /*
     * @notice Return the total staked amount by the sentinels in a given epoch.
     *
     * @param epoch
     *
     * @return uint256 representing  total staked amount by the sentinels in a given epoch.
     */
    function totalSentinelStakedAmountByEpoch(uint16 epoch) external view returns (uint256);

    /*
     * @notice Return the total staked amount by the sentinels in a given epochs range.
     *
     * @param epoch
     *
     * @return uint256[] representing  total staked amount by the sentinels in a given epochs range.
     */
    function totalSentinelStakedAmountByEpochsRange(
        uint16 startEpoch,
        uint16 endEpoch
    ) external view returns (uint256[] memory);

    /*
     * @notice Registers/Renew a sentinel by borrowing the specified amount of tokens for a given number of epochs.
     *         This function is used togheter with onlyForwarder.
     *
     * @params owner
     * @param numberOfEpochs
     * @param signature
     *
     */
    function updateSentinelRegistrationByBorrowing(
        address owner,
        uint16 numberOfEpochs,
        bytes calldata signature
    ) external;

    /*
     * @notice Registers/Renew a sentinel by borrowing the specified amount of tokens for a given number of epochs.
     *
     * @param numberOfEpochs
     * @param signature
     *
     */
    function updateSentinelRegistrationByBorrowing(uint16 numberOfEpochs, bytes calldata signature) external;

    /*
     * @notice Registers/Renew a sentinel for a given duration in behalf of owner
     *
     * @param amount
     * @param duration
     * @param signature
     * @param owner
     *
     */
    function updateSentinelRegistrationByStaking(
        address owner,
        uint256 amount,
        uint64 duration,
        bytes calldata signature
    ) external;
}
