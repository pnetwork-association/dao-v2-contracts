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
     * @dev Emitted when a borrowing sentinel is slashed.
     *
     * @param sentinel The sentinel
     */
    event BorrowingSentinelSlashed(address indexed sentinel);

    /**
     * @dev Emitted when an user increases his staking sentinel registration position by increasing his lock time within the Staking Manager.
     *
     * @param sentinel The sentinel
     * @param endEpoch The new end epoch
     */
    event DurationIncreased(address indexed sentinel, uint16 endEpoch);

    /**
     * @dev Emitted when a guardian is registered.
     *
     * @param owner The sentinel owner
     * @param startEpoch The epoch in which the registration starts
     * @param endEpoch The epoch at which the registration ends
     * @param guardian The sentinel address
     * @param kind The type of registration
     */
    event GuardianRegistrationUpdated(
        address indexed owner,
        uint16 indexed startEpoch,
        uint16 indexed endEpoch,
        address guardian,
        bytes1 kind
    );

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
     * @dev Emitted when a sentinel is resumed.
     *
     * @param sentinel The sentinel
     */
    event SentinelResumed(address indexed sentinel);

    /**
     * @dev Emitted when a staking sentinel increased its amount at stake.
     *
     * @param sentinel The sentinel
     */
    event StakedAmountIncreased(address indexed sentinel, uint256 amount);

    /**
     * @dev Emitted when a staking sentinel is slashed.
     *
     * @param sentinel The sentinel
     * @param amount The amount
     */
    event StakingSentinelSlashed(address indexed sentinel, uint256 amount);

    /*
     * @notice Returns the sentinel address given the owner and the signature.
     *
     * @param sentinel
     *
     * @return address representing the address of the sentinel.
     */
    function getSentinelAddressFromSignature(address owner, bytes calldata signature) external pure returns (address);

    /*
     * @notice Returns a guardian registration.
     *
     * @param guardian
     *
     * @return Registration representing the guardian registration.
     */
    function guardianRegistration(address guardian) external view returns (Registration memory);

    /*
     * @notice Increase the sentinel staked amount without changhing the timelock.
     *
     * @param amount
     *
     * @return Registration representing the guardian registration.
     */
    function increaseSentinelStakedAmount(uint256 amount) external;

    /*
     * @notice Increase the sentinel staked amount without changhing the timelock. This function is callable
     *         only by the Forwarder
     *
     * @param amount
     *
     * @return Registration representing the guardian registration.
     */
    function increaseSentinelStakedAmount(address owner, uint256 amount) external;

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
     * @notice Return the staked amount by a sentinel in a given epoch.
     *
     * @param epoch
     *
     * @return uint256 representing staked amount by a sentinel in a given epoch.
     */
    function sentinelStakedAmountByEpochOf(address sentinel, uint16 epoch) external view returns (uint256);

    /*
     * @notice Set FeesManager
     *
     * @param feesManager
     *
     */
    function setFeesManager(address feesManager) external;

    /*
     * @notice Set GovernanceMessageEmitter
     *
     * @param feesManager
     *
     */
    function setGovernanceMessageEmitter(address governanceMessageEmitter) external;

    /*
     * @notice Resume a sentinel after a slashing happens. If a staking sentinel does not have enought PNT at stake
     *         it should call increaseSentinelStakedAmount before calling this fx.
     *
     * @param owner
     * @param signature
     *
     */
    function resumeSentinel(address owner, bytes calldata signature) external;

    /*
     * @notice Slash a sentinel or a guardian. This function is callable only by the PNetworkHub
     *
     * @param actor
     * @param proof
     * @param amount
     * @param challenger
     *
     */
    function slash(address actor, bytes32[] calldata proof, uint256 amount, address challenger) external;

    /*
     * @notice Return the total number of guardians in a specific epoch.
     *
     * @param epoch
     *
     * @return uint256 the total number of guardians in a specific epoch.
     */
    function totalNumberOfGuardiansByEpoch(uint16 epoch) external view returns (uint16);

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
     * @notice Update guardians registrations. UPDATE_GUARDIAN_REGISTRATION_ROLE is needed to call this function
     *
     * @param owners
     * @param numbersOfEpochs
     * @param guardians
     *
     */
    function updateGuardiansRegistrations(
        address[] calldata owners,
        uint16[] calldata numbersOfEpochs,
        address[] calldata guardians
    ) external;

    /*
     * @notice Update a guardian registration. UPDATE_GUARDIAN_REGISTRATION_ROLE is needed to call this function
     *
     * @param owners
     * @param numbersOfEpochs
     * @param guardians
     *
     */
    function updateGuardianRegistration(address owner, uint16 numberOfEpochs, address guardian) external;

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
